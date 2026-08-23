//! Drives a repo store from "this SHA is wanted" to "this SHA is in the
//! object store", and remembers what happened so the UI can ask without
//! triggering more work.
//!
//! `ensure` is fire-and-forget for the same reason snapshot `ensure` was: it
//! is called on PR open, where nothing may block the paint. Readiness is
//! per-commit and answered by git itself (`has_commit`), never by the
//! registry — a store cloned in an earlier run reports `Ready` with no
//! in-process state at all.
//!
//! The registry serialises git against one store directory. Two concurrent
//! `git` processes in the same git dir contend on locks and packs, so a key
//! that is `Cloning` or `Fetching` is left alone no matter which SHA the
//! caller wants — a clone satisfies every SHA the server has, and a fetch in
//! flight is finished before the next one starts.
//!
//! Failure sticks per SHA, not per repo: the registry remembers which SHA an
//! attempt was for, and a `Failed` entry blocks only re-attempts of that
//! SHA. A new head SHA reclaims the key and tries again — the snapshot
//! registry got this for free by keying on the SHA; here the key is the
//! repo, so the SHA rides in the entry.
//!
//! The clone is bare (no working tree to maintain), skips tags, and filters
//! blobs over `CLONE_BLOB_FILTER`: all code and normal assets arrive, giant
//! binaries stay on the server until a read actually wants them, which is
//! what lets the store refuse no repo by size. Fetched SHAs are pinned under
//! `refs/nod/pins/` so gc can never prune a commit a surface is reading.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

use serde::Serialize;
use tauri::AppHandle;

use super::git::{self, GitAuth};
use super::store::{self, RepoKey};
use crate::accounts;
use crate::http::log;
use crate::storage;

/// Blobs above this size are left on the server at clone/fetch time and
/// materialise only when read. 10 MB keeps every plausible source file and
/// screenshot local while excluding the release binaries and videos that
/// make repo size pathological.
const CLONE_BLOB_FILTER: &str = "--filter=blob:limit=10m";

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum RepoStoreState {
    Idle,
    Cloning,
    Fetching,
    Ready,
    Failed,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoStoreStatus {
    pub state: RepoStoreState,
    pub detail: String,
}

impl RepoStoreStatus {
    fn new(state: RepoStoreState, detail: &str) -> Self {
        Self {
            state,
            detail: detail.to_string(),
        }
    }
}

#[derive(Clone)]
struct Entry {
    status: RepoStoreStatus,
    sha: String,
}

fn registry() -> &'static Mutex<HashMap<RepoKey, Entry>> {
    static REGISTRY: OnceLock<Mutex<HashMap<RepoKey, Entry>>> = OnceLock::new();
    REGISTRY.get_or_init(|| Mutex::new(HashMap::new()))
}

fn log_key(key: &RepoKey, sha: &str) -> String {
    format!("{}/{}/{}@{}", key.host, key.owner, key.repo, sha)
}

fn set_status(key: &RepoKey, sha: &str, status: RepoStoreStatus) {
    if let Ok(mut map) = registry().lock() {
        map.insert(
            key.clone(),
            Entry {
                status,
                sha: sha.to_string(),
            },
        );
    }
}

struct PanicGuard {
    key: Option<(RepoKey, String)>,
}

impl PanicGuard {
    fn disarm(&mut self) {
        self.key = None;
    }
}

impl Drop for PanicGuard {
    fn drop(&mut self) {
        if let Some((key, sha)) = self.key.take() {
            set_status(
                &key,
                &sha,
                RepoStoreStatus::new(RepoStoreState::Failed, "repo store task panicked"),
            );
        }
    }
}

/// A SHA is about to become a git argument and a ref name; anything that is
/// not plain hex is refused before it reaches either position.
fn valid_sha(sha: &str) -> bool {
    (7..=64).contains(&sha.len()) && sha.chars().all(|c| c.is_ascii_hexdigit())
}

fn pin_refspec(sha: &str) -> String {
    format!("+{sha}:refs/nod/pins/{sha}")
}

fn clone_url(key: &RepoKey) -> String {
    format!(
        "{}/{}/{}.git",
        key.host.trim_end_matches('/'),
        key.owner,
        key.repo
    )
}

/// Whether `sha` resolves to a commit already in the store. This is the
/// readiness question, asked of git rather than the filesystem, and it is
/// what lets `status` ignore the registry entirely on the happy path.
pub fn has_commit(root: &Path, key: &RepoKey, sha: &str) -> bool {
    if !store::exists(root, key) {
        return false;
    }
    git::run(
        Some(&store::git_dir(root, key)),
        &["rev-parse", "--verify", "--quiet", &format!("{sha}^{{commit}}")],
        None,
    )
    .is_ok()
}

/// Current state of one repo store with respect to one commit.
pub fn status(root: &Path, key: &RepoKey, sha: &str) -> RepoStoreStatus {
    if has_commit(root, key, sha) {
        return RepoStoreStatus::new(RepoStoreState::Ready, "");
    }
    let entry = registry().lock().ok().and_then(|map| map.get(key).cloned());
    match entry {
        Some(entry)
            if matches!(
                entry.status.state,
                RepoStoreState::Cloning | RepoStoreState::Fetching
            ) =>
        {
            entry.status
        }
        Some(entry) if entry.status.state == RepoStoreState::Failed && entry.sha == sha => {
            entry.status
        }
        _ => RepoStoreStatus::new(RepoStoreState::Idle, ""),
    }
}

/// Claims the right to run git against `key`'s store, or reports why not.
/// Check and claim happen under one lock acquisition, as in the snapshot
/// registry. A busy entry always wins; a settled entry (`Failed` for another
/// SHA, or a stale `Ready`) is reclaimed.
fn claim(root: &Path, key: &RepoKey, sha: &str) -> Result<RepoStoreState, RepoStoreStatus> {
    if has_commit(root, key, sha) {
        return Err(RepoStoreStatus::new(RepoStoreState::Ready, ""));
    }
    let Ok(mut map) = registry().lock() else {
        return Err(RepoStoreStatus::new(
            RepoStoreState::Failed,
            "repo store registry unavailable",
        ));
    };
    if let Some(entry) = map.get(key) {
        let busy = matches!(
            entry.status.state,
            RepoStoreState::Cloning | RepoStoreState::Fetching
        );
        let same_failure = entry.status.state == RepoStoreState::Failed && entry.sha == sha;
        if busy || same_failure {
            return Err(entry.status.clone());
        }
    }
    let state = if store::exists(root, key) {
        RepoStoreState::Fetching
    } else {
        RepoStoreState::Cloning
    };
    map.insert(
        key.clone(),
        Entry {
            status: RepoStoreStatus::new(state, ""),
            sha: sha.to_string(),
        },
    );
    Ok(state)
}

/// Starts cloning or fetching unless the commit is present, work is already
/// running, or this SHA already failed. Returns the state the caller should
/// assume.
pub fn ensure(app: &AppHandle, key: RepoKey, sha: String) -> RepoStoreStatus {
    if !valid_sha(&sha) {
        return RepoStoreStatus::new(RepoStoreState::Failed, "not a commit SHA");
    }
    let Ok(root) = storage::cache_dir(app) else {
        return RepoStoreStatus::new(RepoStoreState::Failed, "no cache directory");
    };
    let claimed = match claim(&root, &key, &sha) {
        Ok(state) => state,
        Err(current) => return current,
    };

    let app = app.clone();
    let task_key = key.clone();
    let task_sha = sha.clone();
    tauri::async_runtime::spawn(async move {
        let mut guard = PanicGuard {
            key: Some((task_key.clone(), task_sha.clone())),
        };
        let status = match run(&app, &task_key, &task_sha).await {
            Ok(()) => {
                log(&format!("repo store ready {}", log_key(&task_key, &task_sha)));
                RepoStoreStatus::new(RepoStoreState::Ready, "")
            }
            Err(e) => {
                log(&format!(
                    "repo store failed {}: {e}",
                    log_key(&task_key, &task_sha)
                ));
                RepoStoreStatus::new(RepoStoreState::Failed, &e)
            }
        };
        set_status(&task_key, &task_sha, status);
        guard.disarm();
    });
    RepoStoreStatus::new(claimed, "")
}

/// The active account is resolved after the claim, as in the snapshot
/// service: if the user switched accounts since the key was built, its host
/// no longer matches and the task bails rather than cloning from the wrong
/// host into this key's directory.
async fn run(app: &AppHandle, key: &RepoKey, sha: &str) -> Result<(), String> {
    let root = storage::cache_dir(app)?;
    let account = accounts::active_account(app).await?;
    if account.host != key.host {
        return Err("active account changed before the git work started".to_string());
    }
    let auth = git::auth_for(&account);

    let blocking_key = key.clone();
    let blocking_sha = sha.to_string();
    tauri::async_runtime::spawn_blocking(move || {
        sync_store(&root, &blocking_key, &blocking_sha, &auth)
    })
    .await
    .map_err(|e| format!("repo store task failed: {e}"))?
}

/// Runs on a blocking thread: clones if the store is missing, then fetches
/// the wanted commit if the clone didn't already bring it.
fn sync_store(root: &Path, key: &RepoKey, sha: &str, auth: &GitAuth) -> Result<(), String> {
    if !store::exists(root, key) {
        clone(root, key, auth)?;
    }
    if has_commit(root, key, sha) {
        return Ok(());
    }
    set_status(key, sha, RepoStoreStatus::new(RepoStoreState::Fetching, ""));
    fetch_commit(&store::git_dir(root, key), sha, auth)?;
    if !has_commit(root, key, sha) {
        return Err("the server did not return the requested commit".to_string());
    }
    Ok(())
}

fn clone(root: &Path, key: &RepoKey, auth: &GitAuth) -> Result<(), String> {
    store::discard_partial(root, key);
    let staging = store::partial_dir(root, key);
    if let Some(parent) = staging.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("could not create repo store directory: {e}"))?;
    }
    let staging_arg = path_arg(&staging)?;
    let cloned = git::run(
        None,
        &[
            "clone",
            "--bare",
            "--no-tags",
            CLONE_BLOB_FILTER,
            &clone_url(key),
            &staging_arg,
        ],
        Some(auth),
    );
    if let Err(e) = cloned {
        store::discard_partial(root, key);
        return Err(e);
    }
    // A bare clone gets no fetch refspec; without one, later `git fetch
    // origin` calls update nothing. Branch tips land under remotes/ so the
    // clone-time refs/heads never masquerade as current.
    git::run(
        Some(&staging),
        &[
            "config",
            "remote.origin.fetch",
            "+refs/heads/*:refs/remotes/origin/*",
        ],
        None,
    )?;
    store::promote(root, key)
}

/// Fetches one commit by SHA and pins it under `refs/nod/pins/`. Both hosts
/// allow SHA wants for commits reachable from any ref, which covers PR heads.
fn fetch_commit(git_dir: &Path, sha: &str, auth: &GitAuth) -> Result<(), String> {
    git::run(
        Some(git_dir),
        &["fetch", "--no-tags", "origin", &pin_refspec(sha)],
        Some(auth),
    )
    .map(|_| ())
}

fn path_arg(path: &PathBuf) -> Result<String, String> {
    path.to_str()
        .map(str::to_string)
        .ok_or_else(|| "repo store path is not valid UTF-8".to_string())
}

#[cfg(test)]
#[path = "service_tests.rs"]
mod tests;
