//! On-disk layout for repo stores.
//!
//! Layout under the cache dir: `repos/{host}/{owner}__{repo}.git` — one bare
//! repository per repo, not per SHA: history accumulates in one object store
//! and a new push is a fetch, not a new directory. The host is part of the
//! key because the same `owner/repo` exists on github.com and on a
//! self-hosted GitLab, and their histories are unrelated. Segments are
//! sanitised the same way snapshot paths are — hosts and owners are
//! attacker-influenced strings.
//!
//! A clone lands in a sibling `.partial` directory and is renamed into place
//! only once `git clone` succeeded, so a crash mid-clone can never be read as
//! a finished store: `exists` looks exclusively at the final directory, and
//! demands the `HEAD` file git writes into every real git dir rather than
//! trusting a bare `is_dir` on crash residue.

use std::fs;
use std::path::{Path, PathBuf};

const REPOS_DIR: &str = "repos";
const PARTIAL_SUFFIX: &str = ".partial";

/// Identifies one repository on one host. There is deliberately no SHA: the
/// store holds the repo's history, and per-SHA readiness is a question for
/// git (`service::has_commit`), not the filesystem.
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct RepoKey {
    pub host: String,
    pub owner: String,
    pub repo: String,
}

/// One commit of one repository — what every SHA-addressed consumer (the AI
/// tool loop, skills discovery) threads through its call chain.
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct CommitKey {
    pub host: String,
    pub owner: String,
    pub repo: String,
    pub sha: String,
}

impl CommitKey {
    pub fn repo_key(&self) -> RepoKey {
        RepoKey {
            host: self.host.clone(),
            owner: self.owner.clone(),
            repo: self.repo.clone(),
        }
    }
}

fn segment(value: &str) -> String {
    let cleaned: String = value
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || matches!(c, '-' | '.' | '_') {
                c
            } else {
                '_'
            }
        })
        .collect();
    let trimmed = cleaned.trim_matches('.');
    if trimmed.is_empty() {
        "_".to_string()
    } else {
        trimmed.to_string()
    }
}

/// The bare git directory of one repo's store. Its `HEAD` means "complete".
pub fn git_dir(root: &Path, key: &RepoKey) -> PathBuf {
    root.join(REPOS_DIR)
        .join(segment(&key.host))
        .join(format!(
            "{}__{}.git",
            segment(&key.owner),
            segment(&key.repo)
        ))
}

/// Staging directory a clone writes into before the atomic rename.
pub fn partial_dir(root: &Path, key: &RepoKey) -> PathBuf {
    let dir = git_dir(root, key);
    dir.with_file_name(format!(
        "{}{PARTIAL_SUFFIX}",
        dir.file_name().and_then(|n| n.to_str()).unwrap_or("_")
    ))
}

pub fn exists(root: &Path, key: &RepoKey) -> bool {
    git_dir(root, key).join("HEAD").is_file()
}

/// Promotes a finished clone from staging into place. The store is per-repo
/// and cloning is claimed exclusively in the service registry, so unlike
/// snapshots there is never an existing directory to move aside.
pub fn promote(root: &Path, key: &RepoKey) -> Result<(), String> {
    let staged = partial_dir(root, key);
    if !staged.join("HEAD").is_file() {
        return Err("repo store staging directory is not a git directory".to_string());
    }
    fs::rename(&staged, git_dir(root, key)).map_err(|e| format!("could not finish clone: {e}"))
}

pub fn discard_partial(root: &Path, key: &RepoKey) {
    let _ = fs::remove_dir_all(partial_dir(root, key));
}

/// Deletes a repo's store entirely — the unwatch path. History for a repo
/// nobody watches is pure disk cost; watching again just clones again.
pub fn remove(root: &Path, key: &RepoKey) {
    let _ = fs::remove_dir_all(git_dir(root, key));
    discard_partial(root, key);
}

#[cfg(test)]
#[path = "store_tests.rs"]
mod tests;
