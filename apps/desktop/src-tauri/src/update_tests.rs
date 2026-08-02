//! Truth table for the update-eligibility gate — the boundaries the whole
//! licensing model hangs on: trial gets everything, an expired trial gets
//! nothing, a license reaches exactly through its updatesUntil day.

use super::{update_allowed, LicenseState};

#[test]
fn trial_gets_every_update_and_expired_gets_none() {
    let trial = LicenseState::Trial { days_left: 3 };
    assert!(update_allowed(&trial, Some("2099-01-01")));
    assert!(!update_allowed(&LicenseState::TrialExpired, Some("2020-01-01")));
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
