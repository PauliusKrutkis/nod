import { useLatest } from "@nod/ui/use-latest";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { api } from "../lib/api.ts";
import type { RepoStoreStatus } from "../types.ts";

const POLL_MS = 2000;

/** States that end a poll: nothing further happens without a new ensure. */
const REPO_STORE_SETTLED: ReadonlySet<RepoStoreStatus["state"]> = new Set([
  "failed",
  "ready",
]);

/**
 * Readiness of the repo store — the app-owned clone — for one commit. Every
 * surface that needs "can local reads answer?" (chat, repo search) shares
 * this hook, so the polling cadence, the ensure kick and the settle rules
 * exist once instead of per consumer.
 *
 * The status query polls while git works and stops on ready/failed. The
 * ensure kick fires once per mount when the store reports idle — PR open
 * usually warmed it already, so the kick only matters for surfaces reached
 * without the detail screen. Failure is sticky per SHA on the Rust side and
 * there is deliberately no retry loop here: the next push moves the SHA,
 * which retries by itself.
 */
export function useRepoStore(args: {
  active: boolean;
  owner: string;
  repo: string;
  sha: string;
}): {
  status: RepoStoreStatus | undefined;
  error: unknown;
  ready: boolean;
} {
  const statusKey = ["repoStoreStatus", args.owner, args.repo, args.sha];
  const status = useQuery({
    enabled: args.active && args.sha !== "",
    queryFn: () => api.repoStoreStatus(args.owner, args.repo, args.sha),
    queryKey: statusKey,
    refetchInterval: (query) => {
      const state = query.state.data?.state;
      return state !== undefined && REPO_STORE_SETTLED.has(state)
        ? false
        : POLL_MS;
    },
    retry: false,
  });

  const queryClient = useQueryClient();
  const ensure = useMutation({
    mutationFn: () => api.ensureRepoStore(args.owner, args.repo, args.sha),
    onSettled: () => queryClient.invalidateQueries({ queryKey: statusKey }),
  });

  const kickRef = useLatest(ensure.mutate);
  const idleRef = useLatest(ensure.isIdle);
  const state = status.data?.state;
  useEffect(() => {
    if (args.active && idleRef.current && state === "idle") {
      kickRef.current();
    }
  }, [args.active, state, idleRef, kickRef]);

  return {
    error: status.isError ? status.error : null,
    ready: state === "ready",
    status: status.data,
  };
}
