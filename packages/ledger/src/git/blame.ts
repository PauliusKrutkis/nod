import { mapLimit } from "../concurrency.ts";
import type { GitRun } from "./exec.ts";

const LINE_RECORD = /^([0-9a-f]{40}) \d+ (\d+)/;

/** Introducing sha per 0-based line of one file at rev. */
export const blameFile = async (
  git: GitRun,
  rev: string,
  path: string
): Promise<string[]> => {
  const out = await git(["blame", "--porcelain", rev, "--", path]);
  const shas: string[] = [];
  for (const line of out.split("\n")) {
    const match = LINE_RECORD.exec(line);
    if (match) {
      shas[Number(match[2]) - 1] = match[1];
    }
  }
  return shas;
};

/** Blame every given file at rev; files blame cannot handle are omitted. */
export const blameTree = async (
  git: GitRun,
  rev: string,
  paths: readonly string[]
): Promise<Map<string, string[]>> => {
  const results = await mapLimit(paths, 8, async (path) => {
    try {
      return await blameFile(git, rev, path);
    } catch {
      return null;
    }
  });
  const blames = new Map<string, string[]>();
  for (const [i, path] of paths.entries()) {
    const result = results[i];
    if (result) {
      blames.set(path, result);
    }
  }
  return blames;
};
