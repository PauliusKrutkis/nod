//! Commit → forge identity for the ledger's author display. Provenance
//! carries git names and emails; the PR surface shows logins and avatars.
//! GitHub links the two server-side (verified emails), so one batched
//! GraphQL query closes the gap for every commit shape — squash merges,
//! rebases, plain pushes — not just the noreply heuristic the frontend
//! falls back to offline.
//!
//! Results are cached forever beside the ledger state (`authors.json`):
//! a sha's author never changes, and a "no linked account" answer is
//! cached too (as null) so unlinked authors don't refetch each open.
//! Concurrent calls can lose entries to the read-merge-write race, which
//! is benign: a lost entry just refetches next time. GitLab repos return
//! only what the cache holds — the frontend's git-name fallback stands
//! there until a GitLab resolver exists.

use std::collections::HashMap;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::accounts;
use crate::http::log;
use crate::ledger::split_key;
use crate::platform::AnyPlatform;
use crate::repo_store::store::{self, RepoKey};
use crate::storage;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitAuthor {
    pub login: String,
    pub avatar_url: String,
}

type AuthorCache = HashMap<String, Option<CommitAuthor>>;

async fn cache_path(app: &AppHandle, repo_key: &str) -> Result<PathBuf, String> {
    let (owner, repo) = split_key(repo_key)?;
    let host = accounts::active_account(app).await?.host;
    let key = RepoKey { host, owner, repo };
    Ok(store::ledger_state_dir(&storage::config_dir(app)?, &key).join("authors.json"))
}

fn load_cache(path: &std::path::Path) -> AuthorCache {
    std::fs::read(path)
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_default()
}

fn is_hex_sha(sha: &str) -> bool {
    (7..=40).contains(&sha.len()) && sha.bytes().all(|b| b.is_ascii_hexdigit())
}

/// sha → linked GitHub identity (or null) for every requested commit the
/// forge could answer for; shas the platform cannot resolve are simply
/// absent, and the frontend keeps its git-name fallback for them.
#[tauri::command]
pub async fn ledger_commit_authors(
    app: AppHandle,
    repo_key: String,
    shas: Vec<String>,
) -> Result<AuthorCache, String> {
    let shas: Vec<String> = shas.into_iter().filter(|s| is_hex_sha(s)).collect();
    let path = cache_path(&app, &repo_key).await?;
    let mut cache = load_cache(&path);
    let missing: Vec<String> = shas
        .iter()
        .filter(|sha| !cache.contains_key(*sha))
        .cloned()
        .collect();
    if !missing.is_empty() {
        let (_, platform) = accounts::active_platform(&app).await?;
        if let AnyPlatform::GitHub(gh) = platform {
            let (owner, repo) = split_key(&repo_key)?;
            match gh.commit_authors(&owner, &repo, &missing).await {
                Ok(resolved) => {
                    for (sha, identity) in resolved {
                        cache.insert(
                            sha,
                            identity.map(|(login, avatar_url)| CommitAuthor {
                                avatar_url,
                                login,
                            }),
                        );
                    }
                    if let Ok(bytes) = serde_json::to_vec(&cache) {
                        let _ = crate::ledger::write_atomically(&path, &bytes);
                    }
                }
                Err(e) => log(&format!("commit author lookup failed: {e}")),
            }
        }
    }
    Ok(shas
        .into_iter()
        .filter_map(|sha| cache.get(&sha).map(|v| (sha.clone(), v.clone())))
        .collect())
}

#[cfg(test)]
#[path = "ledger_identity_tests.rs"]
mod tests;
