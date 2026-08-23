use super::*;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU32, Ordering};

static COUNTER: AtomicU32 = AtomicU32::new(0);

fn temp_root(label: &str) -> PathBuf {
    let n = COUNTER.fetch_add(1, Ordering::Relaxed);
    let path = std::env::temp_dir().join(format!(
        "nod-store-read-{label}-{}-{n}",
        std::process::id()
    ));
    let _ = std::fs::remove_dir_all(&path);
    std::fs::create_dir_all(&path).expect("temp root");
    path
}

fn key(repo: &str) -> RepoKey {
    RepoKey {
        host: "https://github.com".to_string(),
        owner: "acme".to_string(),
        repo: repo.to_string(),
    }
}

/// An origin with a nested tree, a binary blob, a glob-bait filename and a
/// symlink, cloned bare into the store layout. Returns the commit SHA.
fn fixture(root: &Path, k: &RepoKey, label: &str) -> String {
    let origin = temp_root(&format!("{label}-origin"));
    git::run(Some(&origin), &["init", "-q", "-b", "main"], None).expect("init");
    std::fs::create_dir_all(origin.join("src")).expect("mkdir");
    std::fs::write(origin.join("src/a.ts"), "export const alpha = 1;\nconst hidden = 2;\n")
        .expect("write");
    std::fs::write(origin.join("src/b.ts"), "export const beta = alpha;\n").expect("write");
    std::fs::write(origin.join("a*.ts"), "glob bait\n").expect("write");
    std::fs::write(origin.join("logo.png"), [0x89u8, 0x50, 0x00, 0x47]).expect("write");
    #[cfg(unix)]
    std::os::unix::fs::symlink("src/a.ts", origin.join("link.ts")).expect("symlink");
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

    let dir = store::git_dir(root, k);
    std::fs::create_dir_all(dir.parent().expect("parent")).expect("parent");
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
    sha
}

#[test]
fn list_files_returns_sorted_blobs_and_skips_symlinks() {
    let root = temp_root("list");
    let k = key("list-repo");
    let sha = fixture(&root, &k, "list");

    let listing = list_files(&root, &k, &sha, None).expect("listing");
    assert_eq!(
        listing.files,
        vec!["a*.ts", "logo.png", "src/a.ts", "src/b.ts"]
    );
    assert!(!listing.truncated);
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn list_files_filters_by_path_fragment() {
    let root = temp_root("list-filter");
    let k = key("list-filter-repo");
    let sha = fixture(&root, &k, "list-filter");

    let listing = list_files(&root, &k, &sha, Some("src/")).expect("listing");
    assert_eq!(listing.files, vec!["src/a.ts", "src/b.ts"]);
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn an_absent_commit_answers_none_everywhere() {
    let root = temp_root("absent");
    let k = key("absent-repo");
    let sha = fixture(&root, &k, "absent");
    let missing = "0123456789abcdef0123456789abcdef01234567";

    assert!(list_files(&root, &k, missing, None).is_none());
    assert!(read_file(&root, &k, missing, "src/a.ts").is_none());
    assert!(file_size(&root, &k, missing, "src/a.ts").is_none());
    assert!(grep(&root, &k, missing, "alpha", None).is_none());
    assert!(read_file(&root, &k, &sha, "src/a.ts").is_some());
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn read_file_round_trips_binary_bytes() {
    let root = temp_root("binary");
    let k = key("binary-repo");
    let sha = fixture(&root, &k, "binary");

    let bytes = read_file(&root, &k, &sha, "logo.png").expect("blob");
    assert_eq!(bytes, [0x89u8, 0x50, 0x00, 0x47]);
    assert_eq!(file_size(&root, &k, &sha, "logo.png"), Some(4));
    let _ = std::fs::remove_dir_all(&root);
}

#[cfg(unix)]
#[test]
fn symlinks_and_missing_paths_read_as_none() {
    let root = temp_root("symlink");
    let k = key("symlink-repo");
    let sha = fixture(&root, &k, "symlink");

    assert!(read_file(&root, &k, &sha, "link.ts").is_none());
    assert!(file_size(&root, &k, &sha, "link.ts").is_none());
    assert!(read_file(&root, &k, &sha, "no/such/file.ts").is_none());
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn glob_characters_in_paths_stay_literal() {
    let root = temp_root("glob");
    let k = key("glob-repo");
    let sha = fixture(&root, &k, "glob");

    let bytes = read_file(&root, &k, &sha, "a*.ts").expect("glob-named file");
    assert_eq!(bytes, b"glob bait\n");
    // The star must not glob onto src/a.ts or anything else.
    assert!(read_file(&root, &k, &sha, "*.ts").is_none());
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn grep_reports_path_line_and_text() {
    let root = temp_root("grep");
    let k = key("grep-repo");
    let sha = fixture(&root, &k, "grep");

    let result = grep(&root, &k, &sha, "alpha", None).expect("grep");
    assert_eq!(result.hits.len(), 2);
    assert_eq!(result.hits[0].path, "src/a.ts");
    assert_eq!(result.hits[0].line, 1);
    assert_eq!(result.hits[0].text, "export const alpha = 1;");
    assert_eq!(result.hits[1].path, "src/b.ts");
    assert!(!result.truncated);
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn grep_with_no_matches_is_empty_not_an_error() {
    let root = temp_root("grep-none");
    let k = key("grep-none-repo");
    let sha = fixture(&root, &k, "grep-none");

    let result = grep(&root, &k, &sha, "no such text anywhere", None).expect("grep");
    assert!(result.hits.is_empty());
    assert!(!result.truncated);

    let empty = grep(&root, &k, &sha, "", None).expect("grep");
    assert!(empty.hits.is_empty());
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn grep_respects_the_path_filter() {
    let root = temp_root("grep-filter");
    let k = key("grep-filter-repo");
    let sha = fixture(&root, &k, "grep-filter");

    let result = grep(&root, &k, &sha, "alpha", Some("src/b")).expect("grep");
    assert_eq!(result.hits.len(), 1);
    assert_eq!(result.hits[0].path, "src/b.ts");
    let _ = std::fs::remove_dir_all(&root);
}
