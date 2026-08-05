use super::{
    answer_text, build_ask_prompt, execute_tool, extract_error_message, info_of,
    normalize_base_url, parse_models, resolve_api_key, AiConfig, AskContext,
};
use crate::snapshot::store::{partial_dir, promote, SnapshotKey};
use serde_json::json;
use std::path::PathBuf;

fn tool_snapshot(label: &str) -> (PathBuf, SnapshotKey) {
    let root = std::env::temp_dir().join(format!("prflow-ai-{label}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&root);
    std::fs::create_dir_all(&root).expect("temp root");
    let key = SnapshotKey {
        host: "https://github.com".to_string(),
        owner: "acme".to_string(),
        repo: "widget-app".to_string(),
        sha: "a1b2c3".to_string(),
    };
    for (path, contents) in [
        ("src/auth.rs", "fn login() {}\nfn logout() {}\n"),
        ("README.md", "hello\n"),
    ] {
        let target = partial_dir(&root, &key).join(path);
        std::fs::create_dir_all(target.parent().expect("parent")).expect("staging");
        std::fs::write(&target, contents).expect("write");
    }
    promote(&root, &key).expect("promote");
    (root, key)
}

#[test]
fn execute_tool_runs_each_tool_against_the_snapshot() {
    let (root, key) = tool_snapshot("tools");

    let listing = execute_tool(&root, &key, "list_files", r#"{"path_contains":"src/"}"#);
    assert_eq!(listing, "src/auth.rs");

    let matches = execute_tool(&root, &key, "grep_repo", r#"{"pattern":"login"}"#);
    assert_eq!(matches, "src/auth.rs:1: fn login() {}");

    let slice = execute_tool(
        &root,
        &key,
        "read_file",
        r#"{"path":"src/auth.rs","start_line":2,"end_line":2}"#,
    );
    assert_eq!(slice, "2: fn logout() {}");

    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn execute_tool_turns_mistakes_into_readable_errors() {
    let (root, key) = tool_snapshot("mistakes");

    assert!(execute_tool(&root, &key, "grep_repo", "{}").starts_with("error:"));
    assert!(execute_tool(&root, &key, "read_file", r#"{"path":"nope.rs"}"#).starts_with("error:"));
    assert!(execute_tool(&root, &key, "launch_missiles", "{}").starts_with("error:"));
    assert!(execute_tool(&root, &key, "read_file", "not json").starts_with("error:"));

    let _ = std::fs::remove_dir_all(&root);
}

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
fn ask_prompt_carries_selection_context_when_present() {
    let context = AskContext {
        code: Some("let x = 1;\nlet y = 2;".to_string()),
        file_path: Some("src/lib/math.ts".to_string()),
        line_range: Some("12–13".to_string()),
        pr_body: "Adds numbers.".to_string(),
        pr_title: "Add math".to_string(),
        ..AskContext::default()
    };

    let prompt = build_ask_prompt("Why two lets?", &context);

    assert!(prompt.starts_with("Pull request: Add math"));
    assert!(prompt.contains("PR description:\nAdds numbers."));
    assert!(prompt.contains("Selected code from src/lib/math.ts (lines 12–13):"));
    assert!(prompt.contains("let y = 2;"));
    assert!(prompt.ends_with("Question: Why two lets?"));
}

#[test]
fn ask_prompt_falls_back_to_the_diff_summary() {
    let context = AskContext {
        diff_summary: Some("src/a.ts (+3 -1)\nsrc/b.ts (+7 -0)".to_string()),
        pr_title: "Refactor".to_string(),
        ..AskContext::default()
    };

    let prompt = build_ask_prompt("What changed?", &context);

    assert!(prompt.contains("Changed files:\nsrc/a.ts (+3 -1)"));
    assert!(!prompt.contains("Selected code"));
    assert!(!prompt.contains("PR description"));
}

#[test]
fn answer_text_reads_the_first_choice_and_rejects_empty() {
    let ok = json!({ "choices": [{ "message": { "content": "  It adds two. " } }] });
    assert_eq!(answer_text(&ok), Some("It adds two.".to_string()));

    let empty = json!({ "choices": [{ "message": { "content": "   " } }] });
    assert_eq!(answer_text(&empty), None);
    assert_eq!(answer_text(&json!({ "choices": [] })), None);
}

#[test]
fn resolve_api_key_keeps_the_stored_key_when_paste_is_empty() {
    let existing = AiConfig {
        base_url: "https://api.nexos.ai".to_string(),
        api_key: "nexos-stored".to_string(),
        model: None,
    };

    assert_eq!(
        resolve_api_key("  ", Some(existing.clone())),
        Ok("nexos-stored".to_string())
    );
    assert_eq!(
        resolve_api_key("nexos-new", Some(existing)),
        Ok("nexos-new".to_string())
    );
    assert!(resolve_api_key("", None).is_err());
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
