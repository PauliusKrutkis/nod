import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api.ts";
import { copyTextToClipboard } from "../lib/clipboard.ts";
import {
  canPlaceAgain,
  itemLabel,
  itemText,
  queueSummary,
} from "../lib/offline-summary.ts";
import { connectivityKey } from "../lib/offline-writes.ts";
import { useAppStore } from "../store/app-store.ts";
import type { QueuedWrite, ReplayedItem } from "../types.ts";
import { prKey } from "../types.ts";

/**
 * The offline surface (docs/BACKLOG.md, offline review): a bar that announces
 * the offline state with the queue summarised by verb, and the reconnect
 * report. Connectivity is polled from the Rust flag every few seconds; the
 * flag itself only moves on real request outcomes, so this poll costs no
 * network. On the offline-to-online transition the queue replays on its own,
 * except a staged review submission, which waits for the send press here
 * because submitting carries a verdict. Failed items stay in the Rust queue
 * with their text until placed again (inline comments become pending comments
 * at the same spot), copied, or discarded, so no outcome is ever "lost". The
 * landed and nothing-to-do lines are transient and dismiss with the report.
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
  const queuedItems = queue.filter((i) => i.state === "queued");
  const failedItems = queue.filter((i) => i.state === "failed");
  const stagedSubmit = queuedItems.find((i) => i.verb.kind === "submitReview");
  const autoQueued = queuedItems.filter((i) => i.verb.kind !== "submitReview");

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

  const replayRef = useRef(replay.mutate);
  replayRef.current = replay.mutate;
  const prevOnline = useRef(online);
  const pendingReplay = online && autoQueued.length > 0 && !replay.isPending;
  useEffect(() => {
    const cameBack = online && !prevOnline.current;
    prevOnline.current = online;
    if (cameBack && pendingReplay) {
      replayRef.current(false);
    }
  }, [online, pendingReplay]);

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

  const landed = (report ?? []).filter((r) => r.outcome === "landed");
  const nothingToDo = (report ?? []).filter((r) => r.outcome === "nothingToDo");
  const reportOpen =
    landed.length > 0 ||
    nothingToDo.length > 0 ||
    failedItems.length > 0 ||
    (online && !!stagedSubmit);

  if (!online) {
    return (
      <div className="qb-toast" role="status">
        <span aria-hidden className="qb-toast-rail" />
        <div className="qb-toast-body">
          <div className="qb-toast-head">
            <span className="qb-toast-title">Offline</span>
          </div>
          <div className="qb-toast-sub">
            {queuedItems.length > 0
              ? `Queued: ${queueSummary(queuedItems)}. Everything posts when the connection returns.`
              : "Reading from cache. Anything you write will queue and post when the connection returns."}
          </div>
        </div>
      </div>
    );
  }

  if (!reportOpen) {
    return null;
  }

  return (
    <div className="qb-toast" role="status">
      <span aria-hidden className="qb-toast-rail" />
      <div className="qb-toast-body">
        <div className="qb-toast-head">
          <span className="qb-toast-title">Back online</span>
          <button
            aria-label="Dismiss"
            className="qb-x"
            onClick={() => setReport(null)}
            type="button"
          >
            <X aria-hidden size={14} />
          </button>
        </div>
        {landed.length > 0 && (
          <div className="qb-toast-sub">
            {landed.length === 1
              ? "1 queued write posted."
              : `${landed.length} queued writes posted.`}
          </div>
        )}
        {nothingToDo.map((r) => (
          <div className="qb-toast-sub" key={r.item.id}>
            Nothing to do for the {itemLabel(r.item)}: {r.reason}.
          </div>
        ))}
        {failedItems.map((item) => (
          <div className="qb-toast-sub" key={item.id}>
            <div>
              The {itemLabel(item)} did not post: {item.failure}
            </div>
            {!!itemText(item) && (
              <div className="break-words">“{itemText(item)}”</div>
            )}
            <div className="qb-toast-actions">
              {canPlaceAgain(item) && (
                <button
                  className="qb-toast-open"
                  onClick={() => placeAgain(item)}
                  type="button"
                >
                  Place again
                </button>
              )}
              {!!itemText(item) && (
                <button
                  className="qb-toast-open"
                  onClick={() => copyItem(item)}
                  type="button"
                >
                  Copy
                </button>
              )}
              <button
                className="qb-toast-open"
                onClick={() => discard(item)}
                type="button"
              >
                Discard
              </button>
            </div>
          </div>
        ))}
        {!!stagedSubmit && (
          <div className="qb-toast-sub">
            <div>
              Your {itemLabel(stagedSubmit)} is staged. It sends only when you
              press send.
            </div>
            <div className="qb-toast-actions">
              <button
                className="qb-toast-open"
                disabled={replay.isPending}
                onClick={() => replay.mutate(true)}
                type="button"
              >
                Send review
              </button>
              <button
                className="qb-toast-open"
                onClick={() => discard(stagedSubmit)}
                type="button"
              >
                Discard
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
