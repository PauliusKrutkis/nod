//! BYOK AI provider configuration. The key lives in `ai.json` beside the host
//! tokens and, like them, never crosses into the webview: commands return a
//! key-free `AiInfo`, and every request to the provider is made from Rust.
//! The provider contract is OpenAI-compatible (base URL + bearer key), which
//! covers Nexos AI, OpenRouter and most gateways with one implementation —
//! see docs/AI.md.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::AppHandle;

use crate::http::{fopt_u64, net_err};
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

async fn read_ai_body(resp: reqwest::Response) -> Result<Value, String> {
    let status = resp.status();
    let text = resp.text().await.map_err(net_err)?;
    if !status.is_success() {
        let parsed = serde_json::from_str::<Value>(&text).ok();
        let msg = parsed
            .as_ref()
            .and_then(extract_error_message)
            .unwrap_or_else(|| text.clone());
        return Err(format!("AI provider error ({}): {}", status.as_u16(), msg));
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
}

const ASK_SYSTEM_PROMPT: &str =
    "You are the code assistant inside Nod, a pull-request review app. \
Answer questions about the code under review. Ground every claim in the provided code; \
when you reference code, cite it as path:line. Be concise. \
If the provided context is not enough to answer, say exactly what is missing.";

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

fn answer_text(v: &Value) -> Option<String> {
    let content = v
        .get("choices")?
        .get(0)?
        .get("message")?
        .get("content")?
        .as_str()?
        .trim();
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
) -> Result<String, String> {
    let config = load(&app)?.ok_or_else(|| "AI is not configured".to_string())?;
    let model = config
        .model
        .ok_or_else(|| "Choose a model in AI settings first".to_string())?;
    let body = serde_json::json!({
        "model": model,
        "messages": [
            { "role": "system", "content": ASK_SYSTEM_PROMPT },
            { "role": "user", "content": build_ask_prompt(&question, &context) },
        ],
        "max_completion_tokens": 2000,
    });
    let resp = ask_client()?
        .post(format!("{}/v1/chat/completions", config.base_url))
        .bearer_auth(&config.api_key)
        .json(&body)
        .send()
        .await
        .map_err(net_err)?;
    let value = read_ai_body(resp).await?;
    answer_text(&value).ok_or_else(|| "The provider returned an empty answer.".to_string())
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
