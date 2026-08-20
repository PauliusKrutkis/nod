import { OfflineBar } from "@nod/ui/offline-bar";
import {
  canPlaceAgain,
  itemText,
  type QueuedWrite,
  type ReplayedItem,
} from "@nod/ui/offline-summary";
import { useLatest } from "@nod/ui/use-latest";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api.ts";
import { copyTextToClipboard } from "../lib/clipboard.ts";
import { connectivityKey } from "../lib/offline-writes.ts";
import { useAppStore } from "../store/app-store.ts";
import { prKey } from "../types.ts";

/**
 * The offline surface's wiring (docs/BACKLOG.md, offline review); its card is
 * offline-bar, catalogued in @nod/ui. Connectivity is polled from the Rust
 * flag every few seconds; the flag itself only moves on real request
 * outcomes, so this poll costs no network. On the offline-to-online
 * transition the queue replays on its own, except a staged review submission,
 * which waits for the send press because submitting carries a verdict.
 * Failed items stay in the Rust queue with their text until placed again
 * (inline comments become pending comments at the same spot), copied, or
 * discarded, so no outcome is ever "lost". The landed and nothing-to-do lines
 * are transient and dismiss with the report.
 *
 * The offline-to-online transition is a latch, not an edge compared against
 * the previous render: it clears only once a replay actually starts (or there
 * is nothing to replay), so a reconnect that lands mid-replay still gets its
 * queue drained instead of consuming the transition and waiting for the next
 * one. `mutate` is read through useLatest because writing a ref during render
 * makes the React Compiler skip the component.
 */

const POLL_MS = 5000;

export function OfflineBarLoader() {
  const queryClient = useQueryClient();
  const setToast = useAppStore((s) => s.setToast);
  const addPendingComment = useAppStore((s) => s.addPendingComment);
  const clearPendingComments = useAppStore((s) => s.clearPendingComments);
  const [report, setReport] = useState<ReplayedItem[] | null>(null);

  const { data } = useQuery({
    queryFn: () => api.connectivityStatus().catch(() => null),
    queryKey: connectivityKey,
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: true,
    staleTime: 0,
  });

  const online = data?.online ?? true;
  const queue = data?.queue ?? [];

  const finishReplay = (attempted: ReplayedItem[]) => {
    setReport((cur) => [...(cur ?? []), ...attempted]);
    for (const r of attempted) {
      if (r.outcome === "landed" && r.item.verb.kind === "submitReview") {
        clearPendingComments(
          prKey({
            name: r.item.repo,
            number: r.item.number,
            owner: r.item.owner,
          })
        );
      }
    }
    queryClient.invalidateQueries({ queryKey: connectivityKey });
    queryClient.invalidateQueries({ queryKey: ["pr"] });
  };

  const replay = useMutation({
    mutationFn: (includeSubmit: boolean) => api.replayQueue(includeSubmit),
    onError: (e) => {
      useAppStore.getState().setFlash(`Replaying queued writes failed. ${e}`);
    },
    onSuccess: (r) => finishReplay(r.attempted),
  });

  const startReplay = useLatest(replay.mutate);
  const sawOffline = useRef(!online);
  const autoQueuedCount = queue.filter(
    (i) => i.state === "queued" && i.verb.kind !== "submitReview"
  ).length;
  const replaying = replay.isPending;
  useEffect(() => {
    if (!online) {
      sawOffline.current = true;
      return;
    }
    if (!sawOffline.current) {
      return;
    }
    if (autoQueuedCount === 0) {
      sawOffline.current = false;
      return;
    }
    if (replaying) {
      return;
    }
    sawOffline.current = false;
    startReplay.current(false);
  }, [online, autoQueuedCount, replaying, startReplay]);

  const discard = async (item: QueuedWrite) => {
    await api.discardQueued(item.id).catch(() => undefined);
    queryClient.invalidateQueries({ queryKey: connectivityKey });
  };

  const placeAgain = (item: QueuedWrite) => {
    if (!canPlaceAgain(item)) {
      return;
    }
    addPendingComment(
      prKey({ name: item.repo, number: item.number, owner: item.owner }),
      {
        body: item.verb.body,
        line: item.verb.line,
        path: item.verb.path,
        side: item.verb.side,
        startLine: item.verb.startLine ?? undefined,
      }
    );
    setToast({
      message: `It is staged on ${item.verb.path}:${item.verb.line} and submits with your review.`,
      title: "Comment placed again",
    });
    discard(item);
  };

  const copyItem = (item: QueuedWrite) => {
    const text = itemText(item);
    if (text) {
      copyTextToClipboard(text);
      setToast({ message: text, title: "Copied" });
    }
  };

  return (
    <OfflineBar
      onCopy={copyItem}
      onDiscard={discard}
      onDismiss={() => setReport(null)}
      online={online}
      onPlaceAgain={placeAgain}
      onSend={() => replay.mutate(true)}
      queue={queue}
      report={report}
      sending={replay.isPending}
    />
  );
}
