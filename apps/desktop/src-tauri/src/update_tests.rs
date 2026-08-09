//! Truth table for the update-eligibility gate — the boundaries the whole
//! licensing model hangs on: trial gets everything, an expired trial gets
//! nothing, a license reaches exactly through its updatesUntil day.
//!
//! Plus the second gate, install format: whether the running build can put a
//! release in place itself. Both halves are pure functions so the table runs
//! on any host, including the Linux arms on a macOS dev machine.

use std::ffi::OsStr;

use super::{can_self_install, update_allowed, LicenseState, Target};

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
