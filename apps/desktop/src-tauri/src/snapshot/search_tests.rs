use super::{grep, list_files, read_file_slice, MAX_GREP_HITS, MAX_LISTED_FILES};
use crate::snapshot::store::{partial_dir, promote, SnapshotKey};
use std::path::{Path, PathBuf};

fn temp_root(label: &str) -> PathBuf {
    let path = std::env::temp_dir().join(format!("nod-search-{label}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&path);
    std::fs::create_dir_all(&path).expect("temp root");
    path
}

fn key() -> SnapshotKey {
    SnapshotKey {
        host: "https://github.com".to_string(),
        owner: "acme".to_string(),
        repo: "widget-app".to_string(),
        sha: "a1b2c3".to_string(),
    }
}

fn stage(root: &Path, key: &SnapshotKey, files: &[(&str, &[u8])]) {
    for (path, contents) in files {
        let target = partial_dir(root, key).join(path);
        std::fs::create_dir_all(target.parent().expect("parent")).expect("staging");
        std::fs::write(&target, contents).expect("write");
    }
    promote(root, key).expect("promote");
}

#[test]
fn not_ready_snapshot_returns_none() {
    let root = temp_root("not-ready");
    assert!(list_files(&root, &key(), None).is_none());
    assert!(grep(&root, &key(), "anything", None).is_none());
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn list_files_is_sorted_relative_and_filterable() {
    let root = temp_root("list");
    let k = key();
    stage(
        &root,
        &k,
        &[
            ("src/lib/api.ts", b"x"),
            ("src/main.rs", b"y"),
            ("README.md", b"z"),
        ],
    );

    let all = list_files(&root, &k, None).expect("ready");
    assert_eq!(all.files, ["README.md", "src/lib/api.ts", "src/main.rs"]);
    assert!(!all.truncated);

    let filtered = list_files(&root, &k, Some("src/")).expect("ready");
    assert_eq!(filtered.files, ["src/lib/api.ts", "src/main.rs"]);
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn grep_reports_one_based_lines_and_respects_the_path_filter() {
    let root = temp_root("grep");
    let k = key();
    stage(
        &root,
        &k,
        &[
            ("src/auth.rs", b"fn login() {}\nfn logout() {}\nlogin();\n"),
            ("docs/auth.md", b"call login() first\n"),
        ],
    );

    let everywhere = grep(&root, &k, "login", None).expect("ready");
    assert_eq!(everywhere.hits.len(), 3);
    assert_eq!(everywhere.hits[0].path, "docs/auth.md");
    assert_eq!(everywhere.hits[0].line, 1);
    assert_eq!(everywhere.hits[1].path, "src/auth.rs");
    assert_eq!(everywhere.hits[1].line, 1);
    assert_eq!(everywhere.hits[2].line, 3);
    assert!(!everywhere.truncated);

    let scoped = grep(&root, &k, "login", Some(".rs")).expect("ready");
    assert_eq!(scoped.hits.len(), 2);
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn grep_skips_binary_files_and_clips_long_lines() {
    let root = temp_root("binary");
    let k = key();
    let long_line = format!("needle {}", "x".repeat(500));
    stage(
        &root,
        &k,
        &[
            ("blob.bin", &[0u8, 159, 146, 150, b'n'][..]),
            ("long.txt", long_line.as_bytes()),
        ],
    );

    let result = grep(&root, &k, "needle", None).expect("ready");
    assert_eq!(result.hits.len(), 1);
    assert_eq!(result.hits[0].path, "long.txt");
    assert!(result.hits[0].text.ends_with('…'));
    assert!(result.hits[0].text.chars().count() <= 241);
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn grep_caps_hits_and_flags_truncation() {
    let root = temp_root("cap");
    let k = key();
    let many_lines = "needle\n".repeat(MAX_GREP_HITS + 5);
    stage(&root, &k, &[("big.txt", many_lines.as_bytes())]);

    let result = grep(&root, &k, "needle", None).expect("ready");
    assert_eq!(result.hits.len(), MAX_GREP_HITS);
    assert!(result.truncated);
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn list_files_caps_and_flags_truncation() {
    let root = temp_root("list-cap");
    let k = key();
    let files: Vec<(String, Vec<u8>)> = (0..(MAX_LISTED_FILES + 3))
        .map(|i| (format!("f/{i:05}.txt"), b"x".to_vec()))
        .collect();
    let staged: Vec<(&str, &[u8])> = files
        .iter()
        .map(|(p, c)| (p.as_str(), c.as_slice()))
        .collect();
    stage(&root, &k, &staged);

    let result = list_files(&root, &k, None).expect("ready");
    assert_eq!(result.files.len(), MAX_LISTED_FILES);
    assert!(result.truncated);
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn read_file_slice_numbers_clamps_and_marks_truncation() {
    let root = temp_root("slice");
    let k = key();
    let body = (1..=10)
        .map(|i| format!("line {i}"))
        .collect::<Vec<_>>()
        .join("\n");
    stage(&root, &k, &[("src/a.txt", body.as_bytes())]);

    let middle = read_file_slice(&root, &k, "src/a.txt", 3, 5).expect("ready");
    assert_eq!(
        middle,
        "3: line 3\n4: line 4\n5: line 5\n[truncated — file continues to line 10]"
    );

    let tail = read_file_slice(&root, &k, "src/a.txt", 8, 99).expect("ready");
    assert!(tail.ends_with("10: line 10"));

    let past_end = read_file_slice(&root, &k, "src/a.txt", 50, 60).expect("ready");
    assert_eq!(past_end, "(file has only 10 lines)");

    assert!(read_file_slice(&root, &k, "src/missing.txt", 1, 5).is_none());
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn grep_with_an_empty_pattern_matches_nothing() {
    let root = temp_root("empty");
    let k = key();
    stage(&root, &k, &[("a.txt", b"content\n")]);

    let result = grep(&root, &k, "", None).expect("ready");
    assert!(result.hits.is_empty());
    assert!(!result.truncated);
    let _ = std::fs::remove_dir_all(&root);
}
