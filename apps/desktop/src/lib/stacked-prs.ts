/**
 * Stacked-PR detection over the PRs the inbox can see: two PRs are stacked
 * when one's base branch is the other's head branch, within the same repo.
 * The chain is joined only from visible PRs, so the position it reports
 * ("2 of 3") counts the detected chain, never a completeness claim about the
 * host — a stack whose bottom half is not in the inbox reads as a shorter
 * stack, which is the honest rendering.
 *
 * Entries come back bottom-first (the PR closest to the trunk leads), since
 * that is merge order. Where a branch point makes the chain ambiguous — two
 * PRs stacked on the same head — the walk follows the lowest PR number, the
 * oldest and therefore most likely continuation of the stack, and stays
 * deterministic. A visited set guards against ref cycles so a mis-targeted
 * pair of PRs cannot hang the join.
 */

import type { PullRequest } from "../types.ts";

interface StackEntry {
  current: boolean;
  name: string;
  number: number;
  owner: string;
  title: string;
}

export interface StackInfo {
  entries: StackEntry[];
  position: number;
}

export function detectStack(
  current: PullRequest,
  pool: readonly PullRequest[]
): StackInfo | null {
  if (!(current.headRef && current.baseRef)) {
    return null;
  }
  const candidates = sameRepoCandidates(current, pool);
  const visited = new Set([current.number]);

  const below: PullRequest[] = [];
  let cursor: PullRequest | undefined = current;
  while (cursor) {
    cursor = pickByRef(candidates, (p) => p.headRef === cursor?.baseRef);
    if (!cursor || visited.has(cursor.number)) {
      break;
    }
    visited.add(cursor.number);
    below.unshift(cursor);
  }

  const above: PullRequest[] = [];
  cursor = current;
  while (cursor) {
    cursor = pickByRef(candidates, (p) => p.baseRef === cursor?.headRef);
    if (!cursor || visited.has(cursor.number)) {
      break;
    }
    visited.add(cursor.number);
    above.push(cursor);
  }

  if (below.length === 0 && above.length === 0) {
    return null;
  }
  const chain = [...below, current, ...above];
  return {
    entries: chain.map((p) => ({
      current: p.number === current.number,
      name: p.name,
      number: p.number,
      owner: p.owner,
      title: p.title,
    })),
    position: below.length + 1,
  };
}

function sameRepoCandidates(
  current: PullRequest,
  pool: readonly PullRequest[]
): PullRequest[] {
  const byNumber = new Map<number, PullRequest>();
  for (const p of pool) {
    const sameRepo = p.owner === current.owner && p.name === current.name;
    if (sameRepo && p.number !== current.number && p.headRef && p.baseRef) {
      byNumber.set(p.number, p);
    }
  }
  return [...byNumber.values()];
}

function pickByRef(
  candidates: readonly PullRequest[],
  matches: (p: PullRequest) => boolean
): PullRequest | undefined {
  let best: PullRequest | undefined;
  for (const p of candidates) {
    if (matches(p) && (!best || p.number < best.number)) {
      best = p;
    }
  }
  return best;
}
