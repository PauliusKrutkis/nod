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

#[tauri::command]
pub async fn set_ai_config(
    app: AppHandle,
    base_url: String,
    api_key: String,
    model: Option<String>,
) -> Result<AiInfo, String> {
    let base_url = normalize_base_url(&base_url);
    if !base_url.starts_with("http") {
        return Err("the base URL must start with http(s)://".to_string());
    }
    let api_key = api_key.trim().to_string();
    if api_key.is_empty() {
        return Err("the API key is empty".to_string());
    }
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

/// Nexos annotates each model with an `endpoints` list; when present, models
/// that can't serve `chat_completion` are dropped. Generic providers without
/// the field keep everything.
fn supports_chat(model: &Value) -> bool {
    let Some(endpoints) = model.get("endpoints").and_then(Value::as_array) else {
        return true;
    };
    endpoints
        .iter()
        .any(|e| e.as_str() == Some("chat_completion"))
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

#[cfg(test)]
#[path = "ai_tests.rs"]
mod tests;
