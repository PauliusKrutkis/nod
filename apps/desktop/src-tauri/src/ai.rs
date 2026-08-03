//! BYOK AI provider configuration. The key lives in `ai.json` beside the host
//! tokens and, like them, never crosses into the webview: commands return a
//! key-free `AiInfo`, and every request to the provider is made from Rust.
//! The provider contract is OpenAI-compatible (base URL + bearer key), which
//! covers Nexos AI, OpenRouter and most gateways with one implementation —
//! see docs/AI.md.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter};

use crate::accounts;
use crate::http::{fopt_u64, net_err};
use crate::snapshot::search as snapshot_search;
use crate::snapshot::store::{self as snapshot_store, SnapshotKey};
use crate::storage;

const AI_FILE: &str = "ai.json";

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AiConfig {
    /// Provider base, e.g. "https://api.nexos.ai" — `/v1/…` is appended.
    pub base_url: String,
    pub api_key: String,
    #[serde(default)]
    pub model: Option<String>,
}

/// Key-free view of the config, safe to ship to the webview.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AiInfo {
    pub configured: bool,
    pub base_url: Option<String>,
    pub model: Option<String>,
}

#[derive(Serialize, Clone, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AiModel {
    pub id: String,
    pub context_length: Option<u64>,
}

fn info_of(config: Option<&AiConfig>) -> AiInfo {
    match config {
        Some(c) => AiInfo {
            configured: true,
            base_url: Some(c.base_url.clone()),
            model: c.model.clone(),
        },
        None => AiInfo {
            configured: false,
            base_url: None,
            model: None,
        },
    }
}

/// Trims and drops trailing slashes so request URLs never double up.
fn normalize_base_url(raw: &str) -> String {
    raw.trim().trim_end_matches('/').to_string()
}

pub fn load(app: &AppHandle) -> Result<Option<AiConfig>, String> {
    storage::read_json::<AiConfig>(app, AI_FILE)
}

#[tauri::command]
pub async fn get_ai_config(app: AppHandle) -> Result<AiInfo, String> {
    Ok(info_of(load(&app)?.as_ref()))
}

/// The webview never gets the key back, so editing the config can't round-trip
/// it: an empty pasted key keeps the stored one, letting the model or base URL
/// change without re-pasting.
fn resolve_api_key(pasted: &str, existing: Option<AiConfig>) -> Result<String, String> {
    let pasted = pasted.trim();
    if !pasted.is_empty() {
        return Ok(pasted.to_string());
    }
    existing
        .map(|c| c.api_key)
        .ok_or_else(|| "the API key is empty".to_string())
}

#[tauri::command]
pub async fn set_ai_config(
    app: AppHandle,
    base_url: String,
    api_key: String,
    model: Option<String>,
) -> Result<AiInfo, String> {
    let base_url = normalize_base_url(&base_url);
    if !(base_url.starts_with("http://") || base_url.starts_with("https://")) {
        return Err("the base URL must start with http(s)://".to_string());
    }
    let api_key = resolve_api_key(&api_key, load(&app)?)?;
    let config = AiConfig {
        base_url,
        api_key,
        model: model
            .map(|m| m.trim().to_string())
            .filter(|m| !m.is_empty()),
    };
    storage::write_json(&app, AI_FILE, &config)?;
    Ok(info_of(Some(&config)))
}

#[tauri::command]
pub async fn clear_ai_config(app: AppHandle) -> Result<(), String> {
    storage::remove_file(&app, AI_FILE)
}

/// Dedicated client: every forge client bakes its provider's auth header in,
/// so the AI provider gets its own, with the key attached per request.
fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent("pr-flow")
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("could not build AI client: {e}"))
}

/// OpenAI-shape errors are `{"error":{"message":…}}`; some gateways use a
/// top-level `message`. Fall back to the raw body — statuses beyond 400/402/500
/// are undocumented on Nexos, so nothing here switches on the code.
fn extract_error_message(v: &Value) -> Option<String> {
    v.get("error")
        .and_then(|e| e.get("message"))
        .and_then(Value::as_str)
        .or_else(|| v.get("message").and_then(Value::as_str))
        .map(str::to_string)
}

fn provider_error(status: u16, text: &str) -> String {
    let parsed = serde_json::from_str::<Value>(text).ok();
    let msg = parsed
        .as_ref()
        .and_then(extract_error_message)
        .unwrap_or_else(|| text.to_string());
    format!("AI provider error ({status}): {msg}")
}

async fn read_ai_body(resp: reqwest::Response) -> Result<Value, String> {
    let status = resp.status();
    let text = resp.text().await.map_err(net_err)?;
    if !status.is_success() {
        return Err(provider_error(status.as_u16(), &text));
    }
    serde_json::from_str::<Value>(&text).map_err(|e| format!("could not parse AI response: {e}"))
}

/// Nexos annotates each model with an `endpoints` list; when it is a list of
/// strings, models that can't serve `chat_completion` are dropped. A missing
/// field or an unrecognized shape keeps the model — the entry shape is not
/// formally documented, so degrading means "show everything", never an
/// inexplicably empty picker.
fn supports_chat(model: &Value) -> bool {
    let Some(endpoints) = model.get("endpoints").and_then(Value::as_array) else {
        return true;
    };
    let names: Vec<&str> = endpoints.iter().filter_map(Value::as_str).collect();
    if names.is_empty() {
        return true;
    }
    names.contains(&"chat_completion")
}

fn parse_models(body: &Value) -> Vec<AiModel> {
    let Some(data) = body.get("data").and_then(Value::as_array) else {
        return Vec::new();
    };
    data.iter()
        .filter_map(|m| {
            if !supports_chat(m) {
                return None;
            }
            let id = m.get("id").and_then(Value::as_str)?;
            Some(AiModel {
                id: id.to_string(),
                context_length: fopt_u64(m, "context_length"),
            })
        })
        .collect()
}

#[tauri::command]
pub async fn ai_list_models(app: AppHandle) -> Result<Vec<AiModel>, String> {
    let config = load(&app)?.ok_or_else(|| "AI is not configured".to_string())?;
    let resp = client()?
        .get(format!("{}/v1/models", config.base_url))
        .bearer_auth(&config.api_key)
        .send()
        .await
        .map_err(net_err)?;
    let body = read_ai_body(resp).await?;
    Ok(parse_models(&body))
}

#[derive(Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct AskContext {
    pub pr_title: String,
    #[serde(default)]
    pub pr_body: String,
    #[serde(default)]
    pub file_path: Option<String>,
    #[serde(default)]
    pub line_range: Option<String>,
    #[serde(default)]
    pub code: Option<String>,
    #[serde(default)]
    pub diff_summary: Option<String>,
    #[serde(default)]
    pub owner: Option<String>,
    #[serde(default)]
    pub repo: Option<String>,
    #[serde(default)]
    pub head_sha: Option<String>,
}

const ASK_SYSTEM_PROMPT: &str =
    "You are the code assistant inside Nod, a pull-request review app. \
Answer questions about the code under review. Ground every claim in the provided code; \
when you reference code, cite it as path:line. Be concise. \
If the provided context is not enough to answer, say exactly what is missing.";

const ASK_TOOLS_SYSTEM_PROMPT: &str =
    "You are the code assistant inside Nod, a pull-request review app. \
You have tools over a local snapshot of the repository at the PR's head commit: \
list_files, read_file (numbered lines), and grep_repo (literal, case-sensitive). \
Use them to ground answers in real code instead of guessing — look up definitions, \
callers, and context beyond the diff. Cite code as path:line. Be concise. \
If something is unknowable from the repository, say exactly what is missing.";

fn build_ask_prompt(question: &str, context: &AskContext) -> String {
    let mut sections = vec![format!("Pull request: {}", context.pr_title)];
    if !context.pr_body.trim().is_empty() {
        sections.push(format!("PR description:\n{}", context.pr_body.trim()));
    }
    if let Some(summary) = context.diff_summary.as_deref() {
        sections.push(format!("Changed files:\n{summary}"));
    }
    if let (Some(path), Some(code)) = (context.file_path.as_deref(), context.code.as_deref()) {
        let range = context.line_range.as_deref().unwrap_or_default();
        let heading = if range.is_empty() {
            format!("Selected code from {path}:")
        } else {
            format!("Selected code from {path} (lines {range}):")
        };
        sections.push(format!("{heading}\n```\n{code}\n```"));
    }
    sections.push(format!("Question: {question}"));
    sections.join("\n\n")
}

const MAX_TOOL_ROUNDS: usize = 8;

/// One assistant message assembled from SSE chunks. The wire shape was
/// verified against a live key (docs/AI.md § Probe findings): content arrives
/// as `delta.content` string pieces; tool calls arrive fragmented by `index`,
/// the first fragment carrying `id`/`name` and later ones appending
/// `arguments` pieces.
#[derive(Default)]
struct StreamedMessage {
    content: String,
    tool_calls: Vec<Value>,
}

impl StreamedMessage {
    fn into_message(self) -> Value {
        let mut message = serde_json::json!({
            "role": "assistant",
            "content": self.content,
        });
        if !self.tool_calls.is_empty() {
            message["tool_calls"] = Value::Array(self.tool_calls);
        }
        message
    }
}

fn empty_tool_call() -> Value {
    serde_json::json!({
        "id": "",
        "type": "function",
        "function": { "name": "", "arguments": "" }
    })
}

fn merge_tool_call_fragment(acc: &mut StreamedMessage, fragment: &Value) {
    let index = fragment
        .get("index")
        .and_then(Value::as_u64)
        .unwrap_or(acc.tool_calls.len().saturating_sub(1) as u64) as usize;
    while acc.tool_calls.len() <= index {
        acc.tool_calls.push(empty_tool_call());
    }
    let call = &mut acc.tool_calls[index];
    if let Some(id) = fragment.get("id").and_then(Value::as_str) {
        call["id"] = Value::String(id.to_string());
    }
    if let Some(name) = fragment.pointer("/function/name").and_then(Value::as_str) {
        call["function"]["name"] = Value::String(name.to_string());
    }
    if let Some(piece) = fragment
        .pointer("/function/arguments")
        .and_then(Value::as_str)
    {
        let joined = format!(
            "{}{piece}",
            call["function"]["arguments"].as_str().unwrap_or_default()
        );
        call["function"]["arguments"] = Value::String(joined);
    }
}

/// Applies one SSE line to the accumulator; returns the content piece the
/// line carried, if any. Non-data lines, `[DONE]`, and unknown fields are
/// ignored — chunks may carry extra keys (`provider`, usage costs).
fn apply_stream_line(acc: &mut StreamedMessage, line: &str) -> Option<String> {
    let payload = line.strip_prefix("data:")?.trim();
    if payload.is_empty() || payload == "[DONE]" {
        return None;
    }
    let chunk: Value = serde_json::from_str(payload).ok()?;
    let delta = chunk.pointer("/choices/0/delta")?;
    if let Some(fragments) = delta.get("tool_calls").and_then(Value::as_array) {
        for fragment in fragments {
            merge_tool_call_fragment(acc, fragment);
        }
    }
    let piece = delta.get("content").and_then(Value::as_str)?;
    if piece.is_empty() {
        return None;
    }
    acc.content.push_str(piece);
    Some(piece.to_string())
}

async fn stream_chat(
    client: &reqwest::Client,
    url: &str,
    api_key: &str,
    body: &Value,
    mut on_delta: impl FnMut(&str),
) -> Result<Value, String> {
    use futures_util::StreamExt;

    let resp = client
        .post(url)
        .bearer_auth(api_key)
        .json(body)
        .send()
        .await
        .map_err(net_err)?;
    let status = resp.status();
    if !status.is_success() {
        let text = resp.text().await.map_err(net_err)?;
        return Err(provider_error(status.as_u16(), &text));
    }
    let mut acc = StreamedMessage::default();
    let mut buffer = String::new();
    let mut chunks = resp.bytes_stream();
    while let Some(chunk) = chunks.next().await {
        let bytes = chunk.map_err(net_err)?;
        buffer.push_str(&String::from_utf8_lossy(&bytes));
        while let Some(newline) = buffer.find('\n') {
            let line = buffer[..newline].trim_end_matches('\r').to_string();
            buffer.drain(..=newline);
            if let Some(piece) = apply_stream_line(&mut acc, &line) {
                on_delta(&piece);
            }
        }
    }
    if let Some(piece) = apply_stream_line(&mut acc, buffer.trim_end_matches('\r')) {
        on_delta(&piece);
    }
    Ok(acc.into_message())
}

fn ask_tools() -> Value {
    serde_json::json!([
        {
            "type": "function",
            "function": {
                "name": "list_files",
                "description": "List the repository's file paths. Optionally filter to paths containing a substring.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path_contains": { "type": "string", "description": "Only paths containing this substring." }
                    }
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "read_file",
                "description": "Read a slice of one file, returned as 'lineNumber: text' lines (max 400 lines per call).",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string" },
                        "start_line": { "type": "integer", "description": "1-based first line (default 1)." },
                        "end_line": { "type": "integer", "description": "1-based last line (default start + 399)." }
                    },
                    "required": ["path"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "grep_repo",
                "description": "Search every file for a literal, case-sensitive string. Returns 'path:line: text' matches (max 200).",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "pattern": { "type": "string" },
                        "path_contains": { "type": "string", "description": "Only search paths containing this substring." }
                    },
                    "required": ["pattern"]
                }
            }
        }
    ])
}

fn format_listing(listing: snapshot_search::FileListing) -> String {
    let mut out = listing.files.join("\n");
    if listing.truncated {
        out.push_str("\n[truncated — more files exist; narrow with path_contains]");
    }
    if out.is_empty() {
        "(no matching files)".to_string()
    } else {
        out
    }
}

fn format_grep(result: snapshot_search::GrepResult) -> String {
    if result.hits.is_empty() {
        return "(no matches)".to_string();
    }
    let mut out: Vec<String> = result
        .hits
        .into_iter()
        .map(|h| format!("{}:{}: {}", h.path, h.line, h.text))
        .collect();
    if result.truncated {
        out.push("[truncated — more matches exist; narrow the pattern]".to_string());
    }
    out.join("\n")
}

/// Runs one tool call against the local snapshot. Always returns text — an
/// unknown tool or bad arguments become an error string the model can read
/// and correct, never a failed request.
fn execute_tool(root: &std::path::Path, key: &SnapshotKey, name: &str, arguments: &str) -> String {
    let args: Value = serde_json::from_str(arguments).unwrap_or(Value::Null);
    let path_contains = args.get("path_contains").and_then(Value::as_str);
    match name {
        "list_files" => snapshot_search::list_files(root, key, path_contains)
            .map(format_listing)
            .unwrap_or_else(|| "error: repository snapshot is not available".to_string()),
        "grep_repo" => match args.get("pattern").and_then(Value::as_str) {
            Some(pattern) => snapshot_search::grep(root, key, pattern, path_contains)
                .map(format_grep)
                .unwrap_or_else(|| "error: repository snapshot is not available".to_string()),
            None => "error: grep_repo requires a string 'pattern'".to_string(),
        },
        "read_file" => match args.get("path").and_then(Value::as_str) {
            Some(path) => {
                let start = args
                    .get("start_line")
                    .and_then(Value::as_u64)
                    .unwrap_or(1)
                    .max(1) as usize;
                let end = args
                    .get("end_line")
                    .and_then(Value::as_u64)
                    .map(|e| e as usize)
                    .unwrap_or(start + snapshot_search::MAX_READ_LINES - 1);
                snapshot_search::read_file_slice(root, key, path, start, end).unwrap_or_else(|| {
                    "error: file not found, binary, or too large — check the path with list_files"
                        .to_string()
                })
            }
            None => "error: read_file requires a string 'path'".to_string(),
        },
        _ => format!("error: unknown tool '{name}'"),
    }
}

/// The snapshot the ask can ground itself in — present only when the context
/// names a commit and layer 1 has finished extracting it.
async fn ready_snapshot(
    app: &AppHandle,
    context: &AskContext,
) -> Option<(std::path::PathBuf, SnapshotKey)> {
    let (owner, repo, sha) = match (&context.owner, &context.repo, &context.head_sha) {
        (Some(o), Some(r), Some(s)) => (o.clone(), r.clone(), s.clone()),
        _ => return None,
    };
    let account = accounts::active_account(app).await.ok()?;
    let key = SnapshotKey {
        host: account.host,
        owner,
        repo,
        sha,
    };
    let root = storage::cache_dir(app).ok()?;
    if !snapshot_store::is_ready(&root, &key) {
        return None;
    }
    Some((root, key))
}

fn tool_result_messages(
    root: std::path::PathBuf,
    key: SnapshotKey,
    calls: Vec<Value>,
) -> Vec<Value> {
    calls
        .iter()
        .map(|call| {
            let id = call.get("id").and_then(Value::as_str).unwrap_or_default();
            let name = call
                .pointer("/function/name")
                .and_then(Value::as_str)
                .unwrap_or_default();
            let arguments = call
                .pointer("/function/arguments")
                .and_then(Value::as_str)
                .unwrap_or("{}");
            serde_json::json!({
                "role": "tool",
                "tool_call_id": id,
                "content": execute_tool(&root, &key, name, arguments),
            })
        })
        .collect()
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct AskDelta {
    ask_id: String,
    text: String,
}

fn message_answer(message: &Value) -> Option<String> {
    let content = message.get("content").and_then(Value::as_str)?.trim();
    if content.is_empty() {
        return None;
    }
    Some(content.to_string())
}

#[tauri::command]
pub async fn ai_ask(
    app: AppHandle,
    question: String,
    context: AskContext,
    ask_id: Option<String>,
) -> Result<String, String> {
    let config = load(&app)?.ok_or_else(|| "AI is not configured".to_string())?;
    let model = config
        .model
        .ok_or_else(|| "Choose a model in AI settings first".to_string())?;
    let snapshot = ready_snapshot(&app, &context).await;
    let system = if snapshot.is_some() {
        ASK_TOOLS_SYSTEM_PROMPT
    } else {
        ASK_SYSTEM_PROMPT
    };
    let mut messages = vec![
        serde_json::json!({ "role": "system", "content": system }),
        serde_json::json!({ "role": "user", "content": build_ask_prompt(&question, &context) }),
    ];
    let client = ask_client()?;
    let url = format!("{}/v1/chat/completions", config.base_url);
    let mut tools_enabled = snapshot.is_some();
    let mut rounds = 0;
    loop {
        let mut body = serde_json::json!({
            "model": model,
            "messages": messages,
            "max_completion_tokens": 2000,
            "stream": true,
        });
        if tools_enabled {
            body["tools"] = ask_tools();
            if rounds >= MAX_TOOL_ROUNDS {
                body["tool_choice"] = serde_json::json!("none");
            }
        }
        let emit_delta = |piece: &str| {
            if let Some(id) = &ask_id {
                let _ = app.emit(
                    "ai-ask-delta",
                    AskDelta {
                        ask_id: id.clone(),
                        text: piece.to_string(),
                    },
                );
            }
        };
        let message = match stream_chat(&client, &url, &config.api_key, &body, emit_delta).await {
            Ok(message) => message,
            Err(error)
                if tools_enabled && rounds == 0 && error.starts_with("AI provider error (4") =>
            {
                tools_enabled = false;
                continue;
            }
            Err(error) => return Err(error),
        };
        let calls: Vec<Value> = message
            .get("tool_calls")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        let Some((root, key)) = snapshot.clone().filter(|_| !calls.is_empty()) else {
            return message_answer(&message)
                .ok_or_else(|| "The provider returned an empty answer.".to_string());
        };
        if rounds > MAX_TOOL_ROUNDS {
            return Err("The model kept requesting tools past the limit.".to_string());
        }
        messages.push(message);
        let results =
            tauri::async_runtime::spawn_blocking(move || tool_result_messages(root, key, calls))
                .await
                .map_err(|e| format!("tool execution failed: {e}"))?;
        messages.extend(results);
        rounds += 1;
    }
}

/// Completions get a longer timeout than the metadata calls: a big-model
/// answer can legitimately take a minute.
fn ask_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent("pr-flow")
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| format!("could not build AI client: {e}"))
}

#[cfg(test)]
#[path = "ai_tests.rs"]
mod tests;
