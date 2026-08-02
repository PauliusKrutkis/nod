import { useEffect, useRef } from "react";
import { usePerfStore } from "../lib/perf.ts";
import { updateReviewMemory } from "../lib/review-memory.ts";
import type { PullRequest } from "../types.ts";

/**
 * Tracks head SHA changes for the open-perf mark and review memory.
 *
 * Deliberately silent: announcing the update is the reconcile toast's job
 * (`unviewedReconcileToast`), which names the files that changed, and the
 * per-file "updated" chip's. Both share the store's single toast slot, so a
 * generic "Pull request updated" here only raced the informative one.
 */
export function useReviewHeadShaSync(
  routeKey: string,
  pr: PullRequest | undefined
): void {
  const mountShaRef = useRef<string | null>(null);

  useEffect(() => {
    if (!pr) {
      return;
    }
    const seen = mountShaRef.current;
    if (!seen) {
      usePerfStore.getState().completeOpen();
      mountShaRef.current = pr.headSha;
      updateReviewMemory(routeKey, { headSha: pr.headSha });
      return;
    }
    if (pr.headSha && pr.headSha !== seen) {
      mountShaRef.current = pr.headSha;
      updateReviewMemory(routeKey, { headSha: pr.headSha });
    }
  }, [pr, routeKey]);
}
