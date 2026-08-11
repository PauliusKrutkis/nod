//! License + trial state. A license is an Ed25519-signed token minted by the
//! web activation page (apps/web/functions/lib/license-token.ts); this module
//! verifies it offline against a public key baked in at compile time and
//! derives the app's license state — no network on any launch path.
//!
//! The canonical signed bytes are the compact JSON of exactly
//! `{"orderId":…,"subject":…,"updatesUntil":…}` in that key order, matching
//! the web signer's `JSON.stringify` byte-for-byte; `SignedToken` ignores
//! unknown keys but the payload is rebuilt from the three signed fields, so
//! appended keys never ride in on a valid signature. Verification never
//! panics on attacker-controlled input — every malformed shape is `None`.
//!
//! The state model is deliberately not DRM: past the trial window the app
//! keeps working forever (`TrialExpired` gates updates and prompts, never
//! features), and a verified license never expires the app — `updatesUntil`
//! is compared against release dates by the updater, not against the clock
//! here. The trial clock starts at the first-launch timestamp written by
//! `ensure_trial_started` (called once from setup, so reads stay pure);
//! a first-launch timestamp in the future — clock skew, restored backup —
//! clamps to a full trial rather than instant expiry.
//!
//! The public key arrives via `NOD_LICENSE_PUBKEY` at compile time like the
//! OAuth secrets in auth.rs; without it (all dev builds today) verification
//! is a constant `None` and the app simply lives its trial-then-expired life.

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::storage;

const LICENSE_FILE: &str = "license.json";
const TRIAL_FILE: &str = "trial.json";
const TRIAL_DAYS: u64 = 30;
const SECONDS_PER_DAY: u64 = 24 * 60 * 60;

const LICENSE_PUBKEY_HEX: Option<&str> = option_env!("NOD_LICENSE_PUBKEY");

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LicenseFile {
    token: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TrialFile {
    first_launch_secs: u64,
}

#[derive(Serialize, Deserialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LicensePayload {
    pub order_id: String,
    pub subject: String,
    pub updates_until: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SignedToken {
    order_id: String,
    subject: String,
    updates_until: String,
    signature: String,
}

#[derive(Serialize, Debug, PartialEq, Eq)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum LicenseState {
    #[serde(rename_all = "camelCase")]
    Licensed {
        updates_until: String,
    },
    #[serde(rename_all = "camelCase")]
    Trial {
        days_left: u64,
    },
    TrialExpired,
}

fn decode_hex(hex: &str) -> Option<Vec<u8>> {
    if hex.len() % 2 != 0 {
        return None;
    }
    hex.as_bytes()
        .chunks_exact(2)
        .map(|pair| {
            let high = (pair[0] as char).to_digit(16)?;
            let low = (pair[1] as char).to_digit(16)?;
            Some((high * 16 + low) as u8)
        })
        .collect()
}

pub fn verify_license_token(token: &str, pubkey_hex: &str) -> Option<LicensePayload> {
    let decoded = URL_SAFE_NO_PAD.decode(token).ok()?;
    let signed: SignedToken = serde_json::from_slice(&decoded).ok()?;

    let payload = LicensePayload {
        order_id: signed.order_id,
        subject: signed.subject,
        updates_until: signed.updates_until,
    };
    let canonical = serde_json::to_string(&payload).ok()?;

    let pubkey_bytes: [u8; 32] = decode_hex(pubkey_hex)?.try_into().ok()?;
    let signature_bytes: [u8; 64] = decode_hex(&signed.signature)?.try_into().ok()?;
    let key = VerifyingKey::from_bytes(&pubkey_bytes).ok()?;

    key.verify(
        canonical.as_bytes(),
        &Signature::from_bytes(&signature_bytes),
    )
    .ok()
    .map(|_| payload)
}

pub fn trial_days_left(first_launch_secs: u64, now_secs: u64) -> u64 {
    if first_launch_secs > now_secs {
        return TRIAL_DAYS;
    }
    let elapsed_days = (now_secs - first_launch_secs) / SECONDS_PER_DAY;
    TRIAL_DAYS.saturating_sub(elapsed_days)
}

fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

pub fn configured_pubkey() -> Option<&'static str> {
    LICENSE_PUBKEY_HEX
}

/// Persists a token the activation listener already verified; the next
/// `get_license_state` re-verifies it from disk like any other launch.
pub fn store_license_token(app: &AppHandle, token: &str) -> Result<(), String> {
    storage::write_json(
        app,
        LICENSE_FILE,
        &LicenseFile {
            token: token.to_string(),
        },
    )
}

/// Writes the first-launch timestamp if none exists yet. Called from setup so
/// `get_license_state` stays a pure read.
pub fn ensure_trial_started(app: &AppHandle) {
    let existing = storage::read_json::<TrialFile>(app, TRIAL_FILE).unwrap_or(None);
    if existing.is_none() {
        let _ = storage::write_json(
            app,
            TRIAL_FILE,
            &TrialFile {
                first_launch_secs: now_secs(),
            },
        );
    }
}

fn stored_license(app: &AppHandle) -> Option<LicensePayload> {
    let pubkey = LICENSE_PUBKEY_HEX?;
    let file = storage::read_json::<LicenseFile>(app, LICENSE_FILE).unwrap_or(None)?;
    verify_license_token(&file.token, pubkey)
}

#[tauri::command]
pub fn get_license_state(app: AppHandle) -> LicenseState {
    if let Some(payload) = stored_license(&app) {
        return LicenseState::Licensed {
            updates_until: payload.updates_until,
        };
    }
    let first_launch = storage::read_json::<TrialFile>(&app, TRIAL_FILE)
        .unwrap_or(None)
        .map_or_else(now_secs, |t| t.first_launch_secs);
    let days_left = trial_days_left(first_launch, now_secs());
    if days_left > 0 {
        LicenseState::Trial { days_left }
    } else {
        LicenseState::TrialExpired
    }
}

#[cfg(test)]
#[path = "license_tests.rs"]
mod tests;
