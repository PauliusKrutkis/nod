import { useQueries } from "@tanstack/react-query";
import { useEffect } from "react";
import { api } from "../lib/api.ts";
import { queryClient, queryKeys } from "../lib/query-client.ts";
import type { LedgerStatus } from "../types.ts";

/**
 * Every watched repo's ledger status, cache-first the way the inbox is:
 * the last derived status seeds from disk for an instant paint, then the
 * real derivation refreshes behind it. Shared by the Ledger tab (rows)
 * and the inbox (the tab's count) so both ride one cache; the staleTime
 * keeps tab-hopping from re-deriving six repos every few seconds, while
 * `ledger-assignments` invalidation still regroups immediately.
 */
export function useLedgerStatuses(repos: readonly string[]) {
  useEffect(() => {
    for (const repoKey of repos) {
      api
        .ledgerStatusCached(repoKey)
        .then((data) => {
          if (data) {
            queryClient.setQueryData<LedgerStatus>(
              queryKeys.ledger(repoKey),
              (cur) => cur ?? data
            );
          }
        })
        .catch(() => undefined);
    }
  }, [repos]);

  return useQueries({
    queries: repos.map((repoKey) => ({
      queryFn: () => api.ledgerStatus(repoKey),
      queryKey: queryKeys.ledger(repoKey),
      staleTime: 60_000,
    })),
  });
}
