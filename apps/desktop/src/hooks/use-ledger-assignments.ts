/**
 * The webview half of the ledger's LLM classification stage
 * (ledger_topics.rs): when the background task writes agent `assigned`
 * facts, Rust emits `ledger-assignments` with the repo key, and the only
 * right response is a refetch — the sidecar regroups the queue on the next
 * status run, so invalidating the status query repaints the queue with the
 * proposed feature topics.
 */
import { listen } from "@tauri-apps/api/event";
import { useEffect } from "react";
import { queryClient, queryKeys } from "../lib/query-client.ts";

interface AssignmentsPayload {
  repoKey: string;
}

export function useLedgerAssignments(): void {
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    listen<AssignmentsPayload>("ledger-assignments", (event) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.ledger(event.payload.repoKey),
      });
    })
      .then((fn) => {
        if (disposed) {
          fn();
        } else {
          unlisten = fn;
        }
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);
}
