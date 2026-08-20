//! Truth table for the update-eligibility gate — the boundaries the whole
//! licensing model hangs on: trial gets everything, an expired trial gets
//! nothing, a license reaches exactly through its updatesUntil day.
//!
//! Plus the second gate, install format: whether the running build can put a
//! release in place itself. Both halves are pure functions so the table runs
//! on any host, including the Linux arms on a macOS dev machine.
//!
//! And the /price.json parse: the shapes the site actually serves (launch
//! price present, null, absent) and the junk that must come back as an error
//! instead of a panic.

use std::ffi::OsStr;

use super::{can_self_install, update_allowed, LicenseState, SitePricing, Target};

#[test]
fn trial_gets_every_update_and_expired_gets_none() {
    let trial = LicenseState::Trial { days_left: 3 };
    assert!(update_allowed(&trial, Some("2099-01-01")));
    assert!(!update_allowed(
        &LicenseState::TrialExpired,
        Some("2020-01-01")
    ));
}

#[test]
fn licensed_updates_stop_at_updates_until() {
    let licensed = LicenseState::Licensed {
        updates_until: "2027-08-02T10:00:00.000Z".to_string(),
    };
    assert!(update_allowed(&licensed, Some("2027-08-01")));
    assert!(update_allowed(&licensed, Some("2027-08-02")));
    assert!(!update_allowed(&licensed, Some("2027-08-03")));
    assert!(update_allowed(&licensed, None));
}

#[test]
fn on_linux_only_a_running_appimage_installs_itself() {
    let mounted = OsStr::new("/tmp/.mount_Nod4Kd2x/Nod_0.4.0_amd64.AppImage");
    assert!(can_self_install(Target::Linux, Some(mounted)));
    assert!(!can_self_install(Target::Linux, None));
    assert!(!can_self_install(Target::Linux, Some(OsStr::new(""))));
}

#[test]
fn macos_and_windows_installs_always_install_themselves() {
    assert!(can_self_install(Target::MacOS, None));
    assert!(can_self_install(Target::Windows, None));
}

#[test]
fn site_pricing_parses_a_launch_price_and_ignores_extra_fields() {
    let parsed: SitePricing = serde_json::from_str(
        r#"{"price":59,"launchPrice":39,"currency":"USD","formattedPrice":"$59","source":"polar"}"#,
    )
    .unwrap();
    assert_eq!(parsed.price, 59.0);
    assert_eq!(parsed.launch_price, Some(39.0));
    assert_eq!(parsed.currency, "USD");
}

#[test]
fn site_pricing_reads_a_null_or_absent_launch_price_as_none() {
    let null_launch: SitePricing =
        serde_json::from_str(r#"{"price":59,"launchPrice":null,"currency":"USD"}"#).unwrap();
    assert_eq!(null_launch.launch_price, None);
    let absent_launch: SitePricing =
        serde_json::from_str(r#"{"price":59,"currency":"USD"}"#).unwrap();
    assert_eq!(absent_launch.launch_price, None);
}

#[test]
fn site_pricing_rejects_junk_as_an_error() {
    assert!(serde_json::from_str::<SitePricing>(r#"{"launchPrice":39,"currency":"USD"}"#).is_err());
    assert!(
        serde_json::from_str::<SitePricing>(r#"{"price":"fifty-nine","currency":"USD"}"#).is_err()
    );
    assert!(serde_json::from_str::<SitePricing>("[]").is_err());
    assert!(serde_json::from_str::<SitePricing>("not json").is_err());
}
