//! The ledger's LLM classification stage (docs/LEDGER.md §Productionization
//! item 4). `status` reports `unassigned` — post-epoch commits the
//! deterministic cascade could not name — and this module, fire-and-forget
//! after every successful status run, asks the configured model to map each
//! one to a feature topic and writes the answers back as agent `assigned`
//! facts through the sidecar. The queue regroups on the next status; the
//! webview hears `ledger-assignments` and refetches.
//!
//! Paid once per repo: assignments persist as facts, so a sha never comes
//! back once mapped. A per-process registry additionally remembers the tip
//! each repo was last attempted at — a model that returns garbage (or maps
//! only some shas) is not asked again until the tip moves, and two status
//! runs can never race two tasks for one repo. Keyless stays free: no AI
//! config, no task, and the deterministic stages stand alone.

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter};

use crate::ai;
use crate::ledger::LedgerRepo;

/// Work-list cap per attempt: enough for any realistic backlog while keeping
/// the prompt bounded; the remainder rides a later tip's attempt.
const MAX_ENTRIES: usize = 120;
/// A topic longer than this is not a name — treat it as model junk.
const MAX_TOPIC_CHARS: usize = 40;

const SYSTEM_PROMPT: &str = "You classify commits into feature topics for a \
code-review ledger. Reply with a single JSON object mapping every full commit \
sha to its topic — no prose, no markdown, no other keys.";

/// One unassigned commit, lifted out of the status JSON. Missing fields
/// become empties rather than dropping the entry: a sha with no subject is
/// still classifiable by its files.
struct UnassignedEntry {
    sha: String,
    subject: String,
    files: Vec<String>,
    lines: u64,
}

fn unassigned_entries(status: &Value) -> Vec<UnassignedEntry> {
    let Some(list) = status.get("unassigned").and_then(Value::as_array) else {
        return Vec::new();
    };
    list.iter()
        .filter_map(|entry| {
            let sha = entry.get("sha").and_then(Value::as_str)?;
            Some(UnassignedEntry {
                files: entry
                    .get("files")
                    .and_then(Value::as_array)
                    .map(|files| {
                        files
                            .iter()
                            .filter_map(Value::as_str)
                            .map(str::to_string)
                            .collect()
                    })
                    .unwrap_or_default(),
                lines: entry.get("lines").and_then(Value::as_u64).unwrap_or(0),
                sha: sha.to_string(),
                subject: entry
                    .get("subject")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string(),
            })
        })
        .collect()
}

fn topic_ids(status: &Value) -> Vec<String> {
    let Some(topics) = status.get("topics").and_then(Value::as_array) else {
        return Vec::new();
    };
    topics
        .iter()
        .filter_map(|t| t.get("id").and_then(Value::as_str))
        .map(str::to_string)
        .collect()
}

/// The user prompt: repo, existing topic names, and the work list (capped at
/// [`MAX_ENTRIES`]). Every instruction the parser depends on lives here.
fn build_prompt(repo_key: &str, topics: &[String], entries: &[UnassignedEntry]) -> String {
    let mut out = format!("Repository: {repo_key}\n\n");
    if topics.is_empty() {
        out.push_str("Existing topics: none yet.\n\n");
    } else {
        out.push_str(&format!("Existing topics: {}\n\n", topics.join(", ")));
    }
    out.push_str(
        "The commits below are merged work that no deterministic rule could \
name. For each, decide which feature it belongs to. Prefer reusing an \
existing topic when the work belongs there; otherwise invent a short \
kebab-case feature name (never a file path, never a commit type like \"fix\" \
or \"chore\"). Reply with one JSON object mapping the full sha of every \
commit to its topic — every sha must appear.\n\nCommits:\n",
    );
    for entry in entries.iter().take(MAX_ENTRIES) {
        out.push_str(&format!(
            "{} {} ({} lines)\n  files: {}\n",
            entry.sha,
            entry.subject,
            entry.lines,
            entry.files.join(", ")
        ));
    }
    out
}

/// The JSON object in the model's answer, tolerating the fences and preambles
/// models add despite instructions: the slice from the first `{` to the last
/// `}` is the candidate.
fn extract_object(raw: &str) -> Option<Value> {
    let start = raw.find('{')?;
    let end = raw.rfind('}')?;
    if end < start {
        return None;
    }
    serde_json::from_str(&raw[start..=end]).ok()
}

fn clean_topic(raw: &str) -> Option<String> {
    let topic = raw.trim();
    if topic.is_empty()
        || topic.chars().count() > MAX_TOPIC_CHARS
        || topic.chars().any(char::is_control)
    {
        return None;
    }
    Some(topic.to_string())
}

/// The model's mapping, reduced to what can be trusted: only shas that were
/// in the request survive, topics are trimmed, and empties, control
/// characters, and over-long names drop the pair. Order follows `requested`
/// so the sidecar call is deterministic.
fn parse_assignments(raw: &str, requested: &[String]) -> Vec<(String, String)> {
    let Some(Value::Object(mapping)) = extract_object(raw) else {
        return Vec::new();
    };
    requested
        .iter()
        .filter_map(|sha| {
            let topic = mapping.get(sha).and_then(Value::as_str)?;
            Some((sha.clone(), clean_topic(topic)?))
        })
        .collect()
}

/// Tip each repo was last attempted at; `None` while a task is in flight.
/// Success and failure both count as attempted — only a new tip re-arms.
fn registry() -> &'static Mutex<HashMap<String, Option<String>>> {
    static REGISTRY: OnceLock<Mutex<HashMap<String, Option<String>>>> = OnceLock::new();
    REGISTRY.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Claims the (repo, tip) attempt slot. False when a task is already in
/// flight for the repo or this tip was already attempted.
fn claim(repo_key: &str, tip: &str) -> bool {
    let Ok(mut attempts) = registry().lock() else {
        return false;
    };
    match attempts.get(repo_key) {
        Some(None) => false,
        Some(Some(attempted)) if attempted == tip => false,
        _ => {
            attempts.insert(repo_key.to_string(), None);
            true
        }
    }
}

fn settle(repo_key: &str, tip: &str) {
    if let Ok(mut attempts) = registry().lock() {
        attempts.insert(repo_key.to_string(), Some(tip.to_string()));
    }
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct AssignmentsPayload {
    repo_key: String,
}

/// Fire-and-forget from `ledger_status`: classify this status's unassigned
/// commits in the background, write the facts, nudge the webview. Returns
/// immediately; does nothing without unassigned work or an AI config.
pub fn propose(app: &AppHandle, repo_key: String, repo: LedgerRepo, status: &Value) {
    let entries = unassigned_entries(status);
    if entries.is_empty() {
        return;
    }
    let Ok(Some(config)) = ai::load(app) else {
        return;
    };
    let Some(model) = config.model.clone() else {
        return;
    };
    if !claim(&repo_key, repo.tip()) {
        return;
    }
    let topics = topic_ids(status);
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let tip = repo.tip().to_string();
        // Errors are swallowed on purpose: this is a background courtesy, and
        // the registry already ensures a failing provider is not hammered.
        let outcome = classify(&repo_key, repo, &config, &model, &topics, entries).await;
        settle(&repo_key, &tip);
        if let Ok(true) = outcome {
            let _ = app.emit(
                "ledger-assignments",
                AssignmentsPayload {
                    repo_key: repo_key.clone(),
                },
            );
        }
    });
}

/// One model round-trip plus the sidecar write. Ok(true) means at least one
/// assignment fact was written.
async fn classify(
    repo_key: &str,
    repo: LedgerRepo,
    config: &ai::AiConfig,
    model: &str,
    topics: &[String],
    entries: Vec<UnassignedEntry>,
) -> Result<bool, String> {
    let prompt = build_prompt(repo_key, topics, &entries);
    let body = serde_json::json!({
        "model": model,
        "messages": [
            { "role": "system", "content": SYSTEM_PROMPT },
            { "role": "user", "content": prompt },
        ],
        "temperature": 0.1,
    });
    let client = ai::ask_client()?;
    let url = format!("{}/v1/chat/completions", config.base_url);
    let response = ai::post_chat(&client, &url, &config.api_key, &body).await?;
    let answer =
        ai::completion_text(&response).ok_or_else(|| "empty AI response".to_string())?;
    let requested: Vec<String> = entries
        .iter()
        .take(MAX_ENTRIES)
        .map(|e| e.sha.clone())
        .collect();
    let assignments = parse_assignments(&answer, &requested);
    if assignments.is_empty() {
        return Ok(false);
    }
    let pairs: Vec<String> = assignments
        .iter()
        .map(|(sha, topic)| format!("{sha}={topic}"))
        .collect();
    let actor = format!("agent:{model}");
    tauri::async_runtime::spawn_blocking(move || {
        let refs: Vec<&str> = pairs.iter().map(String::as_str).collect();
        repo.assign_as_agent(&actor, &refs)
    })
    .await
    .map_err(|e| format!("ledger assign failed: {e}"))??;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::{
        build_prompt, parse_assignments, topic_ids, unassigned_entries, UnassignedEntry,
        MAX_ENTRIES,
    };
    use serde_json::json;

    fn entry(sha: &str, subject: &str) -> UnassignedEntry {
        UnassignedEntry {
            files: vec!["src/a.rs".to_string(), "src/b.rs".to_string()],
            lines: 12,
            sha: sha.to_string(),
            subject: subject.to_string(),
        }
    }

    #[test]
    fn status_json_lifts_entries_and_topics() {
        let status = json!({
            "topics": [{ "id": "auth" }, { "id": "billing" }],
            "unassigned": [
                { "sha": "a".repeat(40), "subject": "wip", "files": ["x.rs"], "lines": 3 },
                { "subject": "no sha, dropped" },
                { "sha": "b".repeat(40) },
            ],
        });
        let entries = unassigned_entries(&status);
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].subject, "wip");
        assert_eq!(entries[0].files, vec!["x.rs"]);
        assert_eq!(entries[1].subject, "");
        assert_eq!(entries[1].lines, 0);
        assert_eq!(topic_ids(&status), vec!["auth", "billing"]);
    }

    #[test]
    fn prompt_caps_the_work_list() {
        let entries: Vec<UnassignedEntry> = (0..MAX_ENTRIES + 10)
            .map(|i| entry(&format!("{i:040x}"), &format!("commit {i}")))
            .collect();
        let prompt = build_prompt("acme/widget", &["auth".to_string()], &entries);
        assert!(prompt.contains("acme/widget"));
        assert!(prompt.contains("Existing topics: auth"));
        assert!(prompt.contains(&format!("{:040x}", MAX_ENTRIES - 1)));
        assert!(!prompt.contains(&format!("{:040x}", MAX_ENTRIES)));
    }

    #[test]
    fn prompt_names_the_empty_topic_list() {
        let prompt = build_prompt("acme/widget", &[], &[entry(&"c".repeat(40), "wip")]);
        assert!(prompt.contains("Existing topics: none yet."));
    }

    #[test]
    fn parsing_keeps_only_requested_shas_with_sane_topics() {
        let a = "a".repeat(40);
        let b = "b".repeat(40);
        let c = "c".repeat(40);
        let d = "d".repeat(40);
        let requested = vec![a.clone(), b.clone(), c.clone(), d.clone()];
        let raw = format!(
            "Here is the mapping:\n```json\n{}\n```",
            json!({
                &a: " auth ",
                &b: "",
                &c: "x".repeat(60),
                &d: "bad\ncontrol",
                "e".repeat(40): "not-requested",
            })
        );
        let parsed = parse_assignments(&raw, &requested);
        assert_eq!(parsed, vec![(a, "auth".to_string())]);
    }

    #[test]
    fn parsing_junk_yields_nothing() {
        let requested = vec!["a".repeat(40)];
        assert!(parse_assignments("no json here", &requested).is_empty());
        assert!(parse_assignments("[1, 2, 3]", &requested).is_empty());
        assert!(parse_assignments("{ broken", &requested).is_empty());
        assert!(parse_assignments(&format!("{{\"{}\": 7}}", "a".repeat(40)), &requested).is_empty());
    }
}
