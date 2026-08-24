//! The only code that spawns `git`.
//!
//! Credentials travel exclusively through the environment: a one-shot
//! credential helper reads `NOD_GIT_USERNAME` / `NOD_GIT_PASSWORD` from the
//! process environment, so the token never appears in an argument list
//! (visible in `ps`), in a URL (which git echoes into error messages), or on
//! disk. Inherited helpers are cleared first — a system osxkeychain helper
//! could otherwise answer with a different account's stored credentials —
//! and `GIT_TERMINAL_PROMPT=0` turns any remaining prompt into a fast
//! failure instead of a hung child.
//!
//! The low-speed abort envs bound a stalled transfer the way `http.rs`
//! bounds a stalled request; without them a dead network wedges a background
//! clone at `Cloning` until app restart.
//!
//! Calls are synchronous (`Command::output`) — callers own the hop to a
//! blocking thread, same as the ledger seam.

use std::path::Path;
use std::process::Command;

use crate::accounts::Account;

/// Answers `get` with the env credentials and stays silent (and successful)
/// for `store`/`erase`, which git also invokes.
const HELPER: &str = "credential.helper=!f() { if [ \"$1\" = get ]; then printf 'username=%s\\npassword=%s\\n' \"$NOD_GIT_USERNAME\" \"$NOD_GIT_PASSWORD\"; fi; }; f";

pub struct GitAuth {
    pub username: String,
    pub password: String,
}

/// The token-bearing identity git presents over HTTPS. Both providers accept
/// the OAuth token as the password behind a fixed username.
pub fn auth_for(account: &Account) -> GitAuth {
    let username = if account.provider == "gitlab" {
        "oauth2"
    } else {
        "x-access-token"
    };
    GitAuth {
        username: username.to_string(),
        password: account.token.clone(),
    }
}

/// Runs one git command to completion and returns its stdout as text.
/// `cwd` is the git dir for commands against an existing store, `None` for
/// `clone`, which carries its target as an argument.
pub fn run(cwd: Option<&Path>, args: &[&str], auth: Option<&GitAuth>) -> Result<String, String> {
    run_bytes(cwd, args, auth).map(|bytes| String::from_utf8_lossy(&bytes).into_owned())
}

/// Same as `run` for output that must stay bytes — blob contents include
/// images, which a lossy UTF-8 pass would corrupt.
pub fn run_bytes(
    cwd: Option<&Path>,
    args: &[&str],
    auth: Option<&GitAuth>,
) -> Result<Vec<u8>, String> {
    let mut command = Command::new("git");
    command.env("GIT_TERMINAL_PROMPT", "0");
    if let Some(auth) = auth {
        command.args(["-c", "credential.helper=", "-c", HELPER]);
        command.env("NOD_GIT_USERNAME", &auth.username);
        command.env("NOD_GIT_PASSWORD", &auth.password);
        command.env("GIT_HTTP_LOW_SPEED_LIMIT", "1024");
        command.env("GIT_HTTP_LOW_SPEED_TIME", "60");
    }
    command.args(args);
    if let Some(dir) = cwd {
        command.current_dir(dir);
    }
    let output = command
        .output()
        .map_err(|e| format!("could not launch git: {e}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        let detail = if stderr.trim().is_empty() {
            stdout
        } else {
            stderr
        };
        return Err(format!(
            "git {} failed: {}",
            args.first().copied().unwrap_or(""),
            detail.trim()
        ));
    }
    Ok(output.stdout)
}

#[cfg(test)]
#[path = "git_tests.rs"]
mod tests;
