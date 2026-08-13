import { createHash } from "node:crypto";
import type { GitRun } from "../git/exec.ts";
import { isTrackablePath } from "../git/files.ts";

/**
 * A tracked region: the added lines of one hunk, captured at the commit that
 * introduced them. The lines are the post-image content — what a reviewer
 * actually signs. Identity is positional (this hunk of this commit); content
 * equality is the resolver's job, not the id's.
 */
export interface Anchor {
  id: string;
  atSha: string;
  path: string;
  /** 1-based line number of the first added line in the post-image. */
  startLine: number;
  lines: string[];
}

const NEW_FILE_HEADER = /^\+\+\+ (?:b\/(.*)|(\/dev\/null))$/;
const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;

const anchorId = (
  atSha: string,
  path: string,
  startLine: number,
  lines: readonly string[]
): string =>
  createHash("sha256")
    .update(`${atSha}\n${path}\n${startLine}\n${lines.join("\n")}`)
    .digest("hex");

/**
 * Build an anchor from a region of a tree. Boundary blank lines are diff
 * noise, not reviewable content, and they break contiguous matching when
 * neighbors change — the anchor is the non-blank extent. Null when the
 * region is all blank: there is nothing to track.
 */
export const makeAnchor = (
  atSha: string,
  path: string,
  startLine: number,
  rawLines: readonly string[]
): Anchor | null => {
  let from = 0;
  let to = rawLines.length;
  while (from < to && rawLines[from].trim() === "") {
    from += 1;
  }
  while (to > from && rawLines[to - 1].trim() === "") {
    to -= 1;
  }
  if (from === to) {
    return null;
  }
  const lines = rawLines.slice(from, to);
  const start = startLine + from;
  return {
    id: anchorId(atSha, path, start, lines),
    atSha,
    path,
    startLine: start,
    lines,
  };
};

/**
 * Extract the anchors a commit introduced: one per hunk with added lines,
 * from a context-free diff against its first parent. Hunks that are all
 * whitespace are dropped — there is nothing reviewable to track.
 */
export const extractAnchors = async (
  git: GitRun,
  sha: string
): Promise<Anchor[]> => {
  const out = await git([
    "-c",
    "core.quotepath=false",
    "show",
    "--format=",
    "--unified=0",
    sha,
  ]);

  const anchors: Anchor[] = [];
  let path: string | null = null;
  let startLine = 0;
  let collected: string[] | null = null;

  const flush = () => {
    if (!(path && collected)) {
      collected = null;
      return;
    }
    const raw = collected;
    collected = null;
    const anchor = makeAnchor(sha, path, startLine, raw);
    if (anchor) {
      anchors.push(anchor);
    }
  };

  for (const line of out.split("\n")) {
    const fileHeader = NEW_FILE_HEADER.exec(line);
    if (fileHeader) {
      flush();
      const newPath = fileHeader[1];
      path = newPath && isTrackablePath(newPath) ? newPath : null;
      continue;
    }
    const hunkHeader = HUNK_HEADER.exec(line);
    if (hunkHeader) {
      flush();
      startLine = Number(hunkHeader[1]);
      collected = [];
      continue;
    }
    if (collected && line.startsWith("+")) {
      collected.push(line.slice(1));
    }
  }
  flush();
  return anchors;
};
