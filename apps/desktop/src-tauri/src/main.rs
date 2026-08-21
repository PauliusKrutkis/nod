//! Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if let Some(code) = nod_lib::cli::run(std::env::args().skip(1)) {
        std::process::exit(code);
    }
    nod_lib::run()
}
