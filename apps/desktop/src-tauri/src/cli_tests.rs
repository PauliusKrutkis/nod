//! The version text verbatim — the three lines are the item, so they are
//! pinned exactly — and the routing table for `run`: which invocations talk
//! to the terminal, and which fall through to the GUI, deep links included.

use crate::install_format::InstallFormat;

use super::{run, version_text};

fn args(list: &[&str]) -> Vec<String> {
    list.iter().map(|s| s.to_string()).collect()
}

#[test]
fn version_text_is_three_lines_ending_in_the_upgrade_command() {
    assert_eq!(
        version_text("0.4.0", InstallFormat::Deb),
        "nod 0.4.0\ninstalled as a Debian package\nupdate with  sudo apt upgrade nod\n"
    );
}

#[test]
fn version_text_for_an_unmanaged_copy_points_at_downloads() {
    let text = version_text("0.4.0", InstallFormat::Unmanaged);
    assert_eq!(
        text,
        "nod 0.4.0\ninstalled as an unmanaged copy\nupdate with a new build from https://nodreview.com/downloads\n"
    );
}

#[test]
fn version_text_for_a_bundle_names_the_in_app_updater() {
    let text = version_text("0.4.0", InstallFormat::MacAppBundle);
    assert_eq!(
        text,
        "nod 0.4.0\ninstalled as a macOS app bundle\nupdate from inside Nod; it checks on launch\n"
    );
}

#[test]
fn the_two_flags_exit_zero() {
    assert_eq!(run(args(&["--version"])), Some(0));
    assert_eq!(run(args(&["--help"])), Some(0));
}

#[test]
fn an_unknown_flag_exits_nonzero_instead_of_opening_a_window() {
    assert_eq!(run(args(&["--wat"])), Some(2));
}

#[test]
fn plain_launches_and_deep_links_fall_through_to_the_gui() {
    assert_eq!(run(args(&[])), None);
    assert_eq!(run(args(&["nod://pr/acme/rocket/1"])), None);
    assert_eq!(run(args(&["nod://purchase?token=abc"])), None);
}
