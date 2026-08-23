use super::*;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU32, Ordering};

static COUNTER: AtomicU32 = AtomicU32::new(0);

fn temp_root(label: &str) -> PathBuf {
    let n = COUNTER.fetch_add(1, Ordering::Relaxed);
    let path = std::env::temp_dir().join(format!(
        "nod-repo-store-{label}-{}-{n}",
        std::process::id()
    ));
    let _ = std::fs::remove_dir_all(&path);
    std::fs::create_dir_all(&path).expect("temp root");
    path
}

fn key(owner: &str, repo: &str) -> RepoKey {
    RepoKey {
        host: "https://github.com".to_string(),
        owner: owner.to_string(),
        repo: repo.to_string(),
    }
}

#[test]
fn layout_is_one_bare_dir_per_repo() {
    let root = temp_root("layout");
    let dir = git_dir(&root, &key("acme", "widget-app"));
    assert!(dir.ends_with("repos/https___github.com/acme__widget-app.git"));
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn subgroup_owners_do_not_collide_with_plain_owners() {
    let root = temp_root("subgroup");
    let a = RepoKey {
        host: "https://gitlab.acme.dev".to_string(),
        owner: "team/platform".to_string(),
        repo: "widget".to_string(),
    };
    let b = RepoKey {
        host: "https://gitlab.acme.dev".to_string(),
        owner: "team".to_string(),
        repo: "platform/widget".to_string(),
    };
    assert_ne!(git_dir(&root, &a), git_dir(&root, &b));
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn staging_is_a_sibling_of_the_final_dir() {
    let root = temp_root("staging");
    let k = key("acme", "widget-app");
    let staged = partial_dir(&root, &k);
    assert_eq!(staged.parent(), git_dir(&root, &k).parent());
    assert!(staged
        .file_name()
        .and_then(|n| n.to_str())
        .is_some_and(|n| n.ends_with(".partial")));
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn a_directory_without_head_does_not_count_as_a_store() {
    let root = temp_root("exists");
    let k = key("acme", "widget-app");
    assert!(!exists(&root, &k));

    std::fs::create_dir_all(git_dir(&root, &k)).expect("crash residue");
    assert!(!exists(&root, &k));

    std::fs::write(git_dir(&root, &k).join("HEAD"), "ref: refs/heads/main\n").expect("head");
    assert!(exists(&root, &k));
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn promote_refuses_a_staging_dir_that_is_not_a_git_dir() {
    let root = temp_root("promote-refuse");
    let k = key("acme", "widget-app");
    std::fs::create_dir_all(partial_dir(&root, &k)).expect("staging");
    assert!(promote(&root, &k).is_err());
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn remove_deletes_store_and_staging() {
    let root = temp_root("remove");
    let k = key("acme", "widget-app");
    std::fs::create_dir_all(git_dir(&root, &k)).expect("store");
    std::fs::create_dir_all(partial_dir(&root, &k)).expect("staging");

    remove(&root, &k);
    assert!(!git_dir(&root, &k).exists());
    assert!(!partial_dir(&root, &k).exists());
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn promote_moves_staging_into_place() {
    let root = temp_root("promote");
    let k = key("acme", "widget-app");
    std::fs::create_dir_all(partial_dir(&root, &k)).expect("staging");
    std::fs::write(partial_dir(&root, &k).join("HEAD"), "ref: refs/heads/main\n").expect("head");

    promote(&root, &k).expect("promote");
    assert!(exists(&root, &k));
    assert!(!partial_dir(&root, &k).exists());
    let _ = std::fs::remove_dir_all(&root);
}
