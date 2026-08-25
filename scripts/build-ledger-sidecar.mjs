#!/usr/bin/env node
// Compiles packages/ledger into the Tauri sidecar binary the desktop app
// spawns (apps/desktop/src-tauri/src/ledger.rs). tauri-build resolves
// `bundle.externalBin` at compile time, so the binary must exist before any
// `cargo check`/`cargo test`/`tauri dev` of the desktop crate.
//
// Usage: node scripts/build-ledger-sidecar.mjs [rust-triple]
//   The triple defaults to the host from `rustc -vV`; pass one explicitly
//   (or set LEDGER_SIDECAR_TRIPLE) for cross-compile legs, e.g.
//   x86_64-apple-darwin on an arm64 mac. `--force` rebuilds even when the
//   binary is newer than every ledger source file.

import { execFileSync, spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const RUSTC_HOST = /^host:\s*(\S+)/m;

const BUN_TARGETS = {
  "aarch64-apple-darwin": "bun-darwin-arm64",
  "x86_64-apple-darwin": "bun-darwin-x64",
  "x86_64-unknown-linux-gnu": "bun-linux-x64",
  "aarch64-unknown-linux-gnu": "bun-linux-arm64",
  "x86_64-pc-windows-msvc": "bun-windows-x64",
};

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const force = args.includes("--force");
const triple =
  args.find((a) => !a.startsWith("--")) ||
  process.env.LEDGER_SIDECAR_TRIPLE ||
  hostTriple();

const bunTarget = BUN_TARGETS[triple];
if (!bunTarget) {
  console.error(
    `no bun compile target known for "${triple}" (known: ${Object.keys(BUN_TARGETS).join(", ")})`
  );
  process.exit(1);
}

const entry = join(root, "packages/ledger/src/cli.ts");
const suffix = triple.includes("windows") ? ".exe" : "";
const outfile = join(
  root,
  "apps/desktop/src-tauri/binaries",
  `ledger-${triple}${suffix}`
);

if (!force && isFresh(outfile, join(root, "packages/ledger/src"))) {
  console.log(`ledger sidecar up to date: ${outfile}`);
  process.exit(0);
}

const result = spawnSync(
  "bun",
  ["build", entry, "--compile", `--target=${bunTarget}`, "--outfile", outfile],
  { stdio: "inherit" }
);
if (result.error) {
  console.error(`could not run bun: ${result.error.message}`);
  process.exit(1);
}
if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
console.log(`built ledger sidecar: ${outfile}`);

function hostTriple() {
  const vv = execFileSync("rustc", ["-vV"], { encoding: "utf8" });
  const host = vv.match(RUSTC_HOST)?.[1];
  if (!host) {
    console.error("could not read the host triple from `rustc -vV`");
    process.exit(1);
  }
  return host;
}

function isFresh(binary, srcDir) {
  let builtAt;
  try {
    builtAt = statSync(binary).mtimeMs;
  } catch {
    return false;
  }
  return newestMtime(srcDir) < builtAt;
}

function newestMtime(dir) {
  let newest = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    const mtime = entry.isDirectory()
      ? newestMtime(path)
      : statSync(path).mtimeMs;
    if (mtime > newest) {
      newest = mtime;
    }
  }
  return newest;
}
