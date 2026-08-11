/**
 * Submitting a review: the verdict, an optional summary, and whatever pending
 * inline comments the host is holding. The verdict is a three-way choice
 * rather than a dropdown because it is the decision of the screen, and Tab
 * cycles it from inside the textarea so the whole modal is reachable without
 * leaving the caret.
 *
 * `ownPr` restricts the choice to Comment: the forges reject approving or
 * blocking your own pull request, so the buttons are disabled with the reason
 * on the title rather than the request being sent and failing. Submit stays
 * disabled while a comment review would carry nothing at all — no verdict, no
 * pending comments and an empty summary — and while `busy`, which is what
 * keeps a double ⌘↵ from sending two reviews.
 *
 * `initialEvent`/`initialBody` seed the first paint so every state (each
 * verdict, an empty or an enormous summary) is a fixture instead of a scripted
 * interaction; the host leaves them alone. Esc and the backdrop close through
 * `onOpenChange`, and hosts that also run a global hotkey layer register their
 * own Esc at the call site — this component holds no app state. `inline` opens
 * with show() instead of showModal() (see useModalDialog) and `.qsr-inline`
 * returns the panel to normal flow for embedding hosts; it also skips the
 * initial focus, since an inline specimen would otherwise paint its focus ring
 * into every capture of the summary field.
 */

import { type KeyboardEvent, useRef, useState } from "react";
import { Button } from "../button/button.tsx";
import { cn } from "../cn/cn.ts";
import { useModalDialog } from "../use-modal-dialog/use-modal-dialog.ts";
import "./submit-review-modal.css";

export type ReviewEvent = "APPROVE" | "COMMENT" | "REQUEST_CHANGES";

const EVENTS: { value: ReviewEvent; label: string; hint: string }[] = [
  {
    hint: "General feedback without an explicit verdict.",
    label: "Comment",
    value: "COMMENT",
  },
  { hint: "Approve these changes.", label: "Approve", value: "APPROVE" },
  {
    hint: "Block until changes are made.",
    label: "Request changes",
    value: "REQUEST_CHANGES",
  },
];

const PLACEHOLDERS: Record<ReviewEvent, string> = {
  APPROVE: "Optional approval note…",
  COMMENT: "Review summary…",
  REQUEST_CHANGES: "What needs to change?",
};

interface Props {
  busy: boolean;
  error?: string | null;
  initialBody?: string;
  initialEvent?: ReviewEvent;
  inline?: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (event: ReviewEvent, body: string) => void;
  open: boolean;
  ownPr?: boolean;
  pendingCount: number;
}

export function SubmitReviewModal({
  open,
  ownPr = false,
  pendingCount,
  busy,
  error,
  initialBody = "",
  initialEvent = "COMMENT",
  inline = false,
  onOpenChange,
  onSubmit,
}: Props) {
  if (!open) {
    return null;
  }
  return (
    <SubmitReviewModalContent
      busy={busy}
      error={error}
      initialBody={initialBody}
      initialEvent={initialEvent}
      inline={inline}
      onOpenChange={onOpenChange}
      onSubmit={onSubmit}
      ownPr={ownPr}
      pendingCount={pendingCount}
    />
  );
}

function SubmitReviewModalContent({
  ownPr,
  pendingCount,
  busy,
  error,
  initialBody,
  initialEvent,
  inline,
  onOpenChange,
  onSubmit,
}: Omit<Props, "open">) {
  const [event, setEvent] = useState<ReviewEvent>(initialEvent ?? "COMMENT");
  const [body, setBody] = useState(initialBody ?? "");
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const close = () => {
    onOpenChange(false);
  };
  const { dialogRef, onDialogCancel, onDialogClose } = useModalDialog(
    close,
    inline ? undefined : bodyRef,
    { modal: !inline }
  );

  const disabledEvent = (value: ReviewEvent) => ownPr && value !== "COMMENT";

  const cycleEvent = (dir: number) => {
    setEvent((cur) => {
      let i = EVENTS.findIndex((ev) => ev.value === cur);
      for (const _ev of EVENTS) {
        i = (i + dir + EVENTS.length) % EVENTS.length;
        if (!disabledEvent(EVENTS[i].value)) {
          return EVENTS[i].value;
        }
      }
      return cur;
    });
  };

  const needsBody = event === "COMMENT" && pendingCount === 0;
  const canSubmit = !busy && (!needsBody || body.trim().length > 0);

  const submit = () => {
    if (!canSubmit) {
      return;
    }
    onSubmit(event, body.trim());
  };

  const handleBodyChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setBody(e.target.value);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      submit();
    } else if (e.key === "Tab") {
      e.preventDefault();
      cycleEvent(e.shiftKey ? -1 : 1);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };

  const handleSelectEvent = (value: ReviewEvent) => () => {
    if (!disabledEvent(value)) {
      setEvent(value);
    }
  };

  const placeholder = PLACEHOLDERS[event];

  return (
    <dialog
      aria-label="Submit review"
      className={cn("q-dialog q-dialog-top qsr-panel", inline && "qsr-inline")}
      onCancel={onDialogCancel}
      onClose={onDialogClose}
      ref={dialogRef}
    >
      <div className="qsr-head">
        <h2 className="qsr-title">Submit review</h2>
        <p className="qsr-sub">
          {pendingCount > 0
            ? `${pendingCount} pending comment${pendingCount === 1 ? "" : "s"} will be included.`
            : "No pending comments. Submits the verdict and summary only."}
        </p>
      </div>

      <div className="qsr-body">
        {!!ownPr && (
          <p className="qsr-note">
            This is your own PR. Only a comment review can be submitted.
          </p>
        )}
        <div className="qsr-verdicts">
          {EVENTS.map((opt) => {
            const disabled = disabledEvent(opt.value);
            return (
              <button
                className={cn(
                  "qsr-verdict q-focus",
                  event === opt.value && "qsr-verdict-on"
                )}
                disabled={disabled}
                key={opt.value}
                onClick={handleSelectEvent(opt.value)}
                title={
                  disabled
                    ? "You can't approve or request changes on your own PR"
                    : opt.hint
                }
                type="button"
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        <textarea
          aria-label="Review summary"
          className="qsr-input"
          onChange={handleBodyChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          ref={bodyRef}
          rows={4}
          value={body}
        />

        {error ? <p className="qsr-error">{error}</p> : null}
      </div>

      <div className="qsr-foot">
        <span className="qsr-hint">
          Tab switches verdict · ⌘↵ to submit · Esc to cancel
        </span>
        <div className="qsr-actions">
          <Button onClick={close} variant="ghost">
            Cancel
          </Button>
          <Button
            busy={busy}
            disabled={!canSubmit}
            onClick={submit}
            variant="primary"
          >
            {busy ? "Submitting…" : "Submit review"}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
