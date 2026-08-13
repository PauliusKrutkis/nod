import { makeAnchor } from "../anchors/anchor.ts";
import { anchorRefOf } from "../anchors/ref.ts";
import type { Actor, Fact } from "../facts/schema.ts";
import { appendAnchorRefs, appendFacts } from "../facts/store.ts";
import type { GitRun } from "../git/exec.ts";
import { readLinesAt } from "../git/files.ts";

/**
 * Turn "I read this region at this tip" into ledger state: an anchor for
 * the content plus a reviewed fact pointing at it. The anchor ref stores
 * only coordinates into git; the content is recoverable from `tip` forever.
 */
export const signRegion = async (
  git: GitRun,
  tip: string,
  region: { path: string; startLine: number; endLine: number },
  actor: Actor,
  atTime: string
): Promise<string | null> => {
  const fileLines = await readLinesAt(git, tip, region.path);
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
    verdict: "reviewed",
    atSha: tip,
    atTime,
  };
  const [factId] = await appendFacts(git, [fact]);
  return factId;
};
