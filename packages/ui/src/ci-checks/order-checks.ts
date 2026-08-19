/**
 * The Checks tab's ordering rule, kept out of the component file so that file
 * exports components only — a module that mixes the two loses Fast Refresh
 * for everything in it.
 *
 * Failures first, then running, then passes: the tab answers "which check
 * failed", so the answer sits at the top. Within a state the host's own order
 * survives, which is why each row carries the index it arrived at — that
 * index is also its React key, so a check changing state re-sorts the list
 * without re-keying the row it moved.
 */
import type { CiCheck } from "../ci-pill/ci-pill.tsx";

const ORDER: Record<CiCheck["state"], number> = {
  failure: 0,
  pending: 1,
  success: 2,
};

export interface OrderedCheck {
  check: CiCheck;
  hostOrder: number;
  url: string;
}

/**
 * `checks` in display order. `fallbackUrl` stands in for a check the host
 * gave no link of its own, so every row opens something rather than looking
 * clickable and doing nothing; a row with neither is left with an empty url
 * for the caller to refuse.
 */
export function orderChecks(
  checks: readonly CiCheck[] | undefined,
  fallbackUrl = ""
): OrderedCheck[] {
  if (!checks || checks.length === 0) {
    return [];
  }
  return checks
    .map((check, hostOrder) => ({
      check,
      hostOrder,
      url: check.url || fallbackUrl,
    }))
    .sort((a, b) => ORDER[a.check.state] - ORDER[b.check.state]);
}

/**
 * The verdict a tab wears for `checks`: the worst state present, or null when
 * there is nothing to show. Same precedence the rollup pill uses, derived
 * from the rows themselves so the dot cannot disagree with the list under it.
 */
export function checksVerdict(
  checks: readonly CiCheck[] | undefined
): CiCheck["state"] | null {
  if (!checks || checks.length === 0) {
    return null;
  }
  if (checks.some((check) => check.state === "failure")) {
    return "failure";
  }
  if (checks.some((check) => check.state === "pending")) {
    return "pending";
  }
  return "success";
}
