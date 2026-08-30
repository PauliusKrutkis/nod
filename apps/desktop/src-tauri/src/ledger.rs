//! Review-ledger seam (docs/LEDGER.md): runs the bundled ledger sidecar (our
//! own `packages/ledger` CLI compiled to a standalone binary by
//! `scripts/build-ledger-sidecar.mjs`, shipped via `bundle.externalBin`)
//! against the repo store's bare clone — any watched repository works, no
//! local checkout and nothing committed to the target repo. The webview
//! addresses repos as `owner/repo`; Rust resolves the store clone, the tip
//! (the remote-tracking default branch — a bare clone's own branches stop
//! moving after the clone), the signed-in login as the fact actor, and a
//! durable state dir holding the fact journal and the first-open epoch
//! (store clones live in the wipeable cache dir; review history must not).
//! A repo with no ledger anywhere is adopted on first touch: `init` runs
//! with the current tip as the epoch, entirely in host state.
//!
//! The sidecar's `--json` output passes through untouched — the webview
//! owns the shape (`LedgerStatus` in types.ts); Rust guarantees only
//! "valid JSON from a real run". Tauri strips the target-triple suffix
//! when it places the binary next to the app executable; debug builds not
//! launched through tauri (cargo test) fall back to the as-built
//! `binaries/ledger-<triple>` under the crate root.

use std::path::{Path, PathBuf};
use std::process::Command;

use serde_json::Value;
use tauri::AppHandle;

use crate::accounts;
use crate::repo_store::git::{self, GitAuth};
use crate::repo_store::service;
use crate::repo_store::store::{self, RepoKey};
use crate::storage;

fn sidecar_path() -> Result<PathBuf, String> {
    let exe = std::env::current_exe()
        .map_err(|e| format!("could not locate the app executable: {e}"))?;
    let bundled = exe
        .parent()
        .ok_or("app executable has no parent directory")?
        .join(format!("ledger{}", std::env::consts::EXE_SUFFIX));
    if bundled.is_file() {
        return Ok(bundled);
    }
    #[cfg(debug_assertions)]
    {
        let built = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("binaries")
            .join(format!(
                "ledger-{}{}",
                env!("NOD_TARGET_TRIPLE"),
                std::env::consts::EXE_SUFFIX
            ));
        if built.is_file() {
            return Ok(built);
        }
    }
    Err(format!("ledger sidecar missing: {}", bundled.display()))
}

/// Everything one sidecar invocation needs, resolved from the repo key.
struct LedgerRepo {
    git_dir: PathBuf,
    /// Ref the derivation runs against: the remote-tracking default branch
    /// when it exists, the clone-time local branch otherwise.
    tip: String,
    state_dir: PathBuf,
    actor: String,
}

fn split_key(repo_key: &str) -> Result<(String, String), String> {
    match repo_key.split_once('/') {
        Some((owner, repo)) if !owner.is_empty() && !repo.is_empty() => {
            Ok((owner.to_string(), repo.to_string()))
        }
        _ => Err(format!("not an owner/repo key: {repo_key}")),
    }
}

/// The default branch as git cloned it: bare clones point HEAD at the
/// server's default, and that symref survives every later fetch.
fn default_tip(git_dir: &PathBuf) -> String {
    let branch = git::run(Some(git_dir), &["symbolic-ref", "--quiet", "HEAD"], None)
        .ok()
        .map(|head| {
            let head = head.trim().to_string();
            head.strip_prefix("refs/heads/")
                .unwrap_or(&head)
                .to_string()
        });
    let Some(branch) = branch else {
        return "HEAD".to_string();
    };
    for candidate in [
        format!("refs/remotes/origin/{branch}"),
        format!("refs/heads/{branch}"),
    ] {
        let verified = git::run(
            Some(git_dir),
            &[
                "rev-parse",
                "--verify",
                "--quiet",
                &format!("{candidate}^{{commit}}"),
            ],
            None,
        );
        if verified.is_ok() {
            return candidate;
        }
    }
    "HEAD".to_string()
}

/// Resolves the account and store, cloning and refreshing tips as needed.
/// `refresh` is true only for the status entry point: signing and
/// commenting must stay fast, and they act on the tip status showed.
async fn prepare(
    app: &AppHandle,
    repo_key: &str,
    refresh: bool,
) -> Result<LedgerRepo, String> {
    let (owner, repo) = split_key(repo_key)?;
    let account = accounts::active_account(app).await?;
    let key = RepoKey {
        host: account.host.clone(),
        owner,
        repo,
    };
    let root = storage::cache_dir(app)?;
    let state_dir = store::ledger_state_dir(&storage::config_dir(app)?, &key);
    let actor = account.login.clone();
    let auth: GitAuth = git::auth_for(&account);
    tauri::async_runtime::spawn_blocking(move || -> Result<LedgerRepo, String> {
        service::ensure_branch_tips(&root, &key, &auth, refresh)?;
        std::fs::create_dir_all(&state_dir)
            .map_err(|e| format!("could not create the ledger state dir: {e}"))?;
        let git_dir = store::git_dir(&root, &key);
        let tip = default_tip(&git_dir);
        Ok(LedgerRepo {
            actor,
            git_dir,
            state_dir,
            tip,
        })
    })
    .await
    .map_err(|e| format!("ledger prepare failed: {e}"))?
}

impl LedgerRepo {
    /// Runs one sidecar command. Positionals land after `--` so bodies and
    /// targets can never read as flags. A repo untouched by any ledger is
    /// adopted on the spot: `init` records the current tip as the epoch in
    /// the state dir, then the original command reruns.
    fn run(&self, command: &str, positional: &[&str]) -> Result<String, String> {
        match self.spawn(command, positional) {
            Err(e) if e.contains("no ledger here yet") => {
                self.spawn("init", &[&self.tip])?;
                self.spawn(command, positional)
            }
            other => other,
        }
    }

    fn spawn(&self, command: &str, positional: &[&str]) -> Result<String, String> {
        let sidecar = sidecar_path()?;
        let mut args: Vec<&str> = vec![
            "--repo",
            self.git_dir.to_str().ok_or("store path is not UTF-8")?,
            "--tip",
            &self.tip,
            "--actor",
            &self.actor,
            "--state-dir",
            self.state_dir.to_str().ok_or("state path is not UTF-8")?,
        ];
        if matches!(command, "status" | "session") {
            args.push("--json");
        }
        args.push(command);
        args.push("--");
        args.extend_from_slice(positional);
        let output = Command::new(&sidecar)
            .args(&args)
            .output()
            .map_err(|e| format!("could not launch the ledger sidecar: {e}"))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let stdout = String::from_utf8_lossy(&output.stdout);
            let detail = if stderr.trim().is_empty() {
                stdout
            } else {
                stderr
            };
            return Err(format!("ledger {command} failed: {}", detail.trim()));
        }
        Ok(String::from_utf8_lossy(&output.stdout).into_owned())
    }

    fn run_json(&self, command: &str, positional: &[&str]) -> Result<Value, String> {
        let stdout = self.run(command, positional)?;
        serde_json::from_str(&stdout).map_err(|e| format!("ledger returned invalid JSON: {e}"))
    }
}

#[tauri::command]
pub async fn ledger_status(app: AppHandle, repo_key: String) -> Result<Value, String> {
    let repo = prepare(&app, &repo_key, true).await?;
    tauri::async_runtime::spawn_blocking(move || repo.run_json("status", &[]))
        .await
        .map_err(|e| format!("ledger status failed: {e}"))?
}

#[tauri::command]
pub async fn ledger_session(
    app: AppHandle,
    repo_key: String,
    targets: Vec<String>,
) -> Result<Value, String> {
    let repo = prepare(&app, &repo_key, false).await?;
    tauri::async_runtime::spawn_blocking(move || {
        let targets: Vec<&str> = targets.iter().map(String::as_str).collect();
        repo.run_json("session", &targets)
    })
    .await
    .map_err(|e| format!("ledger session failed: {e}"))?
}

#[tauri::command]
pub async fn ledger_review(
    app: AppHandle,
    repo_key: String,
    target: String,
) -> Result<(), String> {
    let repo = prepare(&app, &repo_key, false).await?;
    tauri::async_runtime::spawn_blocking(move || repo.run("review", &[&target]).map(|_| ()))
        .await
        .map_err(|e| format!("ledger review failed: {e}"))?
}

#[tauri::command]
pub async fn ledger_approve(
    app: AppHandle,
    repo_key: String,
    topic: String,
) -> Result<(), String> {
    let repo = prepare(&app, &repo_key, false).await?;
    tauri::async_runtime::spawn_blocking(move || repo.run("approve", &[&topic]).map(|_| ()))
        .await
        .map_err(|e| format!("ledger approve failed: {e}"))?
}

/// Start a thread on a region (`target` is `path:start-end`), or answer an
/// existing one when `parent` carries the root fact id.
#[tauri::command]
pub async fn ledger_comment(
    app: AppHandle,
    repo_key: String,
    target: String,
    body: String,
    parent: Option<String>,
) -> Result<(), String> {
    let repo = prepare(&app, &repo_key, false).await?;
    tauri::async_runtime::spawn_blocking(move || {
        match &parent {
            Some(root) => repo.run("comment", &["--reply", root, &body]),
            None => repo.run("comment", &[&target, &body]),
        }
        .map(|_| ())
    })
    .await
    .map_err(|e| format!("ledger comment failed: {e}"))?
}

#[tauri::command]
pub async fn ledger_resolve(
    app: AppHandle,
    repo_key: String,
    fact_id: String,
) -> Result<(), String> {
    let repo = prepare(&app, &repo_key, false).await?;
    tauri::async_runtime::spawn_blocking(move || repo.run("resolve", &[&fact_id]).map(|_| ()))
        .await
        .map_err(|e| format!("ledger resolve failed: {e}"))?
}
