use super::*;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU32, Ordering};

static COUNTER: AtomicU32 = AtomicU32::new(0);

fn temp_dir(label: &str) -> PathBuf {
    let n = COUNTER.fetch_add(1, Ordering::Relaxed);
    let path = std::env::temp_dir().join(format!("nod-git-{label}-{}-{n}", std::process::id()));
    let _ = std::fs::remove_dir_all(&path);
    std::fs::create_dir_all(&path).expect("temp dir");
    path
}

/// A real repo with one commit; the fixture for everything that needs
/// history. Identity comes in as `-c` config so the runner needs no env
/// support beyond what production uses.
pub fn fixture_repo(label: &str) -> PathBuf {
    let dir = temp_dir(label);
    run(Some(&dir), &["init", "-q", "-b", "main"], None).expect("init");
    std::fs::write(dir.join("a.ts"), "export const a = 1;\n").expect("write");
    run(Some(&dir), &["add", "."], None).expect("add");
    commit(&dir, "first");
    dir
}

pub fn commit(dir: &PathBuf, message: &str) -> String {
    run(
        Some(dir),
        &[
            "-c",
            "user.name=Fixture",
            "-c",
            "user.email=fixture@example.com",
            "commit",
            "-q",
            "--allow-empty",
            "-am",
            message,
        ],
        None,
    )
    .expect("commit");
    run(Some(dir), &["rev-parse", "HEAD"], None)
        .expect("rev-parse")
        .trim()
        .to_string()
}

#[test]
fn run_returns_stdout() {
    let out = run(None, &["--version"], None).expect("version");
    assert!(out.starts_with("git version"));
}

#[test]
fn failures_name_the_subcommand_and_carry_gits_words() {
    let dir = temp_dir("fail");
    let err = run(Some(&dir), &["rev-parse", "--verify", "nope"], None)
        .expect_err("rev-parse outside a repo must fail");
    assert!(err.starts_with("git rev-parse failed:"));
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn a_repo_built_through_the_runner_round_trips() {
    let dir = fixture_repo("round-trip");
    let sha = run(Some(&dir), &["rev-parse", "HEAD"], None).expect("rev-parse");
    assert_eq!(sha.trim().len(), 40);
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn auth_for_matches_provider_conventions() {
    let account = |provider: &str| crate::accounts::Account {
        id: "a1".to_string(),
        provider: provider.to_string(),
        host: "https://example.com".to_string(),
        token: "tok".to_string(),
        login: "user".to_string(),
        avatar_url: String::new(),
    };
    assert_eq!(auth_for(&account("github")).username, "x-access-token");
    assert_eq!(auth_for(&account("gitlab")).username, "oauth2");
    assert_eq!(auth_for(&account("github")).password, "tok");
}
