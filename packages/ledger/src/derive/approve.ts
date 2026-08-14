import type { Actor, Fact } from "../facts/schema.ts";
import { appendFacts } from "../facts/store.ts";
import type { GitRun } from "../git/exec.ts";

/**
 * The approval stamp (docs/LEDGER.md §2): one fact on a topic at the tip
 * the approver attested. No anchor — the subject is the derived topic id,
 * and every consequence (coverage, baselines, thresholds) lives in the
 * derivation, never here. A single append, atomic by construction; the
 * store content-dedupes identical facts.
 */
export const approveTopic = async (
  git: GitRun,
  options: { topic: string; actor: Actor; atTime: string; tip?: string }
): Promise<string> => {
  const atSha = (await git(["rev-parse", options.tip ?? "HEAD"])).trim();
  const fact: Fact = {
    v: 1,
    actor: options.actor,
    subject: { kind: "topic", id: options.topic },
    verdict: "approved",
    atSha,
    atTime: options.atTime,
  };
  const [factId] = await appendFacts(git, [fact]);
  return factId;
};
