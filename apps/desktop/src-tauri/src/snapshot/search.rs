//! Layer 2 of BACKLOG §9: whole-repo file listing and content search over an
//! extracted snapshot — pure local reads, no network, no git. First consumer
//! is the ask-about-code tool loop (docs/AI.md), which is why the contract is
//! deliberately model-friendly: the pattern is a case-sensitive literal (no
//! regex — model-generated patterns can't misfire or blow up), matches carry
//! path + 1-based line + the matched line's text, and every result set is
//! capped with an explicit `truncated` flag so a caller can tell "that's all"
//! from "there was more". `None` from either entry point means the snapshot
//! for this key isn't ready; callers degrade the same way `get_file_blob`
//! does. Files are skipped, never errored, when they look binary (NUL in the
//! first block) or exceed the per-file cap — a search over a repo should
//! never fail because one file in it is odd.

use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;

use super::store::{self, SnapshotKey};

pub const MAX_LISTED_FILES: usize = 2000;
pub const MAX_GREP_HITS: usize = 200;
const MAX_SEARCH_FILE_BYTES: u64 = 1024 * 1024;
const MAX_HIT_TEXT_CHARS: usize = 240;
const BINARY_SNIFF_BYTES: usize = 4096;

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

fn collect_paths(dir: &Path, base: &Path, out: &mut Vec<String>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(meta) = fs::symlink_metadata(&path) else {
            continue;
        };
        if meta.is_symlink() {
            continue;
        }
        if meta.is_dir() {
            collect_paths(&path, base, out);
        } else if let Ok(relative) = path.strip_prefix(base) {
            out.push(relative.to_string_lossy().replace('\\', "/"));
        }
    }
}

fn snapshot_paths(root: &Path, key: &SnapshotKey) -> Option<(PathBuf, Vec<String>)> {
    if !store::is_ready(root, key) {
        return None;
    }
    let base = store::snapshot_dir(root, key);
    let mut paths = Vec::new();
    collect_paths(&base, &base, &mut paths);
    paths.sort();
    Some((base, paths))
}

fn passes_filter(path: &str, path_contains: Option<&str>) -> bool {
    match path_contains {
        Some(fragment) => path.contains(fragment),
        None => true,
    }
}

pub fn list_files(
    root: &Path,
    key: &SnapshotKey,
    path_contains: Option<&str>,
) -> Option<FileListing> {
    let (_, paths) = snapshot_paths(root, key)?;
    let mut files: Vec<String> = paths
        .into_iter()
        .filter(|p| passes_filter(p, path_contains))
        .collect();
    let truncated = files.len() > MAX_LISTED_FILES;
    files.truncate(MAX_LISTED_FILES);
    Some(FileListing { files, truncated })
}

fn looks_binary(contents: &[u8]) -> bool {
    contents
        .iter()
        .take(BINARY_SNIFF_BYTES)
        .any(|&byte| byte == 0)
}

fn clipped(line: &str) -> String {
    if line.chars().count() <= MAX_HIT_TEXT_CHARS {
        return line.to_string();
    }
    let cut: String = line.chars().take(MAX_HIT_TEXT_CHARS).collect();
    format!("{cut}…")
}

fn grep_file(base: &Path, relative: &str, pattern: &str, out: &mut Vec<GrepHit>) {
    let full = base.join(relative);
    let small_enough = fs::metadata(&full)
        .map(|m| m.len() <= MAX_SEARCH_FILE_BYTES)
        .unwrap_or(false);
    if !small_enough {
        return;
    }
    let Ok(contents) = fs::read(&full) else {
        return;
    };
    if looks_binary(&contents) {
        return;
    }
    let text = String::from_utf8_lossy(&contents);
    for (index, line) in text.lines().enumerate() {
        if line.contains(pattern) {
            out.push(GrepHit {
                line: (index + 1) as u32,
                path: relative.to_string(),
                text: clipped(line),
            });
        }
    }
}

pub fn grep(
    root: &Path,
    key: &SnapshotKey,
    pattern: &str,
    path_contains: Option<&str>,
) -> Option<GrepResult> {
    let (base, paths) = snapshot_paths(root, key)?;
    if pattern.is_empty() {
        return Some(GrepResult {
            hits: Vec::new(),
            truncated: false,
        });
    }
    let mut hits = Vec::new();
    let mut truncated = false;
    for relative in &paths {
        if !passes_filter(relative, path_contains) {
            continue;
        }
        grep_file(&base, relative, pattern, &mut hits);
        if hits.len() > MAX_GREP_HITS {
            hits.truncate(MAX_GREP_HITS);
            truncated = true;
            break;
        }
    }
    Some(GrepResult { hits, truncated })
}

#[cfg(test)]
#[path = "search_tests.rs"]
mod tests;
