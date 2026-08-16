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

/// The diff positions a comment may anchor to, one entry per (path, side),
/// computed by the webview from the patch with the same rules that gate the
/// composer. Ranges are inclusive, sorted, disjoint — a multi-line proposal
/// must sit inside one of them, which is also what the forges accept.
#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CommentableSide {
    pub path: String,
    pub side: String,
    pub ranges: Vec<(u32, u32)>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ChatProposal {
    pub path: String,
    pub side: String,
    pub line: u32,
    #[serde(default)]
    pub start_line: Option<u32>,
    pub body: String,
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

const CHAT_SYSTEM_BASE: &str =
    "You are the review chat inside Nod, a pull-request review app. The reviewer \
is reading the pull request beside this conversation. Answer questions about the \
pull request and its code. Ground every claim in the provided code; when you \
reference code, cite it as path:line. Be concise. \
If the provided context is not enough to answer, say exactly what is missing.";

const CHAT_SYSTEM_SNAPSHOT: &str =
    "You have tools over a local snapshot of the repository at the PR's head \
commit: list_files, read_file (numbered lines), and grep_repo (literal, \
case-sensitive). Use them to ground answers in real code instead of guessing — \
look up definitions, callers, and context beyond the diff.";

const CHAT_SYSTEM_PROPOSALS: &str =
    "You can stage suggested review comments with propose_comment. Only do so \
when the reviewer asked for review feedback (a review pass, a critique, 'leave \
comments'); never for an ordinary question. Suggestions appear in the diff for \
the reviewer to accept or discard — they are never posted directly. side is \
LEFT for deleted lines and RIGHT for added or unchanged lines, and the line \
numbers must fall inside the diff.";

fn chat_system_prompt(snapshot_ready: bool, proposals: bool) -> String {
    let mut parts = vec![CHAT_SYSTEM_BASE];
    if snapshot_ready {
        parts.push(CHAT_SYSTEM_SNAPSHOT);
    }
    if proposals {
        parts.push(CHAT_SYSTEM_PROPOSALS);
    }
    parts.join(" ")
}

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

fn propose_comment_tool() -> Value {
    serde_json::json!({
        "type": "function",
        "function": {
            "name": "propose_comment",
            "description": "Stage a suggested review comment on a diff line. The reviewer accepts, edits or discards it — it is never posted directly. Only call this when the reviewer asked for review feedback.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "File path exactly as it appears in the diff." },
                    "side": { "type": "string", "enum": ["LEFT", "RIGHT"], "description": "LEFT for deleted lines, RIGHT for added or unchanged lines." },
                    "line": { "type": "integer", "description": "The line the comment anchors to (the range end for multi-line)." },
                    "start_line": { "type": "integer", "description": "First line of a multi-line comment; must be ≤ line and in the same contiguous diff range." },
                    "body": { "type": "string", "description": "The comment, as markdown. A ```suggestion fence proposes replacement code." }
                },
                "required": ["path", "side", "line", "body"]
            }
        }
    })
}

fn chat_tools(snapshot_ready: bool, proposals: bool) -> Value {
    let mut tools = if snapshot_ready {
        ai::ask_tools().as_array().cloned().unwrap_or_default()
    } else {
        Vec::new()
    };
    if proposals {
        tools.push(propose_comment_tool());
    }
    Value::Array(tools)
}

fn format_ranges(ranges: &[(u32, u32)]) -> String {
    ranges
        .iter()
        .map(|(a, b)| {
            if a == b {
                a.to_string()
            } else {
                format!("{a}–{b}")
            }
        })
        .collect::<Vec<_>>()
        .join(", ")
}

/// Reads a propose_comment call's arguments into a proposal, rejecting what
/// serde alone would let through: a side beyond LEFT/RIGHT and an empty body.
fn parse_proposal(arguments: &str) -> Result<ChatProposal, String> {
    let proposal: ChatProposal = serde_json::from_str(arguments)
        .map_err(|e| format!("error: propose_comment arguments did not parse: {e}"))?;
    if !(proposal.side == "LEFT" || proposal.side == "RIGHT") {
        return Err("error: side must be LEFT or RIGHT".to_string());
    }
    if proposal.body.trim().is_empty() {
        return Err("error: body must not be empty".to_string());
    }
    Ok(proposal)
}

/// The validity oracle, mirroring the webview's composer rules: the whole
/// span must sit inside one contiguous commentable range on one side. A miss
/// answers with the ranges that would work, so the model can correct itself
/// within the same turn.
fn validate_proposal(
    commentable: &[CommentableSide],
    proposal: &ChatProposal,
) -> Result<(), String> {
    let start = proposal.start_line.unwrap_or(proposal.line);
    if start > proposal.line {
        return Err(format!(
            "error: start_line {start} is past line {} — start_line must be ≤ line",
            proposal.line
        ));
    }
    let Some(entry) = commentable
        .iter()
        .find(|c| c.path == proposal.path && c.side == proposal.side)
    else {
        let other = commentable.iter().find(|c| c.path == proposal.path);
        return Err(match other {
            Some(o) => format!(
                "error: {} has no commentable {} lines in this diff — commentable {} ranges: {}",
                proposal.path,
                proposal.side,
                o.side,
                format_ranges(&o.ranges)
            ),
            None => format!("error: {} is not part of this diff", proposal.path),
        });
    };
    let fits = entry
        .ranges
        .iter()
        .any(|(a, b)| *a <= start && proposal.line <= *b);
    if fits {
        Ok(())
    } else {
        Err(format!(
            "error: {} lines {}–{} ({}) are not commentable in this diff — commentable {} ranges: {}",
            proposal.path,
            start,
            proposal.line,
            proposal.side,
            proposal.side,
            format_ranges(&entry.ranges)
        ))
    }
}

/// One human-readable line per tool call, shown in the transcript while the
/// round runs ("Searching for …"). Unknown tools and bad arguments still get
/// a line — the activity is visible even when the call is doomed.
fn tool_note(name: &str, arguments: &str) -> String {
    let args: Value = serde_json::from_str(arguments).unwrap_or(Value::Null);
    let path_contains = args.get("path_contains").and_then(Value::as_str);
    match name {
        "propose_comment" => match (
            args.get("path").and_then(Value::as_str),
            args.get("line").and_then(Value::as_u64),
        ) {
            (Some(path), Some(line)) => format!("Suggesting a comment on {path}:{line}"),
            _ => "Suggesting a comment".to_string(),
        },
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

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ChatProposalEvent {
    chat_id: String,
    turn_id: String,
    proposal: ChatProposal,
}

/// Validates and, when valid, emits the proposal to the webview to stage.
/// Either way the return is the tool result the model reads.
fn run_propose_comment(
    app: &AppHandle,
    commentable: &[CommentableSide],
    chat_id: &str,
    turn_id: &str,
    arguments: &str,
) -> String {
    let proposal = match parse_proposal(arguments) {
        Ok(p) => p,
        Err(e) => return e,
    };
    if let Err(e) = validate_proposal(commentable, &proposal) {
        return e;
    }
    let label = format!("staged: {}:{}", proposal.path, proposal.line);
    let _ = app.emit(
        "ai-chat-proposal",
        ChatProposalEvent {
            chat_id: chat_id.to_string(),
            turn_id: turn_id.to_string(),
            proposal,
        },
    );
    label
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
    commentable: Vec<CommentableSide>,
) -> Result<String, String> {
    let config = ai::load(&app)?.ok_or_else(|| "AI is not configured".to_string())?;
    let model = config
        .model
        .ok_or_else(|| "Choose a model in AI settings first".to_string())?;
    state.clear(&chat_id);
    let snapshot = ai::ready_snapshot(&app, &context).await;
    let proposals = !commentable.is_empty();
    let system = chat_system_prompt(snapshot.is_some(), proposals);
    let mut messages = vec![serde_json::json!({ "role": "system", "content": system })];
    messages.extend(history_messages(&history, CHAT_INPUT_CHAR_BUDGET));
    messages.push(serde_json::json!({
        "role": "user",
        "content": build_chat_turn(&message, &regions, &context, history.is_empty()),
    }));
    let client = ai::ask_client()?;
    let url = format!("{}/v1/chat/completions", config.base_url);
    let mut tools_enabled = snapshot.is_some() || proposals;
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
            body["tools"] = chat_tools(snapshot.is_some(), proposals);
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
        if calls.is_empty() || !tools_enabled {
            return ai::message_answer(&message_value)
                .ok_or_else(|| "The provider returned an empty answer.".to_string());
        }
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
        for call in calls {
            let id = call
                .get("id")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string();
            let name = call
                .pointer("/function/name")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string();
            let arguments = call
                .pointer("/function/arguments")
                .and_then(Value::as_str)
                .unwrap_or("{}")
                .to_string();
            let content = if name == "propose_comment" {
                if proposals {
                    run_propose_comment(&app, &commentable, &chat_id, &turn_id, &arguments)
                } else {
                    "error: propose_comment is not available".to_string()
                }
            } else if let Some((root, key)) = snapshot.clone() {
                tauri::async_runtime::spawn_blocking(move || {
                    ai::execute_tool(&root, &key, &name, &arguments)
                })
                .await
                .map_err(|e| format!("tool execution failed: {e}"))?
            } else {
                "error: repository snapshot is not available".to_string()
            };
            messages.push(serde_json::json!({
                "role": "tool",
                "tool_call_id": id,
                "content": content,
            }));
        }
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
