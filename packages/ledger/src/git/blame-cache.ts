import {
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { blameTree } from "./blame.ts";
import type { GitRun } from "./exec.ts";

/**
 * Disk cache for the blame pass — the dominant cost of a status derivation
 * (multi-second on this repo, and every CLI invocation starts cold). The key
 * is the blamed rev alone: the trackable file list and each line's
 * introducing sha are pure functions of the rev, so a hit is exact and can
 * never go stale. Appending facts (signing, approving) leaves the key
 * untouched — the derivation right after a review stays warm.
 *
 * The cache lives under the repo's git dir, never the working tree, and any
 * filesystem trouble falls through to a live blame: a broken cache may cost
 * seconds, never correctness.
 */

const KEEP = 2;

const cacheDir = async (git: GitRun): Promise<string> => {
  const out = await git([
    "rev-parse",
    "--path-format=absolute",
    "--git-common-dir",
  ]);
  return join(out.trim(), "ledger-cache");
};

const readCached = async (
  file: string
): Promise<Map<string, string[]> | null> => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(file, "utf8"));
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) {
    return null;
  }
  const blames = new Map<string, string[]>();
  for (const entry of parsed) {
    if (!Array.isArray(entry) || typeof entry[0] !== "string") {
      return null;
    }
    const [path, rows] = entry as [string, unknown];
    if (!Array.isArray(rows)) {
      return null;
    }
    // JSON has no holes: unblamed lines round-trip as null.
    blames.set(
      path,
      rows.map((row) => (typeof row === "string" ? row : undefined)) as string[]
    );
  }
  return blames;
};

const prune = async (dir: string, keepFile: string): Promise<void> => {
  const entries = await readdir(dir);
  const blameFiles = entries.filter(
    (name) => name.startsWith("blame-") && name !== keepFile
  );
  const dated = await Promise.all(
    blameFiles.map(async (name) => ({
      name,
      mtime: (await stat(join(dir, name))).mtimeMs,
    }))
  );
  dated.sort((a, b) => b.mtime - a.mtime);
  await Promise.all(
    dated
      .slice(KEEP - 1)
      .map(({ name }) => rm(join(dir, name), { force: true }))
  );
};

/** `blameTree`, memoized on disk per rev. */
export const cachedBlameTree = async (
  git: GitRun,
  rev: string,
  paths: readonly string[],
  onProgress?: (done: number, total: number) => void
): Promise<Map<string, string[]>> => {
  let dir: string | null = null;
  try {
    dir = await cacheDir(git);
    const hit = await readCached(join(dir, `blame-${rev}.json`));
    if (hit) {
      return hit;
    }
  } catch {
    dir = null;
  }
  const blames = await blameTree(git, rev, paths, onProgress);
  if (dir) {
    try {
      await mkdir(dir, { recursive: true });
      const file = `blame-${rev}.json`;
      const partial = join(dir, `${file}.partial`);
      await writeFile(partial, JSON.stringify([...blames]));
      await rename(partial, join(dir, file));
      await prune(dir, file);
    } catch {
      // cache is best-effort; the live result stands
    }
  }
  return blames;
};
