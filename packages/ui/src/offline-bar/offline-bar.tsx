/**
 * The offline surface's card, with two faces. Offline it announces the state
 * with the queue summarised by verb; back online it is the reconnect report:
 * how many writes landed, what there was nothing to do for, each failed item
 * with its text and the ways out (place again, copy, discard), and the staged
 * review submission, which never sends without the press here because
 * submitting carries a verdict. When the host is online and there is nothing
 * to report it renders nothing at all — the quiet state is no bar.
 *
 * The host owns when replays run and what the buttons do (the queue lives on
 * the Rust side); this view derives everything it shows from the queue and
 * the report it is handed, so a fixture can put it in any state the app can
 * reach. `sending` is the in-flight replay of the staged review, worn as the
 * send button's disabled state.
 */
import { X } from "lucide-react";
import {
  canPlaceAgain,
  itemLabel,
  itemText,
  type QueuedWrite,
  queueSummary,
  type ReplayedItem,
} from "./offline-summary.ts";
import "./offline-bar.css";

export function OfflineBar({
  online,
  queue,
  report,
  sending,
  onCopy,
  onDiscard,
  onDismiss,
  onPlaceAgain,
  onSend,
}: {
  onCopy: (item: QueuedWrite) => void;
  onDiscard: (item: QueuedWrite) => void;
  onDismiss: () => void;
  online: boolean;
  onPlaceAgain: (item: QueuedWrite) => void;
  onSend: () => void;
  queue: readonly QueuedWrite[];
  report: readonly ReplayedItem[] | null;
  sending: boolean;
}) {
  const queuedItems = queue.filter((i) => i.state === "queued");
  const failedItems = queue.filter((i) => i.state === "failed");
  const stagedSubmit = queuedItems.find((i) => i.verb.kind === "submitReview");

  if (!online) {
    return (
      <div className="q-obar" role="status">
        <span aria-hidden className="q-obar-rail" />
        <div className="q-obar-body">
          <div className="q-obar-head">
            <span className="q-obar-title">Offline</span>
          </div>
          <div className="q-obar-sub">
            {queuedItems.length > 0
              ? `Queued: ${queueSummary(queuedItems)}. Everything posts when the connection returns.`
              : "Reading from cache. Anything you write will queue and post when the connection returns."}
          </div>
        </div>
      </div>
    );
  }

  const landed = (report ?? []).filter((r) => r.outcome === "landed");
  const nothingToDo = (report ?? []).filter((r) => r.outcome === "nothingToDo");
  const reportOpen =
    landed.length > 0 ||
    nothingToDo.length > 0 ||
    failedItems.length > 0 ||
    !!stagedSubmit;

  if (!reportOpen) {
    return null;
  }

  return (
    <div className="q-obar" role="status">
      <span aria-hidden className="q-obar-rail" />
      <div className="q-obar-body">
        <div className="q-obar-head">
          <span className="q-obar-title">Back online</span>
          <button
            aria-label="Dismiss"
            className="q-obar-x"
            onClick={onDismiss}
            type="button"
          >
            <X aria-hidden size={14} />
          </button>
        </div>
        {landed.length > 0 && (
          <div className="q-obar-sub">
            {landed.length === 1
              ? "1 queued write posted."
              : `${landed.length} queued writes posted.`}
          </div>
        )}
        {nothingToDo.map((r) => (
          <div className="q-obar-sub" key={r.item.id}>
            Nothing to do for the {itemLabel(r.item)}: {r.reason}.
          </div>
        ))}
        {failedItems.map((item) => (
          <div className="q-obar-sub" key={item.id}>
            <div>
              The {itemLabel(item)} did not post: {item.failure}
            </div>
            {!!itemText(item) && (
              <div className="q-obar-quote">“{itemText(item)}”</div>
            )}
            <div className="q-obar-actions">
              {canPlaceAgain(item) && (
                <button
                  className="q-obar-act"
                  onClick={() => onPlaceAgain(item)}
                  type="button"
                >
                  Place again
                </button>
              )}
              {!!itemText(item) && (
                <button
                  className="q-obar-act"
                  onClick={() => onCopy(item)}
                  type="button"
                >
                  Copy
                </button>
              )}
              <button
                className="q-obar-act"
                onClick={() => onDiscard(item)}
                type="button"
              >
                Discard
              </button>
            </div>
          </div>
        ))}
        {!!stagedSubmit && (
          <div className="q-obar-sub">
            <div>
              Your {itemLabel(stagedSubmit)} is staged. It sends only when you
              press send.
            </div>
            <div className="q-obar-actions">
              <button
                className="q-obar-act"
                disabled={sending}
                onClick={onSend}
                type="button"
              >
                Send review
              </button>
              <button
                className="q-obar-act"
                onClick={() => onDiscard(stagedSubmit)}
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
