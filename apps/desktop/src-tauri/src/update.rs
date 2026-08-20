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
//!
//! Eligibility is not the only reason an update can't be installed from the
//! card. A second gate is the install format: `check_for_update` compares
//! `latest.json` against the running version and knows nothing about how the
//! app got onto the machine, so on a Linux `.deb`/`.rpm` it happily reports a
//! newer release the app cannot put in place. Those trees belong to the
//! package manager: the plugin's Linux install path shells out to
//! `pkexec dpkg -i` / `rpm -U` and fails with "Failed to install package"
//! when no privilege prompt answers. `self_installable` carries that fact to
//! the card so it can drop the install button, and `install_update` refuses
//! the same case rather than trusting the UI.

use std::ffi::{OsStr, OsString};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::utils::platform::Target;
use tauri::AppHandle;
use tauri_plugin_updater::UpdaterExt;

use crate::license::{self, LicenseState};

const SITE_URL: &str = "https://nodreview.com";
const PRICING_TIMEOUT: Duration = Duration::from_secs(4);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub version: String,
    pub current_version: String,
    pub notes: Option<String>,
    pub eligible: bool,
    /// False on a Linux `.deb`/`.rpm` install, where the card must show a
    /// passive notice instead of an install button.
    pub self_installable: bool,
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

#[cfg(target_os = "linux")]
fn appimage_path(app: &AppHandle) -> Option<OsString> {
    use tauri::Manager;
    app.env().appimage
}

#[cfg(not(target_os = "linux"))]
fn appimage_path(_app: &AppHandle) -> Option<OsString> {
    None
}

/// Whether this build can put a downloaded release in place itself. macOS and
/// Windows always can. On Linux only the AppImage can, and the signal for that
/// is the `APPIMAGE` variable its runtime exports on every launch: it holds
/// the path to the running image, which is the exact file the updater
/// rewrites. Absent, there is nothing the app may overwrite, and the release
/// has to come from the package manager instead.
fn can_self_install(target: Target, appimage: Option<&OsStr>) -> bool {
    match target {
        Target::Linux => appimage.is_some_and(|path| !path.is_empty()),
        _ => true,
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
                self_installable: can_self_install(
                    Target::current(),
                    appimage_path(&app).as_deref(),
                ),
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

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SitePricing {
    pub price: f64,
    pub launch_price: Option<f64>,
    pub currency: String,
}

/// The current price from the site's /price.json, which the site resolves
/// from Polar at build time — so the purchase card can quote a launch price
/// instead of the number this build was compiled with. Extra fields in the
/// payload are ignored; a payload missing the required ones is a serde error,
/// not a panic. Errors are returned rather than swallowed because the
/// frontend hook owns the fallback (its baked price) and its retry policy.
#[tauri::command]
pub async fn fetch_site_pricing() -> Result<SitePricing, String> {
    let client = reqwest::Client::builder()
        .user_agent("nod")
        .timeout(PRICING_TIMEOUT)
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client
        .get(format!("{SITE_URL}/price.json"))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("price.json responded {}", resp.status()));
    }
    resp.json::<SitePricing>().await.map_err(|e| e.to_string())
}

/// Download + install the available update (verifying its signature against the
/// configured public key), then relaunch into the new version. Surfaces real
/// errors here because the user explicitly opted in by pressing "Install".
#[tauri::command]
pub async fn install_update(app: AppHandle) -> Result<(), String> {
    if !can_self_install(Target::current(), appimage_path(&app).as_deref()) {
        return Err(format!(
            "Nod can't replace a .deb or .rpm install on its own. Download the new package from {SITE_URL}/downloads and install it over this one."
        ));
    }
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
