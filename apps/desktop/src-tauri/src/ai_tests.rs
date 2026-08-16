use super::{
    apply_stream_line, build_ask_prompt, build_complete_prompt, clean_completion, completion_text,
    execute_tool, extract_error_message, info_of, message_answer, normalize_base_url, parse_models,
    resolve_api_key, AiConfig, AskContext, CompleteContext, StreamPiece, StreamedMessage,
};
use crate::snapshot::store::{partial_dir, promote, SnapshotKey};
use serde_json::json;
use std::path::PathBuf;

fn tool_snapshot(label: &str) -> (PathBuf, SnapshotKey) {
    let root = std::env::temp_dir().join(format!("nod-ai-{label}-{}", std::process::id()));
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
fn message_answer_trims_and_rejects_empty() {
    let ok = json!({ "role": "assistant", "content": "  It adds two. " });
    assert_eq!(message_answer(&ok), Some("It adds two.".to_string()));
    assert_eq!(message_answer(&json!({ "content": "   " })), None);
    assert_eq!(message_answer(&json!({})), None);
}

#[test]
fn stream_lines_accumulate_content_and_report_deltas() {
    let mut acc = StreamedMessage::default();
    let lines = [
        r#"data: {"choices":[{"delta":{"content":""},"index":0,"finish_reason":null}],"usage":{"nexos_credits_cost":0.0000528}}"#,
        r#"data: {"choices":[{"delta":{"content":"hello"},"index":0,"finish_reason":null}]}"#,
        r#"data: {"choices":[{"delta":{"content":" world"},"index":0,"finish_reason":null}]}"#,
        r#"data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}"#,
        "data: [DONE]",
    ];
    let deltas: Vec<Option<StreamPiece>> = lines
        .iter()
        .map(|l| apply_stream_line(&mut acc, l))
        .collect();

    assert_eq!(
        deltas[1].as_ref().and_then(|p| p.content.as_deref()),
        Some("hello")
    );
    assert_eq!(
        deltas[2].as_ref().and_then(|p| p.content.as_deref()),
        Some(" world")
    );
    assert!(deltas[0].is_none() && deltas[3].is_none() && deltas[4].is_none());

    let message = acc.into_message();
    assert_eq!(message["content"], "hello world");
    assert!(message.get("tool_calls").is_none());
}

#[test]
fn stream_lines_reassemble_fragmented_tool_calls() {
    let mut acc = StreamedMessage::default();
    let lines = [
        r#"data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"toolu_1","type":"function","function":{"name":"read_file","arguments":""}}]},"index":0}]}"#,
        r#"data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\"path\": \""}}]},"index":0}]}"#,
        r#"data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"src/main.rs\"}"}}]},"index":0}]}"#,
        r#"data: {"choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]}"#,
    ];
    for line in lines {
        assert!(apply_stream_line(&mut acc, line).is_none());
    }

    let message = acc.into_message();
    let call = &message["tool_calls"][0];
    assert_eq!(call["id"], "toolu_1");
    assert_eq!(call["function"]["name"], "read_file");
    assert_eq!(call["function"]["arguments"], "{\"path\": \"src/main.rs\"}");
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

#[test]
fn complete_prompt_carries_only_what_the_composer_knows() {
    let bare = build_complete_prompt("nit: this reads better as", &CompleteContext::default());
    assert_eq!(bare, "The reviewer has typed:\nnit: this reads better as");

    let anchored = build_complete_prompt(
        "this drops the",
        &CompleteContext {
            file_path: Some("src/retry.ts".to_string()),
            code: Some("const parsed = JSON.parse(body);".to_string()),
        },
    );
    assert!(anchored.starts_with("File: src/retry.ts\n"));
    assert!(anchored.contains("const parsed = JSON.parse(body);"));
    assert!(anchored.ends_with("The reviewer has typed:\nthis drops the"));
}

#[test]
fn completion_text_reads_the_first_choice_and_tolerates_junk() {
    let ok = json!({ "choices": [ { "message": { "content": " an early return." } } ] });
    assert_eq!(completion_text(&ok), Some(" an early return.".to_string()));

    assert_eq!(completion_text(&json!({ "choices": [] })), None);
    assert_eq!(completion_text(&json!({ "error": "nope" })), None);
    assert_eq!(
        completion_text(&json!({ "choices": [ { "message": {} } ] })),
        None
    );
}

#[test]
fn clean_completion_keeps_one_line_and_drops_a_repeated_prefix() {
    assert_eq!(
        clean_completion("an early return.", "Prefer "),
        "an early return."
    );

    // The model restated what was typed instead of continuing it.
    assert_eq!(
        clean_completion("Prefer an early return.", "Prefer "),
        "an early return."
    );
    assert_eq!(
        clean_completion("PREFER an early return.", "Prefer "),
        "an early return."
    );

    assert_eq!(clean_completion("\"quoted answer\"", "x"), "quoted answer");
    assert_eq!(
        clean_completion("first line\nsecond line", "x"),
        "first line"
    );
    assert_eq!(clean_completion("   ", "x"), "");
}

#[test]
fn clean_completion_refuses_an_essay() {
    let essay = "a".repeat(200);
    assert_eq!(clean_completion(&essay, "x"), "");
}

#[test]
fn reasoning_deltas_are_read_under_either_provider_key() {
    let mut acc = StreamedMessage::default();

    let nexos = apply_stream_line(
        &mut acc,
        r#"data: {"choices":[{"delta":{"reasoning_content":"weighing"}}]}"#,
    )
    .expect("reasoning piece");
    assert_eq!(nexos.reasoning.as_deref(), Some("weighing"));
    assert!(nexos.content.is_none());

    let openrouter = apply_stream_line(
        &mut acc,
        r#"data: {"choices":[{"delta":{"reasoning":"still weighing"}}]}"#,
    )
    .expect("reasoning piece");
    assert_eq!(openrouter.reasoning.as_deref(), Some("still weighing"));

    let both = apply_stream_line(
        &mut acc,
        r#"data: {"choices":[{"delta":{"content":"answer","reasoning_content":"done"}}]}"#,
    )
    .expect("piece");
    assert_eq!(both.content.as_deref(), Some("answer"));
    assert_eq!(both.reasoning.as_deref(), Some("done"));

    // Reasoning never joins the assistant message the model replays later.
    assert_eq!(acc.into_message()["content"], "answer");
}
