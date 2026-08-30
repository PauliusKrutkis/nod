import process from "node:process";
import { gitIn } from "./git/exec.ts";

/**
 * Flags shared by every command, hand-rolled on purpose: the surface is
 * five flags, and positional text (a comment body) must be able to carry
 * anything — `--` ends flag parsing, and unrecognized tokens stay
 * positional.
 */
export interface CliArgs {
  json: boolean;
  force: boolean;
  /** Repo to operate on; default: the repo containing cwd. */
  repo?: string;
  /**
   * Rev treated as tip; default HEAD. A bare store clone passes its
   * remote-tracking ref, since its local branches stop moving after the
   * clone.
   */
  tip?: string;
  /** Actor id recorded on facts; default `git config user.name`. */
  actor?: string;
  /**
   * Durable host-owned directory: a plain-file journal of the fact ref
   * (reconciled both ways on every run) plus personal-local config. For
   * hosts whose clone is disposable; without it the repo is the only copy.
   */
  stateDir?: string;
  positional: string[];
}

export const parseCliArgs = (argv: readonly string[]): CliArgs => {
  const args: CliArgs = { force: false, json: false, positional: [] };
  const booleans = new Map<string, () => void>([
    [
      "--json",
      () => {
        args.json = true;
      },
    ],
    [
      "--force",
      () => {
        args.force = true;
      },
    ],
  ]);
  const values = new Map<string, (value: string) => void>([
    [
      "--repo",
      (value) => {
        args.repo = value;
      },
    ],
    [
      "--tip",
      (value) => {
        args.tip = value;
      },
    ],
    [
      "--actor",
      (value) => {
        args.actor = value;
      },
    ],
    [
      "--state-dir",
      (value) => {
        args.stateDir = value;
      },
    ],
  ]);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined) {
      break;
    }
    if (arg === "--") {
      args.positional.push(...argv.slice(i + 1));
      break;
    }
    const setBoolean = booleans.get(arg);
    if (setBoolean) {
      setBoolean();
      continue;
    }
    const setValue = values.get(arg);
    if (setValue) {
      const value = argv[i + 1];
      if (value === undefined) {
        throw new Error(`${arg} needs a value`);
      }
      setValue(value);
      i += 1;
      continue;
    }
    args.positional.push(arg);
  }
  return args;
};

/**
 * Where the ledger operates. A worktree resolves to its top level (the
 * dogfood path). A bare repo — the desktop app's store clones — has no
 * worktree, so the git dir itself is the root: every read the engine
 * makes is rev-addressed, and local state (`.ledger/`, `ledger-cache/`)
 * simply lives inside the git dir there.
 */
export const resolveRepoRoot = async (repo?: string): Promise<string> => {
  const probe = gitIn(repo ?? process.cwd());
  try {
    const top = (await probe(["rev-parse", "--show-toplevel"])).trim();
    if (top) {
      return top;
    }
  } catch {
    // No worktree: fall through to the bare probe.
  }
  try {
    const bare = (await probe(["rev-parse", "--is-bare-repository"])).trim();
    if (bare === "true") {
      return (await probe(["rev-parse", "--absolute-git-dir"])).trim();
    }
  } catch {
    // Not a repository at all.
  }
  throw new Error(`not a git repository: ${repo ?? process.cwd()}`);
};
