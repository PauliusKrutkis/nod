fn main() {
    // ledger.rs falls back to binaries/ledger-<triple> in debug builds
    // (cargo test, anything not launched through tauri); std exposes no
    // runtime triple, so bake the compile target in here.
    println!(
        "cargo:rustc-env=NOD_TARGET_TRIPLE={}",
        std::env::var("TARGET").expect("cargo always sets TARGET for build scripts")
    );
    tauri_build::build()
}
