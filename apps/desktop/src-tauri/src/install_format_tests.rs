//! The classification table both self-describing surfaces read from, run on
//! any host: which install format each combination of facts names, which
//! formats carry a real upgrade command, and which builds may put a release
//! in place themselves (the gate `update.rs` hangs the install button on).

use std::ffi::OsStr;

use super::{classify, InstallFormat, PackageOwner, Target};

#[test]
fn macos_and_windows_are_their_bundles() {
    assert_eq!(
        classify(Target::MacOS, None, None),
        InstallFormat::MacAppBundle
    );
    assert_eq!(
        classify(Target::Windows, None, None),
        InstallFormat::WindowsInstaller
    );
}

#[test]
fn on_linux_a_running_appimage_wins() {
    let mounted = OsStr::new("/tmp/.mount_Nod4Kd2x/Nod_0.4.0_amd64.AppImage");
    assert_eq!(
        classify(Target::Linux, Some(mounted), None),
        InstallFormat::AppImage
    );
    assert_eq!(
        classify(Target::Linux, Some(mounted), Some(PackageOwner::Dpkg)),
        InstallFormat::AppImage
    );
}

#[test]
fn an_empty_appimage_variable_is_not_an_appimage() {
    assert_eq!(
        classify(Target::Linux, Some(OsStr::new("")), None),
        InstallFormat::Unmanaged
    );
}

#[test]
fn each_package_database_names_its_format() {
    assert_eq!(
        classify(Target::Linux, None, Some(PackageOwner::Dpkg)),
        InstallFormat::Deb
    );
    assert_eq!(
        classify(Target::Linux, None, Some(PackageOwner::Rpm)),
        InstallFormat::Rpm
    );
    assert_eq!(
        classify(Target::Linux, None, Some(PackageOwner::Pacman)),
        InstallFormat::ArchPackage
    );
}

#[test]
fn a_linux_binary_nothing_owns_is_unmanaged() {
    assert_eq!(
        classify(Target::Linux, None, None),
        InstallFormat::Unmanaged
    );
}

#[test]
fn only_package_managed_formats_carry_a_command() {
    assert_eq!(
        InstallFormat::Deb.update_command(),
        Some("sudo apt upgrade nod")
    );
    assert_eq!(
        InstallFormat::Rpm.update_command(),
        Some("sudo dnf upgrade nod")
    );
    assert_eq!(
        InstallFormat::ArchPackage.update_command(),
        Some("yay -Syu nod-bin")
    );
    assert_eq!(InstallFormat::MacAppBundle.update_command(), None);
    assert_eq!(InstallFormat::AppImage.update_command(), None);
    assert_eq!(InstallFormat::Unmanaged.update_command(), None);
}

#[test]
fn only_bundle_formats_install_themselves() {
    assert!(InstallFormat::MacAppBundle.self_installable());
    assert!(InstallFormat::WindowsInstaller.self_installable());
    assert!(InstallFormat::AppImage.self_installable());
    assert!(!InstallFormat::Deb.self_installable());
    assert!(!InstallFormat::Rpm.self_installable());
    assert!(!InstallFormat::ArchPackage.self_installable());
    assert!(!InstallFormat::Unmanaged.self_installable());
}

#[test]
fn the_unmanaged_update_line_admits_there_is_no_command() {
    let line = InstallFormat::Unmanaged.update_line();
    assert!(line.contains("https://nodreview.com/downloads"));
    assert!(!line.contains("sudo"));
}

#[test]
fn the_packaged_update_line_prints_the_command() {
    assert_eq!(
        InstallFormat::Deb.update_line(),
        "update with  sudo apt upgrade nod"
    );
}
