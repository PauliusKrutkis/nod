import { type Fact, factId } from "../facts/schema.ts";

/**
 * Topic display numbers (#1, #2, …) — the PR-number affordance for groups
 * the forge never minted anything for. A `numbered` fact claims one number
 * for one topic; numbers live in the fact log so every clone of the ledger
 * agrees on them and they survive regrouping of the commits underneath.
 *
 * Claims need no coordination: minting is max+1, and when two machines
 * mint concurrently the earliest `atTime` (factId as the tie-break) wins
 * both the topic and the number — the loser's topic simply stays
 * unnumbered and is re-minted with a fresh number on its next derivation,
 * so the map converges everywhere without a lock.
 */

const NUMBER_BODY = /^[1-9]\d*$/;

const isNumberClaim = (fact: Fact): boolean =>
  fact.verdict === "numbered" &&
  fact.subject.kind === "topic" &&
  typeof fact.body === "string" &&
  NUMBER_BODY.test(fact.body);

/** topic → display number, after conflict resolution. */
export const numbersFrom = (facts: readonly Fact[]): Map<string, number> => {
  const claims = facts
    .filter(isNumberClaim)
    .map((fact) => ({
      atTime: fact.atTime,
      id: factId(fact),
      number: Number(fact.body),
      topic: fact.subject.id,
    }))
    .sort((a, b) => {
      if (a.atTime !== b.atTime) {
        return a.atTime < b.atTime ? -1 : 1;
      }
      return a.id < b.id ? -1 : 1;
    });
  const byTopic = new Map<string, number>();
  const taken = new Set<number>();
  for (const claim of claims) {
    if (byTopic.has(claim.topic) || taken.has(claim.number)) {
      continue;
    }
    byTopic.set(claim.topic, claim.number);
    taken.add(claim.number);
  }
  return byTopic;
};

/** The next free number given every claim ever made — max+1 over all
 *  claims, resolved or not, so a lost race never reuses a number. */
export const nextNumber = (facts: readonly Fact[]): number => {
  let max = 0;
  for (const fact of facts) {
    if (isNumberClaim(fact)) {
      max = Math.max(max, Number(fact.body));
    }
  }
  return max + 1;
};
