//! The whole command-line surface, handled before Tauri boots so both flags
//! work headless: `--version`, `--help`, and the `nod://` deep-link form,
//! which is not consumed here — the deep-link plugin picks it out of argv
//! once the app is up. Deliberately nothing else. This is a desktop app that
//! happens to be launched from a shell, every subcommand would be a second
//! interface to maintain, and two flags plus the deep link is the entire
//! surface.
//!
//! `--version` prints three lines — version, detected install format, and
//! that format's own upgrade command — because a version number alone tells
//! you that you are behind and nothing about what to do. The detection is
//! `install_format`, shared with the in-app update notice.
//!
//! An unknown `--` flag prints the help to stderr and exits nonzero rather
//! than opening a window: whoever typed it was talking to the terminal.

use crate::install_format::{self, InstallFormat};

const HELP: &str = "\
nod: review pull requests from your desktop

usage:  nod [options]
        nod nod://pr/owner/repo/123

options:
  --version   print the version, install format and upgrade command
  --help      this

docs: https://nodreview.com/downloads
";

fn version_text(version: &str, format: InstallFormat) -> String {
    format!(
        "nod {version}\ninstalled as {}\n{}\n",
        format.described(),
        format.update_line()
    )
}

/// Handles a terminal invocation ahead of the GUI. Returns the exit code when
/// the arguments were meant for the terminal, `None` when the app should
/// launch — including for `nod://` URLs, which ride through untouched.
pub fn run<I: IntoIterator<Item = String>>(args: I) -> Option<i32> {
    for arg in args {
        match arg.as_str() {
            "--version" => {
                print!(
                    "{}",
                    version_text(env!("CARGO_PKG_VERSION"), install_format::current())
                );
                return Some(0);
            }
            "--help" => {
                print!("{HELP}");
                return Some(0);
            }
            other if other.starts_with("--") => {
                eprintln!("nod: unknown option {other}");
                eprint!("{HELP}");
                return Some(2);
            }
            _ => {}
        }
    }
    None
}

#[cfg(test)]
#[path = "cli_tests.rs"]
mod tests;
