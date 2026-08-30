//! Review-ledger seam (docs/LEDGER.md): runs the bundled ledger sidecar (our
//! own `packages/ledger` CLI compiled to a standalone binary by
//! `scripts/build-ledger-sidecar.mjs`, shipped via `bundle.externalBin`) as a
//! child process and passes its `--json` output through untouched — the
//! webview owns the shape (`LedgerStatus` in types.ts); Rust guarantees only
//! "valid JSON from a real run". Tauri strips the target-triple suffix when
//! it places the binary next to the app executable, so at runtime it is
//! plain `ledger`; debug builds that were not launched through tauri (cargo
//! test) fall back to the as-built `binaries/ledger-<triple>` under the
//! crate root. The CLI runs with the target repo as its working directory,
//! so any git repo works — no vendored engine required.

use std::path::{Path, PathBuf};
use std::process::Command;

use serde_json::Value;

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

fn run_cli(repo_path: &str, args: &[&str]) -> Result<String, String> {
    if !Path::new(repo_path).is_dir() {
        return Err(format!("not a directory: {repo_path}"));
    }
    let sidecar = sidecar_path()?;
    let output = Command::new(&sidecar)
        .args(args)
        .current_dir(repo_path)
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
        return Err(format!(
            "ledger {} failed: {}",
            args.join(" "),
            detail.trim()
        ));
    }
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

#[tauri::command]
pub async fn ledger_status(repo_path: String) -> Result<Value, String> {
    let stdout =
        tauri::async_runtime::spawn_blocking(move || run_cli(&repo_path, &["status", "--json"]))
            .await
            .map_err(|e| format!("ledger status failed: {e}"))??;
    serde_json::from_str(&stdout).map_err(|e| format!("ledger returned invalid JSON: {e}"))
}

#[tauri::command]
pub async fn ledger_session(repo_path: String, targets: Vec<String>) -> Result<Value, String> {
    let stdout = tauri::async_runtime::spawn_blocking(move || {
        let mut args = vec!["session"];
        args.extend(targets.iter().map(String::as_str));
        args.push("--json");
        run_cli(&repo_path, &args)
    })
    .await
    .map_err(|e| format!("ledger session failed: {e}"))??;
    serde_json::from_str(&stdout).map_err(|e| format!("ledger returned invalid JSON: {e}"))
}

#[tauri::command]
pub async fn ledger_review(repo_path: String, target: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || run_cli(&repo_path, &["review", &target]))
        .await
        .map_err(|e| format!("ledger review failed: {e}"))??;
    Ok(())
}

#[tauri::command]
pub async fn ledger_approve(repo_path: String, topic: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || run_cli(&repo_path, &["approve", &topic]))
        .await
        .map_err(|e| format!("ledger approve failed: {e}"))??;
    Ok(())
}

/// Start a thread on a region (`target` is `path:start-end`), or answer an
/// existing one when `parent` carries the root fact id.
#[tauri::command]
pub async fn ledger_comment(
    repo_path: String,
    target: String,
    body: String,
    parent: Option<String>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || match &parent {
        Some(root) => run_cli(&repo_path, &["comment", "--reply", root, &body]),
        None => run_cli(&repo_path, &["comment", &target, &body]),
    })
    .await
    .map_err(|e| format!("ledger comment failed: {e}"))??;
    Ok(())
}

#[tauri::command]
pub async fn ledger_resolve(repo_path: String, fact_id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || run_cli(&repo_path, &["resolve", &fact_id]))
        .await
        .map_err(|e| format!("ledger resolve failed: {e}"))??;
    Ok(())
}
