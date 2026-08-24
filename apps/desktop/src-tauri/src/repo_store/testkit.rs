//! Test fixtures for everything that reads through a repo store: builds a
//! real origin with the given files, clones it bare into the store layout,
//! and hands back the commit SHA. Compiled only for tests; shared by the
//! AI, chat and command tests that used to stage extracted snapshots.

use std::path::Path;

use super::git;
use super::store::{self, CommitKey};

/// A store for `owner/repo` whose single commit contains exactly `files`,
/// answering with the full key at that commit. The origin repo is created
/// under the same temp root so one `remove_dir_all` cleans everything.
pub fn seeded_store(
    root: &Path,
    owner: &str,
    repo: &str,
    files: &[(&str, &[u8])],
) -> CommitKey {
    let key = CommitKey {
        host: "https://github.com".to_string(),
        owner: owner.to_string(),
        repo: repo.to_string(),
        sha: String::new(),
    };
    let origin = root.join("origin-fixture");
    std::fs::create_dir_all(&origin).expect("origin dir");
    git::run(Some(&origin), &["init", "-q", "-b", "main"], None).expect("init");
    for (path, contents) in files {
        let full = origin.join(path);
        if let Some(parent) = full.parent() {
            std::fs::create_dir_all(parent).expect("file parent");
        }
        std::fs::write(full, contents).expect("write");
    }
    git::run(Some(&origin), &["add", "."], None).expect("add");
    git::run(
        Some(&origin),
        &[
            "-c",
            "user.name=Fixture",
            "-c",
            "user.email=fixture@example.com",
            "commit",
            "-q",
            "-m",
            "fixture",
        ],
        None,
    )
    .expect("commit");
    let sha = git::run(Some(&origin), &["rev-parse", "HEAD"], None)
        .expect("rev-parse")
        .trim()
        .to_string();

    let dir = store::git_dir(root, &key.repo_key());
    std::fs::create_dir_all(dir.parent().expect("parent")).expect("store parent");
    git::run(
        None,
        &[
            "clone",
            "--bare",
            "-q",
            origin.to_str().expect("utf-8"),
            dir.to_str().expect("utf-8"),
        ],
        None,
    )
    .expect("clone");
    CommitKey { sha, ..key }
}
