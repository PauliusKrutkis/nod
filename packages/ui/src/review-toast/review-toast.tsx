/**
 * The "someone asked you to review this" card: who asked, which PR, and the
 * two ways out — Enter opens it, Esc dismisses. When it appears and when it
 * expires is the host's business (a poll decides that); this view owns the
 * card and the caret.
 *
 * It is a non-modal <dialog> shown with show(), so it sits in the host's
 * alert stack rather than the top layer and never traps Tab behind it. On
 * mount the panel takes focus so the keyboard hints on it are true — unless
 * the caret is already in a text field, because a toast that swallows a
 * keystroke mid-sentence is worse than one nobody notices — and focus goes
 * back where it was when the card leaves. Nothing calls close(): React
 * removing the element is what closes it, and close()'s event is queued, so
 * under StrictMode's mount→unmount→remount it would fire after the remount.
 *
 * ReviewRequest is the package's own minimal shape, not an import from the
 * app — the desktop's richer PullRequest satisfies it structurally.
 */
import { X } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import { Avatar } from "../avatar/avatar.tsx";
import { Kbd } from "../kbd/kbd.tsx";
import "./review-toast.css";

export interface ReviewRequest {
  author: string;
  authorAvatarUrl?: string | null;
  number: number;
  title: string;
}

function isTyping(node: Element | null): boolean {
  return (
    node instanceof HTMLElement &&
    (node.tagName === "INPUT" ||
      node.tagName === "TEXTAREA" ||
      node.isContentEditable)
  );
}

export function ReviewToast({
  request,
  extraCount = 0,
  onOpen,
  onDismiss,
}: {
  extraCount?: number;
  onDismiss: () => void;
  onOpen: () => void;
  request: ReviewRequest;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDialogElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) {
      return;
    }
    if (!panel.open) {
      panel.show();
    }
    const active = document.activeElement;
    if (isTyping(active)) {
      return;
    }
    restoreRef.current = active instanceof HTMLElement ? active : null;
    panel.focus();
    return () => {
      const previous = restoreRef.current;
      restoreRef.current = null;
      if (previous?.isConnected) {
        previous.focus();
      }
    };
  }, []);

  return (
    <dialog
      aria-labelledby={titleId}
      className="q-toast"
      ref={panelRef}
      tabIndex={-1}
    >
      <span aria-hidden className="q-toast-rail" />
      <Avatar name={request.author} size={30} url={request.authorAvatarUrl} />
      <div className="q-toast-body">
        <div className="q-toast-head">
          <span className="q-toast-title" id={titleId}>
            New review request
          </span>
          <button
            aria-label="Dismiss"
            className="q-toast-x q-focus"
            onClick={onDismiss}
            type="button"
          >
            <X aria-hidden size={13} />
          </button>
        </div>
        <p className="q-toast-text">
          <b>{request.author}</b> asked you to review{" "}
          <span className="q-mono q-toast-num">#{request.number}</span>
        </p>
        <p className="q-toast-sub" title={request.title}>
          {request.title}
        </p>
        {extraCount > 0 ? (
          <p className="q-toast-sub">
            +{extraCount} more review request{extraCount > 1 ? "s" : ""}
          </p>
        ) : null}
        <div className="q-toast-actions">
          <button
            className="q-toast-open q-focus"
            onClick={onOpen}
            type="button"
          >
            Open <Kbd combo="enter" />
          </button>
          <button
            className="q-toast-snooze q-focus"
            onClick={onDismiss}
            type="button"
          >
            Dismiss
          </button>
        </div>
      </div>
    </dialog>
  );
}
