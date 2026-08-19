import { makeAnchor } from "../anchors/anchor.ts";
import { anchorRefOf } from "../anchors/ref.ts";
import type { Actor, Fact } from "../facts/schema.ts";
import { factId } from "../facts/schema.ts";
import { appendAnchorRefs, appendFacts, readFacts } from "../facts/store.ts";
import type { GitRun } from "../git/exec.ts";
import { readLinesAt } from "../git/files.ts";

/**
 * Inline comments as facts (docs/LEDGER.md §15): a root comment anchors to
 * the content it discusses — so it travels with the code through moves and
 * degrades to "commented on a previous version" when the code is rewritten —
 * and replies/resolutions are facts pointing at the root through `parent`.
 * Append-only like everything else: no edits, no deletes.
 */

/** Anchor a comment to a region at `tip`; returns the root fact's id. */
export const commentOnRegion = async (
  git: GitRun,
  tip: string,
  region: { path: string; startLine: number; endLine: number },
  actor: Actor,
  atTime: string,
  body: string
): Promise<string | null> => {
  let fileLines: string[];
  try {
    fileLines = await readLinesAt(git, tip, region.path);
  } catch {
    return null; // the path is not in tip's tree — nothing to anchor to
  }
  const rawLines = fileLines.slice(region.startLine - 1, region.endLine);
  const anchor = makeAnchor(tip, region.path, region.startLine, rawLines);
  if (!anchor) {
    return null;
  }
  await appendAnchorRefs(git, [anchorRefOf(anchor)]);
  const fact: Fact = {
    v: 1,
    actor,
    subject: { kind: "anchor", id: anchor.id },
    verdict: "commented",
    atSha: tip,
    atTime,
    body,
  };
  const [id] = await appendFacts(git, [fact]);
  return id;
};

const rootFact = async (git: GitRun, id: string): Promise<Fact | null> => {
  const facts = await readFacts(git);
  return facts.find((fact) => factId(fact) === id) ?? null;
};

/** Append a reply into the thread rooted at `parent`; returns the fact id. */
export const replyToComment = async (
  git: GitRun,
  tip: string,
  parent: string,
  actor: Actor,
  atTime: string,
  body: string
): Promise<string | null> => {
  const root = await rootFact(git, parent);
  if (root?.verdict !== "commented") {
    return null;
  }
  const fact: Fact = {
    v: 1,
    actor,
    subject: root.subject,
    verdict: "commented",
    atSha: tip,
    atTime,
    body,
    parent,
  };
  const [id] = await appendFacts(git, [fact]);
  return id;
};

/** Mark the thread rooted at `parent` resolved; returns the fact id. */
export const resolveComment = async (
  git: GitRun,
  tip: string,
  parent: string,
  actor: Actor,
  atTime: string
): Promise<string | null> => {
  const root = await rootFact(git, parent);
  if (root?.verdict !== "commented") {
    return null;
  }
  const fact: Fact = {
    v: 1,
    actor,
    subject: root.subject,
    verdict: "resolved",
    atSha: tip,
    atTime,
    parent,
  };
  const [id] = await appendFacts(git, [fact]);
  return id;
};
