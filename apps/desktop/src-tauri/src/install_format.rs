//! The one place that knows how this copy of Nod got onto the machine. Both
//! surfaces that describe the install — `nod --version` in a terminal and the
//! in-app update notice — read from here, so the detection is written once
//! and the two can never disagree.
//!
//! Classification is a pure function over three facts: the build target, the
//! `APPIMAGE` variable the AppImage runtime exports on every launch, and
//! which Linux package database claims a nod package. Gathering those facts
//! is the impure edge (`current`, `probe_package_owner`); everything the
//! tests care about stays host-independent.
//!
//! An unmanaged copy — a bare binary on Linux that no package database owns —
//! deliberately gets no upgrade command: inventing one would recreate the
//! exact dead end this module exists to close, so its update line points at
//! the downloads page instead.

use std::ffi::OsStr;
use std::process::{Command, Stdio};

use tauri::utils::platform::Target;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum InstallFormat {
    MacAppBundle,
    WindowsInstaller,
    AppImage,
    Deb,
    Rpm,
    ArchPackage,
    Unmanaged,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PackageOwner {
    Dpkg,
    Pacman,
    Rpm,
}

impl InstallFormat {
    /// The format as prose, phrased to follow "installed as".
    pub fn described(self) -> &'static str {
        match self {
            InstallFormat::MacAppBundle => "a macOS app bundle",
            InstallFormat::WindowsInstaller => "a Windows installer",
            InstallFormat::AppImage => "an AppImage",
            InstallFormat::Deb => "a Debian package",
            InstallFormat::Rpm => "an RPM package",
            InstallFormat::ArchPackage => "an AUR package",
            InstallFormat::Unmanaged => "an unmanaged copy",
        }
    }

    /// The copy-pasteable upgrade command, for the formats whose updates
    /// belong to a package manager. `None` everywhere else — the in-app
    /// updater or the downloads page owns those, and there is no command to
    /// print that would be true.
    pub fn update_command(self) -> Option<&'static str> {
        match self {
            InstallFormat::Deb => Some("sudo apt upgrade nod"),
            InstallFormat::Rpm => Some("sudo dnf upgrade nod"),
            InstallFormat::ArchPackage => Some("yay -Syu nod-bin"),
            _ => None,
        }
    }

    /// Whether this build can put a downloaded release in place itself.
    /// macOS and Windows always can. On Linux only the AppImage can — the
    /// updater rewrites the running image in place; package trees belong to
    /// the package manager, and an unmanaged copy gives the updater nothing
    /// it may overwrite.
    pub fn self_installable(self) -> bool {
        matches!(
            self,
            InstallFormat::MacAppBundle | InstallFormat::WindowsInstaller | InstallFormat::AppImage
        )
    }

    /// The third line of `nod --version`: how updates actually arrive for
    /// this format. Honest for every arm — a command only where a package
    /// manager owns the install, the in-app updater where it works, and the
    /// downloads page for the copy nothing on the machine tracks.
    pub fn update_line(self) -> String {
        match self.update_command() {
            Some(cmd) => format!("update with  {cmd}"),
            None if self.self_installable() => {
                "update from inside Nod; it checks on launch".to_string()
            }
            None => "update with a new build from https://nodreview.com/downloads".to_string(),
        }
    }
}

/// Pure classification from gathered facts. A present, non-empty `APPIMAGE`
/// wins on Linux — it names the exact file the updater rewrites — then the
/// package databases, then the unmanaged fallback.
pub fn classify(
    target: Target,
    appimage: Option<&OsStr>,
    owner: Option<PackageOwner>,
) -> InstallFormat {
    match target {
        Target::MacOS => InstallFormat::MacAppBundle,
        Target::Windows => InstallFormat::WindowsInstaller,
        Target::Linux => {
            if appimage.is_some_and(|path| !path.is_empty()) {
                return InstallFormat::AppImage;
            }
            match owner {
                Some(PackageOwner::Dpkg) => InstallFormat::Deb,
                Some(PackageOwner::Pacman) => InstallFormat::ArchPackage,
                Some(PackageOwner::Rpm) => InstallFormat::Rpm,
                None => InstallFormat::Unmanaged,
            }
        }
        _ => InstallFormat::Unmanaged,
    }
}

/// Asks each Linux package database whether it owns a nod package. Absent
/// managers just fail to spawn, which reads as "not this one"; anywhere but
/// Linux there is nothing to ask.
pub fn probe_package_owner(target: Target) -> Option<PackageOwner> {
    if !matches!(target, Target::Linux) {
        return None;
    }
    if package_present("dpkg-query", &["-W", "nod"]) {
        return Some(PackageOwner::Dpkg);
    }
    if package_present("pacman", &["-Q", "nod-bin"]) || package_present("pacman", &["-Q", "nod"]) {
        return Some(PackageOwner::Pacman);
    }
    if package_present("rpm", &["-q", "nod"]) {
        return Some(PackageOwner::Rpm);
    }
    None
}

fn package_present(manager: &str, args: &[&str]) -> bool {
    Command::new(manager)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .is_ok_and(|status| status.success())
}

/// The format of the running process, from its own environment — usable
/// before Tauri boots, which is what lets `--version` work headless.
pub fn current() -> InstallFormat {
    let target = Target::current();
    classify(
        target,
        std::env::var_os("APPIMAGE").as_deref(),
        probe_package_owner(target),
    )
}

#[cfg(test)]
#[path = "install_format_tests.rs"]
mod tests;
