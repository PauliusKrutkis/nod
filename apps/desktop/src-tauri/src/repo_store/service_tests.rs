use super::*;
use std::sync::atomic::{AtomicU32, Ordering};

static COUNTER: AtomicU32 = AtomicU32::new(0);

fn temp_root(label: &str) -> PathBuf {
    let n = COUNTER.fetch_add(1, Ordering::Relaxed);
    let path = std::env::temp_dir().join(format!(
        "nod-store-service-{label}-{}-{n}",
        std::process::id()
    ));
    let _ = std::fs::remove_dir_all(&path);
    std::fs::create_dir_all(&path).expect("temp root");
    path
}

/// Every test uses its own repo name: the registry is process-global, so
/// shared keys would leak state across tests, exactly as in the snapshot
/// service tests.
fn key(repo: &str) -> RepoKey {
    RepoKey {
        host: "https://github.com".to_string(),
        owner: "acme".to_string(),
        repo: repo.to_string(),
    }
}

fn dummy_auth() -> GitAuth {
    GitAuth {
        username: "x-access-token".to_string(),
        password: String::new(),
    }
}

/// A local origin with one commit, configured to serve SHA wants the way the
/// real hosts do, plus a bare store cloned from it at this service's layout.
fn origin_and_store(root: &Path, k: &RepoKey, label: &str) -> (PathBuf, String) {
    let origin = temp_root(&format!("{label}-origin"));
    git::run(Some(&origin), &["init", "-q", "-b", "main"], None).expect("init");
    git::run(
        Some(&origin),
        &["config", "uploadpack.allowAnySHA1InWant", "true"],
        None,
    )
    .expect("config");
    std::fs::write(origin.join("a.ts"), "export const a = 1;\n").expect("write");
    git::run(Some(&origin), &["add", "."], None).expect("add");
    let sha = commit(&origin, "first");

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
    (origin, sha)
}

fn commit(dir: &Path, message: &str) -> String {
    git::run(
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
    git::run(Some(dir), &["rev-parse", "HEAD"], None)
        .expect("rev-parse")
        .trim()
        .to_string()
}

#[test]
fn shas_are_plain_hex_or_refused() {
    assert!(valid_sha("d2962f6aa11de6cb52930f1a95b4e0f34c437f38"));
    assert!(valid_sha("d2962f6"));
    assert!(!valid_sha("main"));
    assert!(!valid_sha("d2962f"));
    assert!(!valid_sha("--upload-pack=evil"));
    assert!(!valid_sha("HEAD^{commit}"));
}

#[test]
fn clone_url_tolerates_a_trailing_slash_on_the_host() {
    let k = RepoKey {
        host: "https://gitlab.acme.dev/".to_string(),
        owner: "team/platform".to_string(),
        repo: "widget".to_string(),
    };
    assert_eq!(
        clone_url(&k),
        "https://gitlab.acme.dev/team/platform/widget.git"
    );
}

#[test]
fn unknown_keys_start_idle() {
    let root = temp_root("idle");
    assert_eq!(
        status(&root, &key("never-seen"), "d2962f6").state,
        RepoStoreState::Idle
    );
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn busy_work_blocks_every_sha_of_the_repo() {
    let root = temp_root("busy");
    let k = key("busy-repo");
    set_status(&k, "aaaa111", RepoStoreStatus::new(RepoStoreState::Cloning, ""));

    assert_eq!(status(&root, &k, "bbbb222").state, RepoStoreState::Cloning);
    let refused = claim(&root, &k, "bbbb222").expect_err("busy stores must not be reclaimed");
    assert_eq!(refused.state, RepoStoreState::Cloning);
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn failure_sticks_for_its_sha_and_only_its_sha() {
    let root = temp_root("failure");
    let k = key("failed-repo");
    set_status(
        &k,
        "aaaa111",
        RepoStoreStatus::new(RepoStoreState::Failed, "network error"),
    );

    assert_eq!(status(&root, &k, "aaaa111").state, RepoStoreState::Failed);
    assert_eq!(status(&root, &k, "bbbb222").state, RepoStoreState::Idle);

    let refused = claim(&root, &k, "aaaa111").expect_err("same SHA must stay failed");
    assert_eq!(refused.state, RepoStoreState::Failed);
    assert_eq!(
        claim(&root, &k, "bbbb222").expect("a new SHA reclaims the key"),
        RepoStoreState::Cloning
    );
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn a_store_on_disk_reads_as_ready_over_a_stale_failure() {
    let root = temp_root("disk-wins");
    let k = key("disk-wins-repo");
    let (_origin, sha) = origin_and_store(&root, &k, "disk-wins");
    set_status(
        &k,
        &sha,
        RepoStoreStatus::new(RepoStoreState::Failed, "earlier attempt"),
    );

    assert_eq!(status(&root, &k, &sha).state, RepoStoreState::Ready);
    let refused = claim(&root, &k, &sha).expect_err("present commits must not re-fetch");
    assert_eq!(refused.state, RepoStoreState::Ready);
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn fetch_commit_pins_a_sha_the_clone_does_not_have() {
    let root = temp_root("fetch");
    let k = key("fetch-repo");
    let (origin, _first) = origin_and_store(&root, &k, "fetch");
    let new_sha = commit(&origin, "after the clone");
    assert!(!has_commit(&root, &k, &new_sha));

    let dir = store::git_dir(&root, &k);
    fetch_commit(&dir, &new_sha, &dummy_auth()).expect("fetch");

    assert!(has_commit(&root, &k, &new_sha));
    git::run(
        Some(&dir),
        &[
            "rev-parse",
            "--verify",
            &format!("refs/nod/pins/{new_sha}"),
        ],
        None,
    )
    .expect("the fetched commit must be pinned against gc");
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn sync_store_fetches_into_an_existing_store() {
    let root = temp_root("sync");
    let k = key("sync-repo");
    let (origin, _first) = origin_and_store(&root, &k, "sync");
    let new_sha = commit(&origin, "second");

    sync_store(&root, &k, &new_sha, &dummy_auth()).expect("sync");
    assert!(has_commit(&root, &k, &new_sha));
    assert_eq!(status(&root, &k, &new_sha).state, RepoStoreState::Ready);
    let _ = std::fs::remove_dir_all(&root);
}
