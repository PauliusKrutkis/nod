use super::{extract_error_message, info_of, normalize_base_url, parse_models, AiConfig};
use serde_json::json;

#[test]
fn normalize_base_url_trims_whitespace_and_trailing_slashes() {
    assert_eq!(
        normalize_base_url("  https://api.nexos.ai/  "),
        "https://api.nexos.ai"
    );
    assert_eq!(
        normalize_base_url("https://openrouter.ai/api//"),
        "https://openrouter.ai/api"
    );
    assert_eq!(
        normalize_base_url("https://api.nexos.ai"),
        "https://api.nexos.ai"
    );
}

#[test]
fn info_never_carries_the_key() {
    let config = AiConfig {
        base_url: "https://api.nexos.ai".to_string(),
        api_key: "nexos-secret".to_string(),
        model: Some("gpt-4o".to_string()),
    };

    let serialized = serde_json::to_string(&info_of(Some(&config))).expect("serialize");

    assert!(!serialized.contains("secret"));
    assert!(!serialized.contains("apiKey"));
    assert!(serialized.contains("\"configured\":true"));
    assert!(serialized.contains("\"model\":\"gpt-4o\""));
}

#[test]
fn info_of_nothing_reports_unconfigured() {
    let serialized = serde_json::to_string(&info_of(None)).expect("serialize");
    assert!(serialized.contains("\"configured\":false"));
}

#[test]
fn parse_models_filters_on_chat_endpoint_when_annotated() {
    let body = json!({
        "data": [
            { "id": "gpt-4o", "context_length": 128_000, "endpoints": ["chat_completion"] },
            { "id": "dall-e-3", "endpoints": ["image_generation"] },
            { "id": "no-endpoints-field", "context_length": 8192 },
        ]
    });

    let models = parse_models(&body);

    let ids: Vec<&str> = models.iter().map(|m| m.id.as_str()).collect();
    assert_eq!(ids, ["gpt-4o", "no-endpoints-field"]);
    assert_eq!(models[0].context_length, Some(128_000));
    assert_eq!(models[1].context_length, Some(8192));
}

#[test]
fn parse_models_keeps_models_when_endpoints_shape_is_unrecognized() {
    let object_entries = json!({
        "data": [
            { "id": "gpt-4o", "endpoints": [{ "type": "chat_completion" }] },
            { "id": "claude", "endpoints": [] },
        ]
    });

    let ids: Vec<String> = parse_models(&object_entries)
        .into_iter()
        .map(|m| m.id)
        .collect();

    assert_eq!(ids, ["gpt-4o", "claude"]);
}

#[test]
fn parse_models_tolerates_missing_or_malformed_data() {
    assert!(parse_models(&json!({})).is_empty());
    assert!(parse_models(&json!({ "data": "nope" })).is_empty());

    let missing_id = json!({ "data": [{ "context_length": 1 }] });
    assert!(parse_models(&missing_id).is_empty());
}

#[test]
fn extract_error_message_reads_openai_and_flat_shapes() {
    let openai = json!({ "error": { "message": "invalid api key" } });
    assert_eq!(
        extract_error_message(&openai),
        Some("invalid api key".to_string())
    );

    let flat = json!({ "message": "out of credits" });
    assert_eq!(
        extract_error_message(&flat),
        Some("out of credits".to_string())
    );

    assert_eq!(extract_error_message(&json!({ "detail": "?" })), None);
}
