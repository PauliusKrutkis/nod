use super::{cache_path_segment, detail_cache_name, local_blob};
use crate::model::MAX_BLOB_BYTES;
use crate::snapshot::store::{partial_dir, promote, SnapshotKey};
use std::path::{Path, PathBuf};

fn temp_root(label: &str) -> PathBuf {
    let path = std::env::temp_dir().join(format!("prflow-blob-{label}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&path);
    std::fs::create_dir_all(&path).expect("temp root");
    path
}

fn snapshot_with(root: &Path, path: &str, contents: &[u8]) -> SnapshotKey {
    let key = SnapshotKey {
        host: "https://github.com".to_string(),
        owner: "acme".to_string(),
        repo: "widget-app".to_string(),
        sha: "a1b2c3".to_string(),
    };
    let target = partial_dir(root, &key).join(path);
    std::fs::create_dir_all(target.parent().expect("parent")).expect("staging");
    std::fs::write(&target, contents).expect("write");
    promote(root, &key).expect("promote");
    key
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
fn local_blob_matches_the_shape_the_host_path_returns() {
    let root = temp_root("hit");
    let key = snapshot_with(&root, "src/lib/api.ts", b"export const x = 1;");

    let blob = local_blob(&root, &key, "src/lib/api.ts")
        .expect("snapshot hit")
        .expect("under the cap");

    assert_eq!(blob.size, 19);
    assert_eq!(blob.base64, "ZXhwb3J0IGNvbnN0IHggPSAxOw==");
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn local_blob_misses_fall_through_to_the_network() {
    let root = temp_root("miss");
    let key = snapshot_with(&root, "src/present.ts", b"x");

    assert!(local_blob(&root, &key, "src/absent.ts").is_none());

    let other_sha = SnapshotKey {
        sha: "different".to_string(),
        ..key
    };
    assert!(local_blob(&root, &other_sha, "src/present.ts").is_none());
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn local_blob_oversized_hits_error_instead_of_falling_through() {
    let root = temp_root("oversized");
    let big = vec![0u8; MAX_BLOB_BYTES + 1];
    let key = snapshot_with(&root, "big.bin", &big);

    let resolved = local_blob(&root, &key, "big.bin").expect("snapshot hit");

    let Err(err) = resolved else {
        panic!("expected the over-cap error");
    };
    assert!(err.contains("too large to preview"));
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn local_blob_preserves_binary_content_exactly() {
    let root = temp_root("binary");
    let png = [0x89u8, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0xFF];
    let key = snapshot_with(&root, "logo.png", &png);

    let blob = local_blob(&root, &key, "logo.png")
        .expect("snapshot hit")
        .expect("under the cap");

    assert_eq!(blob.size, 10);
    assert_eq!(blob.base64, "iVBORw0KGgoA/w==");
    let _ = std::fs::remove_dir_all(&root);
}
