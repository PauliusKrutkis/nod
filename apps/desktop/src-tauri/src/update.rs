//! Auto-update via `tauri-plugin-updater`. Like every other backend command,
//! the webview calls these thin wrappers; the download, signature verification
//! and install happen in Rust.
//!
//! Update eligibility is gated client-side on license state — `latest.json`
//! stays fully static. A running trial gets every update; an expired trial
//! gets none (that is what a license buys); a licensed install gets releases
//! published up to its `updatesUntil`, compared as ISO dates so a same-day
//! release still qualifies. A release with no publish date counts as
//! eligible for licensed users: the feed always stamps `pub_date`, and a
//! missing one should never lock a paying customer out. `install_update`
//! re-checks the gate so the UI can't be tricked into installing past it —
//! gating, not DRM: the app itself never stops working. That re-check can
//! see a different release than the card showed (latest-only feed); an
//! ineligible one fails closed, an eligible one installs.

use serde::Serialize;
use tauri::AppHandle;
use tauri_plugin_updater::UpdaterExt;

use crate::license::{self, LicenseState};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub version: String,
    pub current_version: String,
    pub notes: Option<String>,
    pub eligible: bool,
}

fn iso_date(date: Option<time::OffsetDateTime>) -> Option<String> {
    date.map(|d| {
        let utc = d.to_offset(time::UtcOffset::UTC);
        format!(
            "{:04}-{:02}-{:02}",
            utc.year(),
            u8::from(utc.month()),
            utc.day()
        )
    })
}

fn update_allowed(state: &LicenseState, release_date: Option<&str>) -> bool {
    match state {
        LicenseState::Trial { .. } => true,
        LicenseState::TrialExpired => false,
        LicenseState::Licensed { updates_until } => match release_date {
            Some(date) => date <= updates_until.as_str(),
            None => true,
        },
    }
}

/// Check the configured endpoint for a newer signed release. Returns `None`
/// when already up to date — or when the updater isn't configured / the feed
/// is unreachable, so a half-set-up scaffold never nags the user with errors.
#[tauri::command]
pub async fn check_for_update(app: AppHandle) -> Result<Option<UpdateInfo>, String> {
    let updater = match app.updater() {
        Ok(updater) => updater,
        Err(_) => return Ok(None),
    };
    match updater.check().await {
        Ok(Some(update)) => {
            let state = license::get_license_state(app.clone());
            let release_date = iso_date(update.date);
            Ok(Some(UpdateInfo {
                version: update.version.clone(),
                current_version: update.current_version.clone(),
                notes: update.body.clone(),
                eligible: update_allowed(&state, release_date.as_deref()),
            }))
        }
        Ok(None) => Ok(None),
        Err(_) => Ok(None),
    }
}

/// The running app version, for the "what's new after an update" card to
/// compare against the last version it saw.
#[tauri::command]
pub fn get_app_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseInfo {
    pub tag: String,
    pub published_at: Option<String>,
    pub notes: Option<String>,
}

/// Version releases on this app's public GitHub repo, newest first — one call
/// serves both the what's-new card and the release-history view. Drafts,
/// prereleases and non-version tags (the `pr-evidence` asset host) are
/// filtered out. Best-effort like the updater: any failure (offline, rate
/// limit) returns `None` so callers can stay quiet rather than surface errors.
/// No token — releases are public.
#[tauri::command]
pub async fn list_releases() -> Result<Option<Vec<ReleaseInfo>>, String> {
    let url = "https://api.github.com/repos/PauliusKrutkis/nod/releases?per_page=30";
    let client = match reqwest::Client::builder().user_agent("nod").build() {
        Ok(client) => client,
        Err(_) => return Ok(None),
    };
    let resp = match client
        .get(url)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
    {
        Ok(resp) if resp.status().is_success() => resp,
        _ => return Ok(None),
    };
    let values: Vec<serde_json::Value> = match resp.json().await {
        Ok(values) => values,
        Err(_) => return Ok(None),
    };
    let releases = values
        .iter()
        .filter(|v| {
            let flagged = |key| v.get(key).and_then(serde_json::Value::as_bool) == Some(true);
            !flagged("draft") && !flagged("prerelease")
        })
        .filter_map(|v| {
            let tag = v.get("tag_name").and_then(serde_json::Value::as_str)?;
            let rest = tag.strip_prefix('v')?;
            if !rest.starts_with(|c: char| c.is_ascii_digit()) {
                return None;
            }
            let text = |key| {
                v.get(key)
                    .and_then(serde_json::Value::as_str)
                    .map(str::trim)
                    .filter(|s| !s.is_empty())
                    .map(String::from)
            };
            Some(ReleaseInfo {
                tag: tag.to_string(),
                published_at: text("published_at"),
                notes: text("body"),
            })
        })
        .collect();
    Ok(Some(releases))
}

/// Download + install the available update (verifying its signature against the
/// configured public key), then relaunch into the new version. Surfaces real
/// errors here because the user explicitly opted in by pressing "Install".
#[tauri::command]
pub async fn install_update(app: AppHandle) -> Result<(), String> {
    let updater = app.updater().map_err(|e| e.to_string())?;
    let update = updater
        .check()
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "No update available".to_string())?;
    let state = license::get_license_state(app.clone());
    if !update_allowed(&state, iso_date(update.date).as_deref()) {
        return Err(
            "This release is outside your update window. A license unlocks another year of updates."
                .to_string(),
        );
    }
    update
        .download_and_install(|_chunk_len, _content_len| {}, || {})
        .await
        .map_err(|e| e.to_string())?;
    app.restart();
}

#[cfg(test)]
#[path = "update_tests.rs"]
mod tests;
