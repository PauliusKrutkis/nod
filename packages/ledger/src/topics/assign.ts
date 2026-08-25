import type { Fact } from "../facts/schema.ts";

/**
 * The fact-backed stages of the classification cascade (docs/LEDGER.md §3):
 * a `corrected` fact is a human pinning a commit to a topic — sticky, wins
 * over everything, forever. An `assigned` fact is an agent's proposal (the
 * LLM stage writes these), honored until a human says otherwise. Both are
 * `(subject: sha, body: topic)` facts, so classification is paid once per
 * commit, syncs with every other fact, and is reproducible with no model
 * in the loop.
 */

export interface Assignment {
  topic: string;
  /** True when a human pinned it; agent proposals never displace it. */
  corrected: boolean;
}

const isAssignment = (fact: Fact): boolean =>
  (fact.verdict === "assigned" || fact.verdict === "corrected") &&
  fact.subject.kind === "sha" &&
  typeof fact.body === "string" &&
  fact.body.length > 0;

/**
 * Latest assignment per commit. Corrections beat proposals regardless of
 * time; within a class the newest `atTime` wins, so a re-correction is
 * just a newer fact — append-only all the way down.
 */
export const assignmentsFrom = (
  facts: readonly Fact[]
): Map<string, Assignment> => {
  const picked = new Map<string, { fact: Fact; corrected: boolean }>();
  for (const fact of facts) {
    if (!isAssignment(fact)) {
      continue;
    }
    const corrected = fact.verdict === "corrected";
    const current = picked.get(fact.subject.id);
    const wins =
      current === undefined ||
      (corrected && !current.corrected) ||
      (corrected === current.corrected && fact.atTime > current.fact.atTime);
    if (wins) {
      picked.set(fact.subject.id, { corrected, fact });
    }
  }
  const assignments = new Map<string, Assignment>();
  for (const [sha, { fact, corrected }] of picked) {
    assignments.set(sha, { corrected, topic: fact.body ?? "" });
  }
  return assignments;
};
