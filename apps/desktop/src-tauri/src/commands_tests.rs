use super::{cache_path_segment, detail_cache_name, store_blob};
use crate::model::MAX_BLOB_BYTES;
use crate::repo_store::store::CommitKey;
use crate::repo_store::testkit::seeded_store;
use std::path::{Path, PathBuf};

fn temp_root(label: &str) -> PathBuf {
    let path = std::env::temp_dir().join(format!("nod-blob-{label}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&path);
    std::fs::create_dir_all(&path).expect("temp root");
    path
}

fn store_with(root: &Path, path: &str, contents: &[u8]) -> CommitKey {
    seeded_store(root, "acme", "widget-app", &[(path, contents)])
}

fn blob(root: &Path, key: &CommitKey, path: &str) -> Option<Result<crate::model::FileBlob, String>> {
    store_blob(root, &key.repo_key(), &key.sha, path)
}

#[test]
fn detail_cache_name_sanitizes_slashes_in_owner_and_repo() {
    assert_eq!(
        detail_cache_name(
            "gitlab-https-gitlab-acme-dev-demo-user",
            "acme-corp",
            "frontend/widget-app",
            42
        ),
        "pr_gitlab-https-gitlab-acme-dev-demo-user_acme-corp_frontend_widget-app_42.json"
    );
}

#[test]
fn cache_path_segment_replaces_slashes_and_backslashes() {
    assert_eq!(cache_path_segment("a/b\\c"), "a_b_c");
}

#[test]
fn store_blob_matches_the_shape_the_host_path_returns() {
    let root = temp_root("hit");
    let key = store_with(&root, "src/lib/api.ts", b"export const x = 1;");

    let blob = blob(&root, &key, "src/lib/api.ts")
        .expect("store hit")
        .expect("under the cap");

    assert_eq!(blob.size, 19);
    assert_eq!(blob.base64, "ZXhwb3J0IGNvbnN0IHggPSAxOw==");
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn store_blob_misses_fall_through_to_the_network() {
    let root = temp_root("miss");
    let key = store_with(&root, "src/present.ts", b"x");

    assert!(blob(&root, &key, "src/absent.ts").is_none());

    let other_sha = CommitKey {
        sha: "0123456789abcdef0123456789abcdef01234567".to_string(),
        ..key
    };
    assert!(blob(&root, &other_sha, "src/present.ts").is_none());
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn store_blob_oversized_hits_error_instead_of_falling_through() {
    let root = temp_root("oversized");
    let big = vec![0u8; MAX_BLOB_BYTES + 1];
    let key = store_with(&root, "big.bin", &big);

    let resolved = blob(&root, &key, "big.bin").expect("store hit");

    let Err(err) = resolved else {
        panic!("expected the over-cap error");
    };
    assert!(err.contains("too large to preview"));
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn store_blob_preserves_binary_content_exactly() {
    let root = temp_root("binary");
    let png = [0x89u8, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0xFF];
    let key = store_with(&root, "logo.png", &png);

    let blob = blob(&root, &key, "logo.png")
        .expect("store hit")
        .expect("under the cap");

    assert_eq!(blob.size, 10);
    assert_eq!(blob.base64, "iVBORw0KGgoA/w==");
    let _ = std::fs::remove_dir_all(&root);
}
