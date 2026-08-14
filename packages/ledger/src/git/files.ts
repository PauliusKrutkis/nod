import { mapLimit } from "../concurrency.ts";
import type { GitRun } from "./exec.ts";

const BINARY_PATH =
  /\.(png|jpe?g|gif|ico|icns|webp|avif|woff2?|ttf|otf|eot|pdf|zip|gz|tar|dmg|mp4|mov|wasm|jar)$/i;
const GENERATED_PATH = /(^|\/)(pnpm-lock\.yaml|.*\.lock|.*\.snap)$/;

/** Paths the ledger tracks: text, hand-written, reviewable. */
export const isTrackablePath = (path: string): boolean =>
  !(BINARY_PATH.test(path) || GENERATED_PATH.test(path));

const listTrackableFiles = async (
  git: GitRun,
  rev: string
): Promise<string[]> => {
  const out = await git(["ls-tree", "-r", "--name-only", "-z", rev]);
  return out.split("\0").filter((path) => path && isTrackablePath(path));
};

export const readLinesAt = async (
  git: GitRun,
  rev: string,
  path: string
): Promise<string[]> => {
  const out = await git(["cat-file", "blob", `${rev}:${path}`]);
  const lines = out.split("\n");
  if (lines.at(-1) === "") {
    lines.pop();
  }
  return lines;
};

/** All trackable files at `rev` with their raw lines. */
export const readTreeLines = async (
  git: GitRun,
  rev: string
): Promise<Map<string, string[]>> => {
  const paths = await listTrackableFiles(git, rev);
  const contents = await mapLimit(paths, 16, (path) =>
    readLinesAt(git, rev, path)
  );
  return new Map(paths.map((path, i) => [path, contents[i]]));
};

/**
 * old path → new path for files git detects as renamed between two revs.
 * This is only a routing hint for the resolver (where to look first); anchor
 * survival never depends on it.
 */
export const renameMap = async (
  git: GitRun,
  from: string,
  to: string
): Promise<Map<string, string>> => {
  const out = await git([
    "-c",
    "core.quotepath=false",
    "diff",
    "--name-status",
    "--find-renames",
    "-z",
    from,
    to,
  ]);
  const fields = out.split("\0");
  const renames = new Map<string, string>();
  let i = 0;
  while (i < fields.length) {
    const status = fields[i];
    if (!status) {
      i += 1;
      continue;
    }
    if (status.startsWith("R") || status.startsWith("C")) {
      const [oldPath, newPath] = [fields[i + 1], fields[i + 2]];
      if (oldPath && newPath && status.startsWith("R")) {
        renames.set(oldPath, newPath);
      }
      i += 3;
    } else {
      i += 2;
    }
  }
  return renames;
};
