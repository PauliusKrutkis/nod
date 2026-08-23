//! SHA-addressed reads over a repo store: the contracts `snapshot::search`
//! and `get_file_blob` already serve, answered by git plumbing against the
//! bare clone instead of an extracted tree. Consumers keep the semantics
//! they had — reads are always at a commit, never a working tree, so what
//! the AI or search reports is exactly the code under review.
//!
//! `None` from every entry point means the same thing it meant for
//! snapshots: this commit isn't locally available (or the path is missing /
//! a symlink), and the caller should degrade to its network path. The result
//! shapes live here as their canonical home; the snapshot module re-exports
//! them until it is retired.
//!
//! A store cloned with a blob filter may lazy-fetch a filtered-out blob when
//! one of these reads touches it, which is why the git calls here carry no
//! auth: the promisor remote configuration handles the fetch, and a filtered
//! blob that cannot be fetched (offline) degrades to `None` like any miss.

use std::path::Path;

use serde::Serialize;

use super::git;
use super::service;
use super::store::{self, RepoKey};

pub const MAX_LISTED_FILES: usize = 2000;
pub const MAX_GREP_HITS: usize = 200;
const MAX_HIT_TEXT_CHARS: usize = 240;

const SYMLINK_MODE: &str = "120000";

#[derive(Serialize, Clone, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FileListing {
    pub files: Vec<String>,
    pub truncated: bool,
}

#[derive(Serialize, Clone, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GrepHit {
    pub path: String,
    pub line: u32,
    pub text: String,
}

#[derive(Serialize, Clone, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GrepResult {
    pub hits: Vec<GrepHit>,
    pub truncated: bool,
}

/// One `ls-tree` blob entry: byte size and repo-relative path.
struct TreeEntry {
    size: Option<u64>,
    path: String,
}

/// Parses `ls-tree -l -z` output: `<mode> <type> <hash> <size>\t<path>\0`,
/// size right-aligned with spaces and `-` for non-blobs. Only blobs come
/// back — trees don't answer reads and symlink entries are dropped to match
/// the snapshot extractor, which never materialised them.
fn parse_tree(raw: &str) -> Vec<TreeEntry> {
    raw.split('\0')
        .filter_map(|entry| {
            let (meta, path) = entry.split_once('\t')?;
            let mut fields = meta.split_whitespace();
            let mode = fields.next()?;
            let kind = fields.next()?;
            let _hash = fields.next()?;
            let size = fields.next().and_then(|s| s.parse::<u64>().ok());
            if kind != "blob" || mode == SYMLINK_MODE {
                return None;
            }
            Some(TreeEntry {
                size,
                path: path.to_string(),
            })
        })
        .collect()
}

fn ready_dir(root: &Path, key: &RepoKey, sha: &str) -> Option<std::path::PathBuf> {
    service::has_commit(root, key, sha).then(|| store::git_dir(root, key))
}

/// The tree entry for one exact path, or `None` for missing paths, symlinks
/// and directories. The pathspec is marked literal so a path containing `*`
/// or `?` cannot glob.
fn entry(dir: &Path, sha: &str, path: &str) -> Option<TreeEntry> {
    let raw = git::run(
        Some(dir),
        &[
            "ls-tree",
            "-r",
            "-l",
            "-z",
            sha,
            "--",
            &format!(":(literal){path}"),
        ],
        None,
    )
    .ok()?;
    parse_tree(&raw).into_iter().find(|e| e.path == path)
}

/// Size of one blob without reading it, for callers with a size cap.
pub fn file_size(root: &Path, key: &RepoKey, sha: &str, path: &str) -> Option<u64> {
    let dir = ready_dir(root, key, sha)?;
    entry(&dir, sha, path)?.size
}

/// One blob's bytes at this commit. Refuses symlinks like the snapshot store
/// did — `entry` never returns them.
pub fn read_file(root: &Path, key: &RepoKey, sha: &str, path: &str) -> Option<Vec<u8>> {
    let dir = ready_dir(root, key, sha)?;
    entry(&dir, sha, path)?;
    git::run_bytes(
        Some(&dir),
        &["cat-file", "blob", &format!("{sha}:{path}")],
        None,
    )
    .ok()
}

fn passes_filter(path: &str, path_contains: Option<&str>) -> bool {
    match path_contains {
        Some(fragment) => path.contains(fragment),
        None => true,
    }
}

pub fn list_files(
    root: &Path,
    key: &RepoKey,
    sha: &str,
    path_contains: Option<&str>,
) -> Option<FileListing> {
    let dir = ready_dir(root, key, sha)?;
    let raw = git::run(Some(&dir), &["ls-tree", "-r", "-l", "-z", sha], None).ok()?;
    let mut files: Vec<String> = parse_tree(&raw)
        .into_iter()
        .map(|e| e.path)
        .filter(|p| passes_filter(p, path_contains))
        .collect();
    files.sort();
    let truncated = files.len() > MAX_LISTED_FILES;
    files.truncate(MAX_LISTED_FILES);
    Some(FileListing { files, truncated })
}

fn clipped(line: &str) -> String {
    if line.chars().count() <= MAX_HIT_TEXT_CHARS {
        return line.to_string();
    }
    let cut: String = line.chars().take(MAX_HIT_TEXT_CHARS).collect();
    format!("{cut}…")
}

/// Parses one `git grep --null --line-number` hit: `{rev}:{path}\0{line}\0{text}`.
/// `--null` turns the separators after the path and the line number into
/// NULs, so a path containing `:` cannot shift the fields; the rev is a bare
/// SHA and keeps its colon.
fn parse_hit(line: &str, sha: &str) -> Option<GrepHit> {
    let rest = line.strip_prefix(sha)?.strip_prefix(':')?;
    let (path, tail) = rest.split_once('\0')?;
    let (number, text) = tail.split_once('\0')?;
    Some(GrepHit {
        path: path.to_string(),
        line: number.parse().ok()?,
        text: clipped(text),
    })
}

/// Case-sensitive literal search at a commit, matching the snapshot grep
/// contract: binaries skipped (`-I`), hits capped with an explicit
/// `truncated` flag, filter applied to the repo-relative path.
pub fn grep(
    root: &Path,
    key: &RepoKey,
    sha: &str,
    pattern: &str,
    path_contains: Option<&str>,
) -> Option<GrepResult> {
    let dir = ready_dir(root, key, sha)?;
    if pattern.is_empty() {
        return Some(GrepResult {
            hits: Vec::new(),
            truncated: false,
        });
    }
    let raw = git::run(
        Some(&dir),
        &[
            "grep",
            "-I",
            "--line-number",
            "--null",
            "--fixed-strings",
            "-e",
            pattern,
            sha,
        ],
        None,
    );
    // git grep exits 1 for "no matches", which is a result, not a failure.
    let raw = match raw {
        Ok(out) => out,
        Err(_) => String::new(),
    };
    let mut hits: Vec<GrepHit> = Vec::new();
    let mut truncated = false;
    for line in raw.lines() {
        let Some(hit) = parse_hit(line, sha) else {
            continue;
        };
        if !passes_filter(&hit.path, path_contains) {
            continue;
        }
        if hits.len() == MAX_GREP_HITS {
            truncated = true;
            break;
        }
        hits.push(hit);
    }
    Some(GrepResult { hits, truncated })
}

#[cfg(test)]
#[path = "read_tests.rs"]
mod tests;
