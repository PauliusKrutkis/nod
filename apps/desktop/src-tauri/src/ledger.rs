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

use std::io::{BufRead, BufReader, Read};
use std::path::PathBuf;
use std::process::{Command, Stdio};

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter};

use crate::accounts;
use crate::http::log;
use crate::ledger_topics;
use crate::repo_store::git::{self, GitAuth};
use crate::repo_store::service;
use crate::repo_store::store::{self, RepoKey};
use crate::storage;

/// One step of getting a repo's ledger on screen, streamed to the webview
/// so a cold open (clone → blame pass → derivation) reads as staged
/// progress instead of a mute spinner. `blame` carries file counts; the
/// terminal stages are `ready` and `failed`.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LedgerPrepEvent {
    repo_key: String,
    stage: String,
    done: Option<u64>,
    total: Option<u64>,
    detail: String,
}

fn emit_prep(app: &AppHandle, repo_key: &str, stage: &str, done: Option<u64>, total: Option<u64>) {
    let _ = app.emit(
        "ledger-prep",
        LedgerPrepEvent {
            detail: String::new(),
            done,
            repo_key: repo_key.to_string(),
            stage: stage.to_string(),
            total,
        },
    );
}

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
pub(crate) struct LedgerRepo {
    git_dir: PathBuf,
    /// Ref the derivation runs against: the remote-tracking default branch
    /// when it exists, the clone-time local branch otherwise.
    tip: String,
    state_dir: PathBuf,
    actor: String,
}

pub(crate) fn split_key(repo_key: &str) -> Result<(String, String), String> {
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
    if refresh {
        let stage = if store::exists(&root, &key) {
            "fetching"
        } else {
            "cloning"
        };
        emit_prep(app, repo_key, stage, None, None);
    }
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
        match self.spawn(command, positional, None) {
            Err(e) if e.contains("no ledger here yet") => {
                self.spawn("init", &[&self.tip], None)?;
                self.spawn(command, positional, None)
            }
            other => other,
        }
    }

    pub(crate) fn tip(&self) -> &str {
        &self.tip
    }

    /// Writes agent `assigned` facts — the LLM stage's output. The `--agent`
    /// flag marks the facts as proposals, and the actor is the model's
    /// identity rather than the signed-in login. No adoption retry: this only
    /// runs after a successful `status` on the same state dir, so the ledger
    /// exists.
    pub(crate) fn assign_as_agent(
        &self,
        actor: &str,
        pairs: &[&str],
    ) -> Result<(), String> {
        self.spawn("assign", pairs, Some(actor)).map(|_| ())
    }

    /// A fresh path for one --json payload. Large payloads through the
    /// sidecar's stdout pipe hit the compiled runtime's flush-on-exit
    /// truncation (dogfooded as a session cut at exactly 64KB), so JSON
    /// rides a file instead; unique per call so concurrent commands never
    /// collide.
    fn out_path(&self) -> PathBuf {
        static SEQ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let n = SEQ.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        self.state_dir
            .join(format!("out-{}-{n}.json", std::process::id()))
    }

    fn spawn(
        &self,
        command: &str,
        positional: &[&str],
        agent_actor: Option<&str>,
    ) -> Result<String, String> {
        let sidecar = sidecar_path()?;
        let mut args: Vec<&str> = vec![
            "--repo",
            self.git_dir.to_str().ok_or("store path is not UTF-8")?,
            "--tip",
            &self.tip,
            "--actor",
            agent_actor.unwrap_or(&self.actor),
            "--state-dir",
            self.state_dir.to_str().ok_or("state path is not UTF-8")?,
        ];
        if agent_actor.is_some() {
            args.push("--agent");
        }
        let json = matches!(command, "status" | "session");
        let out = self.out_path();
        let out_arg = out.to_str().ok_or("state path is not UTF-8")?.to_string();
        if json {
            args.push("--json");
            args.push("--out");
            args.push(&out_arg);
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
        if json {
            let payload = std::fs::read_to_string(&out)
                .map_err(|e| format!("ledger {command} wrote no payload: {e}"))?;
            let _ = std::fs::remove_file(&out);
            return Ok(payload);
        }
        Ok(String::from_utf8_lossy(&output.stdout).into_owned())
    }

    fn run_json(&self, command: &str, positional: &[&str]) -> Result<Value, String> {
        let stdout = self.run(command, positional)?;
        serde_json::from_str(&stdout).map_err(|e| format!("ledger returned invalid JSON: {e}"))
    }

    /// `status --json --progress` with the sidecar's NDJSON stderr streamed
    /// into `ledger-prep` events as it derives. Auto-adopts like `run`.
    fn run_status_streaming(&self, app: &AppHandle, repo_key: &str) -> Result<Value, String> {
        match self.stream_status(app, repo_key) {
            Err(e) if e.contains("no ledger here yet") => {
                self.spawn("init", &[&self.tip], None)?;
                self.stream_status(app, repo_key)
            }
            other => other,
        }
    }

    fn stream_status(&self, app: &AppHandle, repo_key: &str) -> Result<Value, String> {
        let sidecar = sidecar_path()?;
        let out = self.out_path();
        let out_arg = out
            .to_str()
            .ok_or("state path is not UTF-8")?
            .to_string();
        let mut child = Command::new(&sidecar)
            .args([
                "--repo",
                self.git_dir.to_str().ok_or("store path is not UTF-8")?,
                "--tip",
                &self.tip,
                "--actor",
                &self.actor,
                "--state-dir",
                self.state_dir.to_str().ok_or("state path is not UTF-8")?,
                "--json",
                "--out",
                &out_arg,
                "--progress",
                "status",
            ])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("could not launch the ledger sidecar: {e}"))?;

        // stderr carries two languages: NDJSON progress lines while the
        // derivation runs, plain text when something goes wrong. Progress
        // becomes events as it arrives; everything else is kept as the
        // error detail.
        let stderr = child
            .stderr
            .take()
            .ok_or("the ledger sidecar has no stderr")?;
        let event_app = app.clone();
        let event_key = repo_key.to_string();
        let reader = std::thread::spawn(move || {
            let mut noise = String::new();
            for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                match serde_json::from_str::<Value>(&line) {
                    Ok(progress) if progress.get("stage").is_some() => {
                        emit_prep(
                            &event_app,
                            &event_key,
                            progress["stage"].as_str().unwrap_or(""),
                            progress.get("done").and_then(Value::as_u64),
                            progress.get("total").and_then(Value::as_u64),
                        );
                    }
                    _ => {
                        noise.push_str(&line);
                        noise.push('\n');
                    }
                }
            }
            noise
        });

        let mut stdout = String::new();
        if let Some(mut pipe) = child.stdout.take() {
            let _ = pipe.read_to_string(&mut stdout);
        }
        let status = child
            .wait()
            .map_err(|e| format!("the ledger sidecar died: {e}"))?;
        let noise = reader.join().unwrap_or_default();
        if !status.success() {
            let detail = if noise.trim().is_empty() {
                stdout
            } else {
                noise
            };
            return Err(format!("ledger status failed: {}", detail.trim()));
        }
        let payload = std::fs::read_to_string(&out)
            .map_err(|e| format!("ledger status wrote no payload: {e}"))?;
        let _ = std::fs::remove_file(&out);
        serde_json::from_str(&payload)
            .map_err(|e| format!("ledger returned invalid JSON: {e}"))
    }
}

/// Every named topic gets a display number (#N) the first derivation that
/// sees it: mint `numbered` facts for the unnumbered ones and re-derive so
/// the payload carries them (warm caches make the second pass cheap).
/// Numbering is a nicety — any failure keeps the original status.
fn mint_topic_numbers(repo: &LedgerRepo, status: Value) -> Value {
    let unnumbered: Vec<String> = status["topics"]
        .as_array()
        .map(|topics| {
            topics
                .iter()
                .filter(|t| t["number"].is_null())
                .filter_map(|t| t["id"].as_str())
                .filter(|id| !ledger_topics::is_bucket_label(id))
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default();
    if unnumbered.is_empty() {
        return status;
    }
    let refs: Vec<&str> = unnumbered.iter().map(String::as_str).collect();
    if let Err(e) = repo.spawn("number", &refs, None) {
        log(&format!("ledger number failed for {refs:?}: {e}"));
        return status;
    }
    match repo
        .spawn("status", &[], None)
        .and_then(|out| serde_json::from_str(&out).map_err(|e| e.to_string()))
    {
        Ok(renumbered) => renumbered,
        Err(e) => {
            log(&format!("ledger re-derive after numbering failed: {e}"));
            status
        }
    }
}

async fn status_inner(app: &AppHandle, repo_key: &str) -> Result<Value, String> {
    let repo = match prepare(app, repo_key, true).await {
        Ok(repo) => repo,
        Err(e) => {
            emit_prep(app, repo_key, "failed", None, None);
            return Err(e);
        }
    };
    let task_app = app.clone();
    let task_key = repo_key.to_string();
    let (repo, result) = tauri::async_runtime::spawn_blocking(move || {
        let result = repo
            .run_status_streaming(&task_app, &task_key)
            .map(|status| mint_topic_numbers(&repo, status));
        (repo, result)
    })
    .await
    .map_err(|e| format!("ledger status failed: {e}"))?;
    let stage = if result.is_ok() { "ready" } else { "failed" };
    emit_prep(app, repo_key, stage, None, None);
    let status = result?;
    // Principle #6 (docs/DESIGN.md): no loading states. The last good
    // status persists beside the fact journal, and ledger_status_cached
    // replays it for an instant first paint while this refreshes behind.
    if let Ok(bytes) = serde_json::to_vec(&status) {
        let _ = std::fs::write(repo.state_dir.join("status.json"), bytes);
    }
    // The LLM stage rides every derivation — opens and warms alike — so a
    // newly watched repo arrives already mapped (docs/LEDGER.md item 5).
    ledger_topics::propose(app, repo_key.to_string(), repo, &status);
    Ok(status)
}

/// The last derived status from disk, or null — never derives, never
/// clones: the instant-paint half of cache-first, mirroring
/// `get_cached_inbox`.
#[tauri::command]
pub async fn ledger_status_cached(
    app: AppHandle,
    repo_key: String,
) -> Result<Option<Value>, String> {
    let (owner, repo) = split_key(&repo_key)?;
    let account = accounts::active_account(&app).await?;
    let key = RepoKey {
        host: account.host.clone(),
        owner,
        repo,
    };
    let path = store::ledger_state_dir(&storage::config_dir(&app)?, &key).join("status.json");
    let Ok(bytes) = std::fs::read(path) else {
        return Ok(None);
    };
    Ok(serde_json::from_slice(&bytes).ok())
}

#[tauri::command]
pub async fn ledger_status(app: AppHandle, repo_key: String) -> Result<Value, String> {
    status_inner(&app, &repo_key).await
}

/// Fire-and-forget full warm — clone, tip refresh, derivation, topic
/// mapping — so a repo is ready before its ledger is first opened. Kicked
/// when a repo becomes watched; failures only log (the open path reports
/// its own).
pub fn warm(app: &AppHandle, repo_key: String) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(e) = status_inner(&app, &repo_key).await {
            log(&format!("ledger warm failed for {repo_key}: {e}"));
        }
    });
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
