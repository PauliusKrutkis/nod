use super::*;

fn resolve_verb(resolved: bool) -> QueueVerb {
    QueueVerb::Resolve {
        resolved,
        thread_id: "T1".to_string(),
    }
}

fn comment_verb() -> QueueVerb {
    QueueVerb::Comment {
        body: "nit: naming".to_string(),
        commit_id: "abc".to_string(),
        line: 12,
        path: "src/a.ts".to_string(),
        side: "RIGHT".to_string(),
        start_line: None,
    }
}

#[test]
fn transport_failures_are_connectivity_errors() {
    assert!(is_connectivity_error(
        "network error: error sending request for url"
    ));
    assert!(!is_connectivity_error("API error (422): Validation Failed"));
    assert!(!is_connectivity_error("snapshot not ready"));
}

#[test]
fn resolving_an_already_resolved_thread_is_nothing_to_do() {
    let got = classify_replay_error(
        &resolve_verb(true),
        "API error (200): Thread has already been resolved",
    );
    assert_eq!(
        got,
        Classified::NothingToDo("someone had already resolved this thread".to_string())
    );
}

#[test]
fn unresolving_an_already_open_thread_is_nothing_to_do() {
    let got = classify_replay_error(&resolve_verb(false), "API error (403): Forbidden");
    assert!(matches!(got, Classified::Failed(_)));
    let got = classify_replay_error(&resolve_verb(false), "already resolved");
    assert_eq!(
        got,
        Classified::NothingToDo("the thread was already back open".to_string())
    );
}

#[test]
fn a_moved_line_names_the_reason_in_plain_words() {
    let got = classify_replay_error(
        &comment_verb(),
        "API error (422): Validation Failed: line must be part of the diff",
    );
    assert_eq!(
        got,
        Classified::Failed("that line is no longer part of the diff on the host".to_string())
    );
}

#[test]
fn an_unrecognised_rejection_keeps_the_host_message() {
    let got = classify_replay_error(&comment_verb(), "API error (403): Forbidden");
    assert_eq!(
        got,
        Classified::Failed("API error (403): Forbidden".to_string())
    );
}

#[test]
fn a_lost_reply_parent_names_the_thread() {
    let verb = QueueVerb::Reply {
        body: "same".to_string(),
        in_reply_to: 9,
    };
    let got = classify_replay_error(&verb, "API error (404): Not Found");
    assert_eq!(
        got,
        Classified::Failed("the thread this replies to is gone from the host".to_string())
    );
}

#[test]
fn queue_items_roundtrip_through_serde() {
    let item = QueuedWrite {
        created_at: 1,
        failure: None,
        id: "w1-0".to_string(),
        number: 5,
        owner: "o".to_string(),
        repo: "r".to_string(),
        state: QueueState::Queued,
        verb: QueueVerb::SubmitReview {
            body: "lgtm".to_string(),
            comments: vec![],
            commit_id: "abc".to_string(),
            event: "APPROVE".to_string(),
        },
    };
    let json = serde_json::to_string(&item).expect("serialize");
    assert!(json.contains("\"kind\":\"submitReview\""));
    assert!(json.contains("\"createdAt\":1"));
    let back: QueuedWrite = serde_json::from_str(&json).expect("deserialize");
    assert!(matches!(back.verb, QueueVerb::SubmitReview { .. }));
    assert!(back.state == QueueState::Queued);
}

#[test]
fn the_online_flag_follows_marks() {
    mark_offline();
    assert!(!is_online());
    mark_online();
    assert!(is_online());
}
