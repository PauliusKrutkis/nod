//! Multi-turn AI chat over a pull request — the second AI surface
//! (docs/AI.md § Second surface). One `ai_chat` call is one turn: the
//! webview sends the settled conversation back each time (tool traffic is
//! never replayed), Rust assembles the request and streams the answer back
//! over three events keyed `{chatId, turnId}` — `ai-chat-delta` for content,
//! `ai-chat-tool` for tool activity, and (later) `ai-chat-proposal` for
//! suggested comments. The ask machinery in `ai.rs` is reused whole: the
//! same tool loop over the repo snapshot, the same 4xx-round-0 degradation
//! to tools-off, the same round guard. `ai_chat_cancel` flags a chat id in
//! managed state; the stream checks the flag between chunks and rounds and
//! returns the benign `cancelled` error, which is a stop button, not a
//! failure. History is trimmed oldest-first past a character budget so a
//! long conversation never grows the request without bound — the system
//! prompt and the current turn are never trimmed.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashSet;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};

use crate::ai::{self, AskContext};

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ChatTurn {
    pub role: String,
    pub content: String,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ChatRegion {
    pub file_path: String,
    pub line_range: String,
    pub code: String,
}

/// Chat ids whose in-flight turn should stop. A cancel outlives nothing: the
/// flag is cleared when the turn notices it, and a new turn clears any stale
/// flag on entry, so stopping an idle chat is a no-op.
#[derive(Default)]
pub struct ChatCancels(Mutex<HashSet<String>>);

impl ChatCancels {
    fn request(&self, chat_id: &str) {
        if let Ok(mut set) = self.0.lock() {
            set.insert(chat_id.to_string());
        }
    }

    fn requested(&self, chat_id: &str) -> bool {
        self.0
            .lock()
            .map(|set| set.contains(chat_id))
            .unwrap_or(false)
    }

    fn clear(&self, chat_id: &str) {
        if let Ok(mut set) = self.0.lock() {
            set.remove(chat_id);
        }
    }
}

const CHAT_SYSTEM_PROMPT: &str =
    "You are the review chat inside Nod, a pull-request review app. The reviewer \
is reading the pull request beside this conversation. Answer questions about the \
pull request and its code. Ground every claim in the provided code; when you \
reference code, cite it as path:line. Be concise. \
If the provided context is not enough to answer, say exactly what is missing.";

const CHAT_TOOLS_SYSTEM_PROMPT: &str =
    "You are the review chat inside Nod, a pull-request review app. The reviewer \
is reading the pull request beside this conversation. You have tools over a local \
snapshot of the repository at the PR's head commit: list_files, read_file \
(numbered lines), and grep_repo (literal, case-sensitive). Use them to ground \
answers in real code instead of guessing — look up definitions, callers, and \
context beyond the diff. Cite code as path:line. Be concise. \
If something is unknowable from the repository, say exactly what is missing.";

const CHAT_INPUT_CHAR_BUDGET: usize = 120_000;

/// Prior turns as wire messages, newest kept first when the budget bites.
/// Only user/assistant roles pass through — the webview can never smuggle a
/// system message into the conversation.
fn history_messages(history: &[ChatTurn], budget: usize) -> Vec<Value> {
    let mut kept: Vec<&ChatTurn> = Vec::new();
    let mut total = 0usize;
    for turn in history.iter().rev() {
        if !(turn.role == "user" || turn.role == "assistant") {
            continue;
        }
        total += turn.content.len();
        if total > budget {
            break;
        }
        kept.push(turn);
    }
    kept.reverse();
    kept.iter()
        .map(|turn| serde_json::json!({ "role": turn.role, "content": turn.content }))
        .collect()
}

/// The user message for this turn: PR context sections on the first turn
/// only (later turns already carry them in history), then one fenced block
/// per attached region, then the message itself.
fn build_chat_turn(
    message: &str,
    regions: &[ChatRegion],
    context: &AskContext,
    first_turn: bool,
) -> String {
    let mut sections: Vec<String> = Vec::new();
    if first_turn {
        sections.push(format!("Pull request: {}", context.pr_title));
        if !context.pr_body.trim().is_empty() {
            sections.push(format!("PR description:\n{}", context.pr_body.trim()));
        }
        if let Some(summary) = context.diff_summary.as_deref() {
            sections.push(format!("Changed files:\n{summary}"));
        }
    }
    for region in regions {
        let heading = if region.line_range.is_empty() {
            format!("Code from {}:", region.file_path)
        } else {
            format!(
                "Code from {} (lines {}):",
                region.file_path, region.line_range
            )
        };
        sections.push(format!("{heading}\n```\n{}\n```", region.code));
    }
    sections.push(message.to_string());
    sections.join("\n\n")
}

/// One human-readable line per tool call, shown in the transcript while the
/// round runs ("Searching for …"). Unknown tools and bad arguments still get
/// a line — the activity is visible even when the call is doomed.
fn tool_note(name: &str, arguments: &str) -> String {
    let args: Value = serde_json::from_str(arguments).unwrap_or(Value::Null);
    let path_contains = args.get("path_contains").and_then(Value::as_str);
    match name {
        "list_files" => match path_contains {
            Some(filter) => format!("Listing files matching \"{filter}\""),
            None => "Listing files".to_string(),
        },
        "grep_repo" => match args.get("pattern").and_then(Value::as_str) {
            Some(pattern) => format!("Searching for \"{pattern}\""),
            None => "Searching the repository".to_string(),
        },
        "read_file" => match args.get("path").and_then(Value::as_str) {
            Some(path) => match (
                args.get("start_line").and_then(Value::as_u64),
                args.get("end_line").and_then(Value::as_u64),
            ) {
                (Some(start), Some(end)) => format!("Reading {path} (lines {start}–{end})"),
                _ => format!("Reading {path}"),
            },
            None => "Reading a file".to_string(),
        },
        _ => format!("Running {name}"),
    }
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ChatDelta {
    chat_id: String,
    turn_id: String,
    text: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ChatToolNote {
    chat_id: String,
    turn_id: String,
    tool: String,
    detail: String,
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn ai_chat(
    app: AppHandle,
    state: State<'_, ChatCancels>,
    chat_id: String,
    turn_id: String,
    message: String,
    regions: Vec<ChatRegion>,
    history: Vec<ChatTurn>,
    context: AskContext,
) -> Result<String, String> {
    let config = ai::load(&app)?.ok_or_else(|| "AI is not configured".to_string())?;
    let model = config
        .model
        .ok_or_else(|| "Choose a model in AI settings first".to_string())?;
    state.clear(&chat_id);
    let snapshot = ai::ready_snapshot(&app, &context).await;
    let system = if snapshot.is_some() {
        CHAT_TOOLS_SYSTEM_PROMPT
    } else {
        CHAT_SYSTEM_PROMPT
    };
    let mut messages = vec![serde_json::json!({ "role": "system", "content": system })];
    messages.extend(history_messages(&history, CHAT_INPUT_CHAR_BUDGET));
    messages.push(serde_json::json!({
        "role": "user",
        "content": build_chat_turn(&message, &regions, &context, history.is_empty()),
    }));
    let client = ai::ask_client()?;
    let url = format!("{}/v1/chat/completions", config.base_url);
    let mut tools_enabled = snapshot.is_some();
    let mut rounds = 0;
    loop {
        if state.requested(&chat_id) {
            state.clear(&chat_id);
            return Err(ai::CANCELLED.to_string());
        }
        let mut body = serde_json::json!({
            "model": model,
            "messages": messages,
            "max_completion_tokens": 2000,
            "stream": true,
        });
        if tools_enabled {
            body["tools"] = ai::ask_tools();
            if rounds >= ai::MAX_TOOL_ROUNDS {
                body["tool_choice"] = serde_json::json!("none");
            }
        }
        let emit_delta = |piece: &str| {
            let _ = app.emit(
                "ai-chat-delta",
                ChatDelta {
                    chat_id: chat_id.clone(),
                    turn_id: turn_id.clone(),
                    text: piece.to_string(),
                },
            );
        };
        let should_stop = || state.requested(&chat_id);
        let message_value = match ai::stream_chat(
            &client,
            &url,
            &config.api_key,
            &body,
            emit_delta,
            should_stop,
        )
        .await
        {
            Ok(message) => message,
            Err(error) if error == ai::CANCELLED => {
                state.clear(&chat_id);
                return Err(error);
            }
            Err(error)
                if tools_enabled && rounds == 0 && error.starts_with("AI provider error (4") =>
            {
                tools_enabled = false;
                continue;
            }
            Err(error) => return Err(error),
        };
        let calls: Vec<Value> = message_value
            .get("tool_calls")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        let Some((root, key)) = snapshot.clone().filter(|_| !calls.is_empty()) else {
            return ai::message_answer(&message_value)
                .ok_or_else(|| "The provider returned an empty answer.".to_string());
        };
        if rounds > ai::MAX_TOOL_ROUNDS {
            return Err("The model kept requesting tools past the limit.".to_string());
        }
        for call in &calls {
            let name = call
                .pointer("/function/name")
                .and_then(Value::as_str)
                .unwrap_or_default();
            let arguments = call
                .pointer("/function/arguments")
                .and_then(Value::as_str)
                .unwrap_or("{}");
            let _ = app.emit(
                "ai-chat-tool",
                ChatToolNote {
                    chat_id: chat_id.clone(),
                    turn_id: turn_id.clone(),
                    tool: name.to_string(),
                    detail: tool_note(name, arguments),
                },
            );
        }
        messages.push(message_value);
        let results = tauri::async_runtime::spawn_blocking(move || {
            ai::tool_result_messages(root, key, calls)
        })
        .await
        .map_err(|e| format!("tool execution failed: {e}"))?;
        messages.extend(results);
        rounds += 1;
    }
}

#[tauri::command]
pub async fn ai_chat_cancel(state: State<'_, ChatCancels>, chat_id: String) -> Result<(), String> {
    state.request(&chat_id);
    Ok(())
}

#[cfg(test)]
#[path = "ai_chat_tests.rs"]
mod tests;
