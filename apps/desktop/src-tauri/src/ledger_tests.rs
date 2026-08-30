use serde_json::json;

use super::{split_key, unnumbered_topics, LedgerRepo};

#[test]
fn split_key_takes_exactly_owner_slash_repo() {
    assert_eq!(
        split_key("acme/rocket"),
        Ok(("acme".to_string(), "rocket".to_string()))
    );
    assert!(split_key("acmerocket").is_err());
    assert_eq!(
        split_key("acme/rocket/extra"),
        Ok(("acme".to_string(), "rocket/extra".to_string()))
    );
}

#[test]
fn unnumbered_topics_picks_null_numbers_and_skips_buckets() {
    let status = json!({
        "topics": [
            { "id": "repo-store", "number": null },
            { "id": "ledger", "number": 1 },
            { "id": "#363", "number": null },
            { "id": "c3860f8", "number": null },
            { "id": "chat-panel", "number": null },
        ]
    });
    assert_eq!(
        unnumbered_topics(&status),
        vec!["repo-store".to_string(), "chat-panel".to_string()]
    );
    assert!(unnumbered_topics(&json!({})).is_empty());
    assert!(unnumbered_topics(&json!({ "topics": [] })).is_empty());
}

#[test]
fn out_paths_never_collide() {
    let repo = LedgerRepo {
        git_dir: std::path::PathBuf::from("/tmp/git"),
        tip: "t1".to_string(),
        state_dir: std::path::PathBuf::from("/tmp/state"),
        actor: "me".to_string(),
    };
    assert_ne!(repo.out_path(), repo.out_path());
}
