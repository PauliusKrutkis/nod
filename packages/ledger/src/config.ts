import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { GitRun } from "./git/exec.ts";

/**
 * Repo-versioned settings (docs/LEDGER.md §6): `.ledger/` lives in the
 * worktree, reviewable like code. The epoch is the adoption line — commits
 * reachable from it are grandfathered out of the metric.
 */
export interface LedgerConfig {
  version: 1;
  epoch: string;
  /** Distinct human approvals a topic needs to count as approved; absent = 1. */
  approvalsRequired?: number;
}

const CONFIG_PATH = ".ledger/config.json";

const isConfig = (value: unknown): value is LedgerConfig =>
  typeof value === "object" &&
  value !== null &&
  "version" in value &&
  value.version === 1 &&
  "epoch" in value &&
  typeof value.epoch === "string" &&
  (!("approvalsRequired" in value) ||
    value.approvalsRequired === undefined ||
    (typeof value.approvalsRequired === "number" &&
      Number.isInteger(value.approvalsRequired) &&
      value.approvalsRequired >= 1));

const parseConfig = (raw: string, label: string): LedgerConfig => {
  const value: unknown = JSON.parse(raw);
  if (!isConfig(value)) {
    throw new Error(`invalid ${label}`);
  }
  return value;
};

export const readLedgerConfig = async (
  repoRoot: string
): Promise<LedgerConfig | null> => {
  let raw: string;
  try {
    raw = await readFile(join(repoRoot, CONFIG_PATH), "utf8");
  } catch {
    return null;
  }
  return parseConfig(raw, CONFIG_PATH);
};

/**
 * Personal-local config in a host-supplied state dir, for repos adopted
 * without committing anything (docs/LEDGER.md "zero-commit adoption"): the
 * desktop app records the first-open epoch here. Committed config wins
 * when both exist — the repo-versioned scope is the team-grade one.
 */
export const readLocalConfig = async (
  stateDir: string
): Promise<LedgerConfig | null> => {
  let raw: string;
  try {
    raw = await readFile(join(stateDir, "config.json"), "utf8");
  } catch {
    return null;
  }
  return parseConfig(raw, "state config.json");
};

export const writeLocalConfig = async (
  stateDir: string,
  config: LedgerConfig
): Promise<void> => {
  const target = join(stateDir, "config.json");
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(config, null, 2)}\n`);
};

/**
 * The committed config at `tip`, for repos read without a worktree (bare
 * store clones). Callers prefer the worktree file when both exist — same
 * content once committed, and the dogfood loop may be editing it.
 */
export const readCommittedConfig = async (
  git: GitRun,
  tip: string
): Promise<LedgerConfig | null> => {
  let raw: string;
  try {
    raw = await git(["cat-file", "blob", `${tip}:${CONFIG_PATH}`]);
  } catch {
    return null;
  }
  return parseConfig(raw, `committed ${CONFIG_PATH}`);
};

export const writeLedgerConfig = async (
  repoRoot: string,
  config: LedgerConfig
): Promise<void> => {
  const target = join(repoRoot, CONFIG_PATH);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(config, null, 2)}\n`);
};
