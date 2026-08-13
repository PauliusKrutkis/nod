import type { GitRun } from "../git/exec.ts";
import type { Anchor } from "./anchor.ts";

/**
 * The stored form of an anchor: a foreign key into git, never a copy of the
 * content. The signed lines live in the tree of `atSha`, which the repo
 * already keeps forever; the ledger stores only where to look
 * (docs/LEDGER.md §2 — "the ledger holds foreign keys into git").
 */
export interface AnchorRef {
  id: string;
  atSha: string;
  path: string;
  /** 1-based first line of the signed region at atSha. */
  startLine: number;
  lineCount: number;
}

export const anchorRefOf = (anchor: Anchor): AnchorRef => ({
  id: anchor.id,
  atSha: anchor.atSha,
  path: anchor.path,
  startLine: anchor.startLine,
  lineCount: anchor.lines.length,
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const isAnchorRef = (value: unknown): value is AnchorRef =>
  isRecord(value) &&
  typeof value.id === "string" &&
  typeof value.atSha === "string" &&
  typeof value.path === "string" &&
  typeof value.startLine === "number" &&
  value.startLine >= 1 &&
  typeof value.lineCount === "number" &&
  value.lineCount >= 1;

export const parseAnchorRef = (json: string): AnchorRef => {
  const value: unknown = JSON.parse(json);
  if (!isAnchorRef(value)) {
    throw new Error("not a valid ledger anchor ref");
  }
  return value;
};

/** Recover the signed content from git; null if the ref dangles. */
export const loadAnchorLines = async (
  git: GitRun,
  ref: AnchorRef
): Promise<string[] | null> => {
  let blob: string;
  try {
    blob = await git(["cat-file", "blob", `${ref.atSha}:${ref.path}`]);
  } catch {
    return null;
  }
  const lines = blob.split("\n");
  if (lines.at(-1) === "") {
    lines.pop();
  }
  const slice = lines.slice(
    ref.startLine - 1,
    ref.startLine - 1 + ref.lineCount
  );
  return slice.length === ref.lineCount ? slice : null;
};
