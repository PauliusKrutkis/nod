//! Tauri data commands. Each resolves the active account, dispatches to its
//! platform, and namespaces the on-disk caches per account so switching never
//! bleeds one host's data into another.

use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde_json::{json, Value};
use tauri::AppHandle;

use crate::accounts;
use crate::model::{
    FileBlob, GitHubUser, InboxBucket, InboxData, PullRequestDetail, RepoHit, ReviewComment,
    ReviewCommentInput, MAX_BLOB_BYTES,
};
use crate::repo_store::read as repo_store_read;
use crate::repo_store::service as repo_store_service;
use crate::repo_store::store as repo_store_store;
use crate::repo_store::store::RepoKey;
use crate::storage;

fn inbox_cache_name(account_id: &str) -> String {
    format!("inbox_{account_id}.json")
}

fn cache_path_segment(segment: &str) -> String {
    segment.replace(['/', '\\'], "_")
}

fn detail_cache_name(account_id: &str, owner: &str, repo: &str, number: u64) -> String {
    format!(
        "pr_{}_{}_{}_{}.json",
        cache_path_segment(account_id),
        cache_path_segment(owner),
        cache_path_segment(repo),
        number
    )
}

fn viewed_name(account_id: &str) -> String {
    format!("viewed_{account_id}.json")
}

/// "Is the app signed in at all?" — true when any account exists (migrating a
/// legacy single-token install on the way).
#[tauri::command]
pub async fn has_token(app: AppHandle) -> Result<bool, String> {
    Ok(!accounts::load_migrated(&app).await?.accounts.is_empty())
}

/// Legacy entry point (token paste): adds a github.com account.
#[tauri::command]
pub async fn set_token(app: AppHandle, token: String) -> Result<GitHubUser, String> {
    let info = accounts::add_account(app, "github".to_string(), None, token).await?;
    Ok(GitHubUser {
        login: info.login,
        avatar_url: info.avatar_url,
        name: String::new(),
    })
}

/// Signs the active account out.
#[tauri::command]
pub async fn clear_token(app: AppHandle) -> Result<(), String> {
    let file = accounts::load_migrated(&app).await?;
    if let Some(id) = file.active_id {
        accounts::remove_account(app, id).await?;
    }
    Ok(())
}

#[tauri::command]
pub async fn get_current_user(app: AppHandle) -> Result<GitHubUser, String> {
    let (_, platform) = accounts::active_platform(&app).await?;
    platform.current_user().await
}

#[tauri::command]
pub async fn list_inbox(app: AppHandle) -> Result<InboxData, String> {
    let (account, platform) = accounts::active_platform(&app).await?;
    let inbox = platform.inbox().await?;
    storage::write_json(&app, &inbox_cache_name(&account.id), &inbox)?;
    Ok(inbox)
}

#[tauri::command]
pub async fn get_cached_inbox(app: AppHandle) -> Result<Option<InboxData>, String> {
    let account = accounts::active_account(&app).await?;
    storage::read_json::<InboxData>(&app, &inbox_cache_name(&account.id))
}

/// Watched repositories ("Watching" tab).
fn watched_name(account_id: &str) -> String {
    format!("watched_{account_id}.json")
}
fn subscribed_cache_name(account_id: &str) -> String {
    format!("subscribed_{account_id}.json")
}

#[tauri::command]
pub async fn get_watched_repos(app: AppHandle) -> Result<Vec<String>, String> {
    let account = accounts::active_account(&app).await?;
    Ok(storage::read_json::<Vec<String>>(&app, &watched_name(&account.id))?.unwrap_or_default())
}

/// Saves the watched list and deletes the repo store of anything unwatched:
/// history for a repo nobody watches is pure disk cost, and watching again
/// just clones again. Deletion runs off-thread so the save never waits on
/// removing what can be gigabytes.
#[tauri::command]
pub async fn set_watched_repos(app: AppHandle, repos: Vec<String>) -> Result<(), String> {
    let account = accounts::active_account(&app).await?;
    let cleaned: Vec<String> = repos
        .into_iter()
        .map(|r| r.trim().trim_matches('/').to_string())
        .filter(|r| r.contains('/') && !r.is_empty())
        .collect();
    let before =
        storage::read_json::<Vec<String>>(&app, &watched_name(&account.id))?.unwrap_or_default();
    storage::write_json(&app, &watched_name(&account.id), &cleaned)?;

    let Ok(root) = storage::cache_dir(&app) else {
        return Ok(());
    };
    let dropped: Vec<RepoKey> = before
        .iter()
        .filter(|repo| !cleaned.contains(repo))
        .filter_map(|repo| repo.split_once('/'))
        .map(|(owner, name)| RepoKey {
            host: account.host.clone(),
            owner: owner.to_string(),
            repo: name.to_string(),
        })
        .collect();
    if !dropped.is_empty() {
        tauri::async_runtime::spawn_blocking(move || {
            for key in &dropped {
                repo_store_store::remove(&root, key);
            }
        });
    }
    // Newly watched repos warm in the background — clone, tips, first
    // derivation — so the ledger's first open is already sub-second
    // (docs/LEDGER.md "Productionization" item 5).
    for repo in cleaned.iter().filter(|repo| !before.contains(repo)) {
        crate::ledger::warm(&app, repo.clone());
    }
    Ok(())
}

#[tauri::command]
pub async fn search_repos(app: AppHandle, query: String) -> Result<Vec<RepoHit>, String> {
    let (_, platform) = accounts::active_platform(&app).await?;
    platform.search_repos(&query).await
}

#[tauri::command]
pub async fn list_subscribed(app: AppHandle) -> Result<InboxBucket, String> {
    let (account, platform) = accounts::active_platform(&app).await?;
    let repos =
        storage::read_json::<Vec<String>>(&app, &watched_name(&account.id))?.unwrap_or_default();
    let bucket = platform.subscribed_prs(&repos).await?;
    storage::write_json(&app, &subscribed_cache_name(&account.id), &bucket)?;
    Ok(bucket)
}

#[tauri::command]
pub async fn get_cached_subscribed(app: AppHandle) -> Result<Option<InboxBucket>, String> {
    let account = accounts::active_account(&app).await?;
    storage::read_json::<InboxBucket>(&app, &subscribed_cache_name(&account.id))
}

#[tauri::command]
pub async fn get_pull_request_detail(
    app: AppHandle,
    owner: String,
    repo: String,
    number: u64,
) -> Result<PullRequestDetail, String> {
    let (account, platform) = accounts::active_platform(&app).await?;
    let detail = platform.pr_detail(&owner, &repo, number).await?;
    storage::write_json(
        &app,
        &detail_cache_name(&account.id, &owner, &repo, number),
        &detail,
    )?;
    Ok(detail)
}

#[tauri::command]
pub async fn get_cached_pull_request_detail(
    app: AppHandle,
    owner: String,
    repo: String,
    number: u64,
) -> Result<Option<PullRequestDetail>, String> {
    let account = accounts::active_account(&app).await?;
    storage::read_json::<PullRequestDetail>(
        &app,
        &detail_cache_name(&account.id, &owner, &repo, number),
    )
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn create_review_comment(
    app: AppHandle,
    owner: String,
    repo: String,
    number: u64,
    body: String,
    commit_id: String,
    path: String,
    line: u64,
    side: String,
    start_line: Option<u64>,
) -> Result<ReviewComment, String> {
    let (_, platform) = accounts::active_platform(&app).await?;
    platform
        .create_review_comment(
            &owner, &repo, number, &body, &commit_id, &path, line, &side, start_line,
        )
        .await
}

#[tauri::command]
pub async fn reply_to_review_comment(
    app: AppHandle,
    owner: String,
    repo: String,
    number: u64,
    body: String,
    in_reply_to: u64,
) -> Result<ReviewComment, String> {
    let (_, platform) = accounts::active_platform(&app).await?;
    platform
        .reply_to_review_comment(&owner, &repo, number, &body, in_reply_to)
        .await
}

/// Edit an inline review comment's body. Gated in the UI to the signed-in
/// user's own comments; the hosts reject foreign ids anyway.
#[tauri::command]
pub async fn update_review_comment(
    app: AppHandle,
    owner: String,
    repo: String,
    number: u64,
    comment_id: u64,
    body: String,
) -> Result<(), String> {
    let (_, platform) = accounts::active_platform(&app).await?;
    platform
        .update_review_comment(&owner, &repo, number, comment_id, &body)
        .await
}

/// Delete an inline review comment. Gated in the UI to the signed-in user's
/// own comments behind a two-step confirm.
#[tauri::command]
pub async fn delete_review_comment(
    app: AppHandle,
    owner: String,
    repo: String,
    number: u64,
    comment_id: u64,
) -> Result<(), String> {
    let (_, platform) = accounts::active_platform(&app).await?;
    platform
        .delete_review_comment(&owner, &repo, number, comment_id)
        .await
}

/// Resolve / unresolve an inline review thread. `thread_id` is the provider's
/// thread handle carried on ReviewComment (GraphQL node id / discussion id).
#[tauri::command]
pub async fn resolve_thread(
    app: AppHandle,
    owner: String,
    repo: String,
    number: u64,
    thread_id: String,
    resolved: bool,
) -> Result<(), String> {
    let (_, platform) = accounts::active_platform(&app).await?;
    platform
        .resolve_thread(&owner, &repo, number, &thread_id, resolved)
        .await
}

#[tauri::command]
pub async fn create_issue_comment(
    app: AppHandle,
    owner: String,
    repo: String,
    number: u64,
    body: String,
) -> Result<(), String> {
    let (_, platform) = accounts::active_platform(&app).await?;
    platform
        .create_issue_comment(&owner, &repo, number, &body)
        .await
}

/// Edit a PR-level (conversation) comment's body. Gated in the UI to the
/// signed-in user's own comments.
#[tauri::command]
pub async fn update_issue_comment(
    app: AppHandle,
    owner: String,
    repo: String,
    number: u64,
    comment_id: u64,
    body: String,
) -> Result<(), String> {
    let (_, platform) = accounts::active_platform(&app).await?;
    platform
        .update_issue_comment(&owner, &repo, number, comment_id, &body)
        .await
}

/// Delete a PR-level (conversation) comment. Gated in the UI to the
/// signed-in user's own comments behind a two-step confirm.
#[tauri::command]
pub async fn delete_issue_comment(
    app: AppHandle,
    owner: String,
    repo: String,
    number: u64,
    comment_id: u64,
) -> Result<(), String> {
    let (_, platform) = accounts::active_platform(&app).await?;
    platform
        .delete_issue_comment(&owner, &repo, number, comment_id)
        .await
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn submit_review(
    app: AppHandle,
    owner: String,
    repo: String,
    number: u64,
    event: String,
    body: String,
    commit_id: String,
    comments: Vec<ReviewCommentInput>,
) -> Result<(), String> {
    let (_, platform) = accounts::active_platform(&app).await?;
    platform
        .submit_review(&owner, &repo, number, &event, &body, &commit_id, &comments)
        .await
}

/// Serves a file from the repo store when it has this exact ref, otherwise
/// from the host. Resolution lives here rather than in the webview so every
/// blob consumer — full-file expansion, image diffs — gets it without
/// knowing the local source exists, and so a miss is indistinguishable from
/// a plain network read. `ref` is a head SHA in practice; a branch name
/// simply misses and falls through.
///
/// The size cap is applied to local reads too: it exists because the blob is
/// base64'd into the webview, which is just as true when the bytes came off
/// local disk. An oversized local hit fails immediately with the error the
/// host path would produce — downloading the file first could only reproduce
/// the same answer.
#[tauri::command]
pub async fn get_file_blob(
    app: AppHandle,
    owner: String,
    repo: String,
    path: String,
    r#ref: String,
) -> Result<FileBlob, String> {
    let account = accounts::active_account(&app).await?;
    if let Ok(root) = storage::cache_dir(&app) {
        let repo_key = RepoKey {
            host: account.host.clone(),
            owner: owner.clone(),
            repo: repo.clone(),
        };
        let store_path = path.clone();
        let store_ref = r#ref.clone();
        let resolved = tauri::async_runtime::spawn_blocking(move || {
            store_blob(&root, &repo_key, &store_ref, &store_path)
        })
        .await
        .map_err(|e| format!("local blob read failed: {e}"))?;
        if let Some(resolved) = resolved {
            return resolved;
        }
    }
    let platform = accounts::platform_for(&account)?;
    platform.file_blob(&owner, &repo, &path, &r#ref).await
}

/// Reads a blob out of the repo store in the shape the host path returns.
/// `None` means the store has nothing for this ref and the caller should
/// fetch over the network; `Some(Err)` is an oversized hit, answered from
/// tree metadata instead of a read that could only end the same way.
fn store_blob(
    root: &std::path::Path,
    key: &RepoKey,
    sha: &str,
    path: &str,
) -> Option<Result<FileBlob, String>> {
    let size = repo_store_read::file_size(root, key, sha, path)?;
    if size > MAX_BLOB_BYTES as u64 {
        return Some(Err(format!(
            "File is too large to preview ({} MB).",
            size / (1024 * 1024)
        )));
    }
    let bytes = repo_store_read::read_file(root, key, sha, path)?;
    Some(Ok(FileBlob {
        base64: STANDARD.encode(&bytes),
        size: bytes.len() as u64,
    }))
}

async fn repo_key(app: &AppHandle, owner: String, repo: String) -> Result<RepoKey, String> {
    let account = accounts::active_account(app).await?;
    Ok(RepoKey {
        host: account.host,
        owner,
        repo,
    })
}

/// Starts cloning/fetching the repo store toward `sha` unless it is already
/// there or under way. Fire-and-forget; callers poll `repo_store_status`.
#[tauri::command]
pub async fn ensure_repo_store(
    app: AppHandle,
    owner: String,
    repo: String,
    sha: String,
) -> Result<repo_store_service::RepoStoreStatus, String> {
    let key = repo_key(&app, owner, repo).await?;
    Ok(repo_store_service::ensure(&app, key, sha))
}

/// Answering readiness spawns `git rev-parse`, so the check hops to a
/// blocking thread like the search commands below.
#[tauri::command]
pub async fn repo_store_status(
    app: AppHandle,
    owner: String,
    repo: String,
    sha: String,
) -> Result<repo_store_service::RepoStoreStatus, String> {
    let key = repo_key(&app, owner, repo).await?;
    let root = storage::cache_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || repo_store_service::status(&root, &key, &sha))
        .await
        .map_err(|e| format!("repo store status failed: {e}"))
}

/// Both search commands hop to a blocking thread: they spawn git against a
/// possibly large tree, and the review screen's hot-path invokes share this
/// async runtime.
#[tauri::command]
pub async fn list_repo_files(
    app: AppHandle,
    owner: String,
    repo: String,
    sha: String,
    path_contains: Option<String>,
) -> Result<repo_store_read::FileListing, String> {
    let key = repo_key(&app, owner, repo).await?;
    let root = storage::cache_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        repo_store_read::list_files(&root, &key, &sha, path_contains.as_deref())
    })
    .await
    .map_err(|e| format!("file listing failed: {e}"))?
    .ok_or_else(|| "repository not ready".to_string())
}

#[tauri::command]
pub async fn search_repo_content(
    app: AppHandle,
    owner: String,
    repo: String,
    sha: String,
    pattern: String,
    path_contains: Option<String>,
) -> Result<repo_store_read::GrepResult, String> {
    let key = repo_key(&app, owner, repo).await?;
    let root = storage::cache_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        repo_store_read::grep(&root, &key, &sha, &pattern, path_contains.as_deref())
    })
    .await
    .map_err(|e| format!("search failed: {e}"))?
    .ok_or_else(|| "repository not ready".to_string())
}

#[tauri::command]
pub async fn get_upload_blob(
    app: AppHandle,
    owner: String,
    repo: String,
    secret: String,
    filename: String,
) -> Result<FileBlob, String> {
    let (_, platform) = accounts::active_platform(&app).await?;
    platform
        .upload_blob(&owner, &repo, &secret, &filename)
        .await
}

#[tauri::command]
pub async fn get_viewed_map(app: AppHandle) -> Result<Value, String> {
    let account = accounts::active_account(&app).await?;
    if let Some(v) = storage::read_json::<Value>(&app, &viewed_name(&account.id))? {
        return Ok(v);
    }
    Ok(storage::read_json::<Value>(&app, "viewed.json")?.unwrap_or_else(|| json!({})))
}

#[tauri::command]
pub async fn set_viewed_map(app: AppHandle, map: Value) -> Result<(), String> {
    let account = accounts::active_account(&app).await?;
    storage::write_json(&app, &viewed_name(&account.id), &map)
}

#[cfg(test)]
#[path = "commands_tests.rs"]
mod tests;
