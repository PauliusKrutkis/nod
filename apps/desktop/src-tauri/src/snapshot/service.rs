//! Drives a snapshot from "PR opened" to "tree on disk", and remembers what
//! happened so the UI can ask without triggering more work.
//!
//! `ensure` is fire-and-forget and must stay that way: it is called on PR open,
//! where nothing may block the paint. It returns as soon as the state is
//! recorded, and the download runs on Tauri's async runtime.
//!
//! The registry is the deduplication point. Two PRs open at the same head SHA,
//! a re-open, or a poll landing mid-download must all collapse onto one
//! download, so a key already `Downloading` is left alone. This mirrors the
//! process-wide `OnceLock<Mutex<..>>` cache in `http.rs` — the process is
//! long-lived and the state is worthless across restarts, since readiness is
//! re-derived from the filesystem.
//!
//! Failure is never fatal and never retried in a loop: a `Failed` or `Skipped`
//! key stays that way until the app restarts or the head SHA moves. Callers
//! fall back to the on-demand blob path, which is exactly today's behaviour, so
//! the worst outcome of every error here is "no faster than before". A panic in
//! the download task must not leave its key stuck at `Downloading` either, so
//! the task holds a `PanicGuard` that records `Failed` on drop unless the
//! normal status write disarmed it first.
//!
//! The registry is keyed by `SnapshotKey` itself, not a formatted string: a
//! GitLab subgroup owner contains `/`, so `{owner}/{repo}` strings are
//! ambiguous. The formatted form exists only for log lines.
//!
//! An extraction that yields zero files is treated as a failure rather than an
//! empty snapshot. The likeliest cause is a host whose archive isn't shaped the
//! way `extract` assumes, and promoting it would be the worst outcome available:
//! `is_ready` would answer yes forever, every blob would quietly fall back to
//! the network, and nothing would ever say why.

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

use serde::Serialize;
use tauri::AppHandle;

use super::extract::extract_tar_gz;
use super::store::{self, SnapshotKey, KEEP_SHAS_PER_REPO, MAX_CACHE_BYTES};
use crate::accounts;
use crate::http::log;
use crate::model::MAX_REPO_SIZE_KB;
use crate::storage;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SnapshotState {
    Idle,
    Downloading,
    Ready,
    Skipped,
    Failed,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotStatus {
    pub state: SnapshotState,
    pub detail: String,
}

impl SnapshotStatus {
    fn new(state: SnapshotState, detail: &str) -> Self {
        Self {
            state,
            detail: detail.to_string(),
        }
    }
}

fn registry() -> &'static Mutex<HashMap<SnapshotKey, SnapshotStatus>> {
    static REGISTRY: OnceLock<Mutex<HashMap<SnapshotKey, SnapshotStatus>>> = OnceLock::new();
    REGISTRY.get_or_init(|| Mutex::new(HashMap::new()))
}

fn log_key(key: &SnapshotKey) -> String {
    format!("{}/{}/{}@{}", key.host, key.owner, key.repo, key.sha)
}

fn set_status(key: &SnapshotKey, status: SnapshotStatus) {
    if let Ok(mut map) = registry().lock() {
        map.insert(key.clone(), status);
    }
}

struct PanicGuard {
    key: Option<SnapshotKey>,
}

impl PanicGuard {
    fn disarm(&mut self) {
        self.key = None;
    }
}

impl Drop for PanicGuard {
    fn drop(&mut self) {
        if let Some(key) = self.key.take() {
            set_status(
                &key,
                SnapshotStatus::new(SnapshotState::Failed, "snapshot task panicked"),
            );
        }
    }
}

/// Current state of one snapshot. Readiness is answered from disk first so a
/// snapshot taken in an earlier run is reported without re-downloading.
pub fn status(root: &std::path::Path, key: &SnapshotKey) -> SnapshotStatus {
    if store::is_ready(root, key) {
        return SnapshotStatus::new(SnapshotState::Ready, "");
    }
    registry()
        .lock()
        .ok()
        .and_then(|map| map.get(key).cloned())
        .unwrap_or_else(|| SnapshotStatus::new(SnapshotState::Idle, ""))
}

/// Claims the right to download `key`, or reports who already holds it.
///
/// The check and the claim happen under one lock acquisition: reading the
/// status and then writing it back would let two callers both observe `Idle`
/// and both start downloading the same tarball, which is precisely what this
/// registry exists to prevent. The trigger fires from a React effect, so
/// near-simultaneous calls for one SHA are ordinary, not exotic.
fn claim(root: &std::path::Path, key: &SnapshotKey) -> Result<(), SnapshotStatus> {
    if store::is_ready(root, key) {
        return Err(SnapshotStatus::new(SnapshotState::Ready, ""));
    }
    let Ok(mut map) = registry().lock() else {
        return Err(SnapshotStatus::new(
            SnapshotState::Failed,
            "snapshot registry unavailable",
        ));
    };
    if let Some(existing) = map.get(key) {
        return Err(existing.clone());
    }
    map.insert(
        key.clone(),
        SnapshotStatus::new(SnapshotState::Downloading, ""),
    );
    Ok(())
}

/// Starts a snapshot unless one is ready, running, or already known to be
/// pointless for this key. Returns the state the caller should assume.
pub fn ensure(app: &AppHandle, key: SnapshotKey) -> SnapshotStatus {
    let Ok(root) = storage::cache_dir(app) else {
        return SnapshotStatus::new(SnapshotState::Failed, "no cache directory");
    };
    if let Err(current) = claim(&root, &key) {
        return current;
    }

    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let mut guard = PanicGuard {
            key: Some(key.clone()),
        };
        let outcome = run(&app, &key).await;
        let status = match outcome {
            Ok(Some(stats)) => {
                log(&format!(
                    "snapshot ready {} ({} files, {} KB)",
                    log_key(&key),
                    stats.files,
                    stats.bytes / 1024
                ));
                SnapshotStatus::new(SnapshotState::Ready, "")
            }
            Ok(None) => SnapshotStatus::new(SnapshotState::Skipped, "repository is too large"),
            Err(e) => {
                log(&format!("snapshot failed {}: {e}", log_key(&key)));
                SnapshotStatus::new(SnapshotState::Failed, &e)
            }
        };
        set_status(&key, status);
        guard.disarm();
    });
    SnapshotStatus::new(SnapshotState::Downloading, "")
}

/// `Ok(None)` means deliberately skipped — a repo too large to be worth
/// mirroring — as opposed to `Err`, which means something went wrong.
///
/// The active account is resolved here, after the claim; if the user switched
/// accounts since the key was built, its host no longer matches and the
/// download bails rather than fetching from the wrong host and storing the
/// result under the old key.
async fn run(
    app: &AppHandle,
    key: &SnapshotKey,
) -> Result<Option<super::extract::ExtractStats>, String> {
    let root = storage::cache_dir(app)?;
    let (account, platform) = accounts::active_platform(app).await?;
    if account.host != key.host {
        return Err("active account changed before the download started".to_string());
    }

    let size_kb = platform.repo_size_kb(&key.owner, &key.repo).await?;
    if size_kb > MAX_REPO_SIZE_KB {
        log(&format!(
            "snapshot skipped {} ({} MB repo)",
            log_key(key),
            size_kb / 1024
        ));
        return Ok(None);
    }

    let archive = platform.archive(&key.owner, &key.repo, &key.sha).await?;

    let blocking_key = key.clone();
    let stats = tauri::async_runtime::spawn_blocking(move || {
        extract_and_promote(&root, &blocking_key, &archive)
    })
    .await
    .map_err(|e| format!("snapshot extraction task failed: {e}"))??;
    Ok(Some(stats))
}

/// Runs on a blocking thread: gzip inflation, up to a gigabyte of synchronous
/// file writes, and the eviction tree walks would otherwise stall a tokio
/// worker.
fn extract_and_promote(
    root: &std::path::Path,
    key: &SnapshotKey,
    archive: &[u8],
) -> Result<super::extract::ExtractStats, String> {
    store::discard_partial(root, key);
    let staging = store::partial_dir(root, key);
    std::fs::create_dir_all(&staging)
        .map_err(|e| format!("could not create snapshot directory: {e}"))?;

    let stats = match extract_tar_gz(archive, &staging) {
        Ok(stats) => stats,
        Err(e) => {
            store::discard_partial(root, key);
            return Err(e);
        }
    };

    if stats.files == 0 {
        store::discard_partial(root, key);
        return Err("archive contained no files".to_string());
    }

    store::promote(root, key)?;
    store::evict_repo(root, key, KEEP_SHAS_PER_REPO);
    store::evict_global(root, MAX_CACHE_BYTES);
    Ok(stats)
}

#[cfg(test)]
#[path = "service_tests.rs"]
mod tests;
