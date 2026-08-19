//! Offline detection and the queued-write store (docs/BACKLOG.md, offline
//! review). Connectivity is judged from request outcomes, never from the
//! webview's `navigator.onLine`: a captive portal or a dead VPN reports true
//! there, while a transport-level reqwest failure cannot lie. `http::net_err`
//! flips the process-wide flag to offline and any received response flips it
//! back, so the existing polls double as the heartbeat and no extra probe
//! request exists.
//!
//! Writes made while offline are queued per account in
//! `offline_queue_{accountId}.json` and replayed through the same platform
//! seam the live commands use. Replay stops at the first transport failure
//! (the connection dropped again) and classifies host rejections: an intent
//! that already holds (the thread was resolved by someone else) reports as
//! nothing to do, not as a failure, and a real failure keeps the item, its
//! text and the host's reason so the frontend can offer place-again, copy or
//! discard. A queued review submission is never replayed automatically:
//! submitting carries a verdict, so it waits for `replay_queue` with
//! `include_submit` set from an explicit press.

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::accounts;
use crate::http::now_millis;
use crate::model::ReviewCommentInput;
use crate::platform::AnyPlatform;
use crate::storage;

static ONLINE: AtomicBool = AtomicBool::new(true);
static QUEUE_SEQ: AtomicU64 = AtomicU64::new(0);

pub(crate) fn mark_offline() {
    ONLINE.store(false, Ordering::Relaxed);
}

pub(crate) fn mark_online() {
    ONLINE.store(true, Ordering::Relaxed);
}

pub(crate) fn is_online() -> bool {
    ONLINE.load(Ordering::Relaxed)
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum QueueVerb {
    #[serde(rename_all = "camelCase")]
    Comment {
        body: String,
        commit_id: String,
        path: String,
        line: u64,
        side: String,
        start_line: Option<u64>,
    },
    #[serde(rename_all = "camelCase")]
    Reply { body: String, in_reply_to: u64 },
    #[serde(rename_all = "camelCase")]
    Resolve { thread_id: String, resolved: bool },
    #[serde(rename_all = "camelCase")]
    IssueComment { body: String },
    #[serde(rename_all = "camelCase")]
    SubmitReview {
        event: String,
        body: String,
        commit_id: String,
        comments: Vec<ReviewCommentInput>,
    },
}

#[derive(Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum QueueState {
    Queued,
    Failed,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueuedWrite {
    pub id: String,
    pub created_at: u64,
    pub owner: String,
    pub repo: String,
    pub number: u64,
    pub state: QueueState,
    pub failure: Option<String>,
    pub verb: QueueVerb,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectivityInfo {
    pub online: bool,
    pub queue: Vec<QueuedWrite>,
}

#[derive(Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ReplayOutcome {
    Landed,
    NothingToDo,
    Failed,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplayedItem {
    pub item: QueuedWrite,
    pub outcome: ReplayOutcome,
    pub reason: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplayReport {
    pub attempted: Vec<ReplayedItem>,
    pub went_offline: bool,
}

#[derive(Debug, PartialEq)]
pub(crate) enum Classified {
    NothingToDo(String),
    Failed(String),
}

pub(crate) fn is_connectivity_error(err: &str) -> bool {
    err.starts_with("network error:")
}

/// Turns a host rejection into what the reviewer should be told. An intent
/// that already holds is not a failure, and a comment whose anchor left the
/// diff gets the reason in plain words instead of the host's 422 prose. The
/// host message rides along verbatim otherwise: a specific reason is the
/// difference between a conflict you can resolve and an error you cannot.
pub(crate) fn classify_replay_error(verb: &QueueVerb, err: &str) -> Classified {
    let lower = err.to_lowercase();
    match verb {
        QueueVerb::Resolve { resolved, .. } => {
            let already_holds = if *resolved {
                lower.contains("already resolved") || lower.contains("already been resolved")
            } else {
                lower.contains("is not resolved")
                    || lower.contains("already unresolved")
                    || lower.contains("already been unresolved")
            };
            if already_holds {
                let reason = if *resolved {
                    "someone had already resolved this thread".to_string()
                } else {
                    "the thread was already back open".to_string()
                };
                return Classified::NothingToDo(reason);
            }
            Classified::Failed(err.to_string())
        }
        QueueVerb::Comment { .. } | QueueVerb::SubmitReview { .. } => {
            if lower.contains("must be part of the diff")
                || lower.contains("position is invalid")
                || lower.contains("line could not be found")
            {
                return Classified::Failed(
                    "that line is no longer part of the diff on the host".to_string(),
                );
            }
            Classified::Failed(err.to_string())
        }
        QueueVerb::Reply { .. } => {
            if lower.contains("not found") {
                return Classified::Failed(
                    "the thread this replies to is gone from the host".to_string(),
                );
            }
            Classified::Failed(err.to_string())
        }
        QueueVerb::IssueComment { .. } => Classified::Failed(err.to_string()),
    }
}

fn queue_name(account_id: &str) -> String {
    format!("offline_queue_{account_id}.json")
}

fn load_queue(app: &AppHandle, account_id: &str) -> Result<Vec<QueuedWrite>, String> {
    Ok(storage::read_json::<Vec<QueuedWrite>>(app, &queue_name(account_id))?.unwrap_or_default())
}

fn save_queue(app: &AppHandle, account_id: &str, queue: &[QueuedWrite]) -> Result<(), String> {
    storage::write_json(app, &queue_name(account_id), &queue.to_vec())
}

#[tauri::command]
pub async fn connectivity_status(app: AppHandle) -> Result<ConnectivityInfo, String> {
    let account = accounts::active_account(&app).await?;
    Ok(ConnectivityInfo {
        online: is_online(),
        queue: load_queue(&app, &account.id)?,
    })
}

#[tauri::command]
pub async fn queue_write(
    app: AppHandle,
    owner: String,
    repo: String,
    number: u64,
    verb: QueueVerb,
) -> Result<QueuedWrite, String> {
    let account = accounts::active_account(&app).await?;
    let mut queue = load_queue(&app, &account.id)?;
    let seq = QUEUE_SEQ.fetch_add(1, Ordering::Relaxed);
    let item = QueuedWrite {
        created_at: now_millis(),
        failure: None,
        id: format!("w{}-{seq}", now_millis()),
        number,
        owner,
        repo,
        state: QueueState::Queued,
        verb,
    };
    queue.push(item.clone());
    save_queue(&app, &account.id, &queue)?;
    Ok(item)
}

#[tauri::command]
pub async fn discard_queued(app: AppHandle, id: String) -> Result<Vec<QueuedWrite>, String> {
    let account = accounts::active_account(&app).await?;
    let queue: Vec<QueuedWrite> = load_queue(&app, &account.id)?
        .into_iter()
        .filter(|i| i.id != id)
        .collect();
    save_queue(&app, &account.id, &queue)?;
    Ok(queue)
}

#[tauri::command]
pub async fn replay_queue(app: AppHandle, include_submit: bool) -> Result<ReplayReport, String> {
    let (account, platform) = accounts::active_platform(&app).await?;
    let queue = load_queue(&app, &account.id)?;
    let mut attempted: Vec<ReplayedItem> = Vec::new();
    let mut remaining: Vec<QueuedWrite> = Vec::new();
    let mut went_offline = false;

    for mut item in queue {
        let is_submit = matches!(item.verb, QueueVerb::SubmitReview { .. });
        let eligible = item.state == QueueState::Queued && (include_submit || !is_submit);
        if !eligible || went_offline {
            remaining.push(item);
            continue;
        }
        match execute(&platform, &item).await {
            Ok(()) => attempted.push(ReplayedItem {
                item,
                outcome: ReplayOutcome::Landed,
                reason: None,
            }),
            Err(e) if is_connectivity_error(&e) => {
                went_offline = true;
                remaining.push(item);
            }
            Err(e) => match classify_replay_error(&item.verb, &e) {
                Classified::NothingToDo(reason) => attempted.push(ReplayedItem {
                    item,
                    outcome: ReplayOutcome::NothingToDo,
                    reason: Some(reason),
                }),
                Classified::Failed(reason) => {
                    item.state = QueueState::Failed;
                    item.failure = Some(reason.clone());
                    attempted.push(ReplayedItem {
                        item: item.clone(),
                        outcome: ReplayOutcome::Failed,
                        reason: Some(reason),
                    });
                    remaining.push(item);
                }
            },
        }
    }

    save_queue(&app, &account.id, &remaining)?;
    Ok(ReplayReport {
        attempted,
        went_offline,
    })
}

async fn execute(platform: &AnyPlatform, item: &QueuedWrite) -> Result<(), String> {
    match &item.verb {
        QueueVerb::Comment {
            body,
            commit_id,
            path,
            line,
            side,
            start_line,
        } => platform
            .create_review_comment(
                &item.owner,
                &item.repo,
                item.number,
                body,
                commit_id,
                path,
                *line,
                side,
                *start_line,
            )
            .await
            .map(|_| ()),
        QueueVerb::Reply { body, in_reply_to } => platform
            .reply_to_review_comment(&item.owner, &item.repo, item.number, body, *in_reply_to)
            .await
            .map(|_| ()),
        QueueVerb::Resolve {
            thread_id,
            resolved,
        } => {
            platform
                .resolve_thread(&item.owner, &item.repo, item.number, thread_id, *resolved)
                .await
        }
        QueueVerb::IssueComment { body } => {
            platform
                .create_issue_comment(&item.owner, &item.repo, item.number, body)
                .await
        }
        QueueVerb::SubmitReview {
            event,
            body,
            commit_id,
            comments,
        } => {
            platform
                .submit_review(
                    &item.owner,
                    &item.repo,
                    item.number,
                    event,
                    body,
                    commit_id,
                    comments,
                )
                .await
        }
    }
}

#[cfg(test)]
#[path = "offline_tests.rs"]
mod tests;
