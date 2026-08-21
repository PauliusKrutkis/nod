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

interface ThreadRoot {
  id: string;
  fact: Fact;
  facts: Fact[];
}

/**
 * The thread root for `id`: the fact itself, or — when `id` names a reply —
 * the root it hangs from. Derivation surfaces replies only directly under
 * their root, so anything appended deeper would be a permanently invisible
 * fact; re-rooting here makes reply/resolve safe to call with any fact id in
 * the thread.
 */
const threadRoot = async (
  git: GitRun,
  id: string
): Promise<ThreadRoot | null> => {
  const facts = await readFacts(git);
  const byId = new Map(facts.map((fact) => [factId(fact), fact]));
  const seen = new Set<string>();
  let rootId = id;
  let fact = byId.get(rootId);
  while (fact?.parent !== undefined && byId.has(fact.parent)) {
    if (seen.has(rootId)) {
      return null;
    }
    seen.add(rootId);
    rootId = fact.parent;
    fact = byId.get(rootId);
  }
  if (fact?.verdict !== "commented") {
    return null;
  }
  return { fact, facts, id: rootId };
};

/** Append a reply into the thread holding `parent`; returns the fact id. */
export const replyToComment = async (
  git: GitRun,
  tip: string,
  parent: string,
  actor: Actor,
  atTime: string,
  body: string
): Promise<string | null> => {
  const root = await threadRoot(git, parent);
  if (!root) {
    return null;
  }
  const fact: Fact = {
    v: 1,
    actor,
    subject: root.fact.subject,
    verdict: "commented",
    atSha: tip,
    atTime,
    body,
    parent: root.id,
  };
  const [id] = await appendFacts(git, [fact]);
  return id;
};

/**
 * Mark the thread holding `parent` resolved; returns the fact id. Idempotent:
 * an already-resolved thread returns the standing resolution instead of
 * appending a duplicate — resolve fires from a single keystroke, and the
 * store never forgets.
 */
export const resolveComment = async (
  git: GitRun,
  tip: string,
  parent: string,
  actor: Actor,
  atTime: string
): Promise<string | null> => {
  const root = await threadRoot(git, parent);
  if (!root) {
    return null;
  }
  const standing = root.facts.find(
    (fact) => fact.verdict === "resolved" && fact.parent === root.id
  );
  if (standing) {
    return factId(standing);
  }
  const fact: Fact = {
    v: 1,
    actor,
    subject: root.fact.subject,
    verdict: "resolved",
    atSha: tip,
    atTime,
    parent: root.id,
  };
  const [id] = await appendFacts(git, [fact]);
  return id;
};
