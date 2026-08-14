//! Review-ledger seam (docs/LEDGER.md): runs the target repo's own ledger
//! CLI (`packages/ledger/src/cli.ts`) as a child process and passes its
//! `--json` output through untouched — the webview owns the shape
//! (`LedgerStatus` in types.ts); Rust guarantees only "valid JSON from a real
//! run". This is the app's first process-spawning command and is deliberately
//! dogfood-grade: it needs `node` ≥ 23 on PATH (dev launches from a terminal
//! have one; a packaged app may not) and works only on repos that vendor the
//! ledger engine. The planned sidecar binary replaces both constraints.

use std::path::PathBuf;
use std::process::Command;

use serde_json::Value;

const CLI_RELATIVE: &str = "packages/ledger/src/cli.ts";

fn cli_path(repo_path: &str) -> Result<PathBuf, String> {
    let root = PathBuf::from(repo_path);
    if !root.is_dir() {
        return Err(format!("not a directory: {repo_path}"));
    }
    let cli = root.join(CLI_RELATIVE);
    if !cli.is_file() {
        return Err(format!(
            "this repository does not carry the ledger CLI ({CLI_RELATIVE})"
        ));
    }
    Ok(cli)
}

fn run_cli(repo_path: &str, args: &[&str]) -> Result<String, String> {
    let cli = cli_path(repo_path)?;
    let output = Command::new("node")
        .arg(&cli)
        .args(args)
        .current_dir(repo_path)
        .output()
        .map_err(|e| format!("could not launch node: {e}"))?;
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
    let stdout = tauri::async_runtime::spawn_blocking(move || {
        run_cli(&repo_path, &["status", "--json"])
    })
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
