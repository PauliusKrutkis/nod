/**
 * Manage the canned comments the composer completes from. This is the list's
 * only editing surface — the lines themselves are offered inline while typing
 * (see canned-suggestions), so nothing here inserts anything into a comment;
 * opening this dialog means the reviewer came to change the list, not to use
 * it.
 *
 * Keyboard: focus stays in the input the whole time, so every control is
 * tabIndex -1. Typing and Enter add a line; Tab arms each saved row (then
 * Done) so Enter removes it, and the footer names what Enter would do right
 * now. Adding a line the list already holds is a no-op rather than a
 * duplicate — the composer would offer the same text twice, and the reviewer
 * cannot tell the two rows apart.
 *
 * `comments` is the host's, because storage is: this renders the list it is
 * given and reports edits, so the same dialog shoots at every state without a
 * storage layer behind it.
 *
 * `inline` opens with show() instead of showModal() (see useModalDialog) and
 * `.qcd-inline` returns the panel to normal flow, which is how the gallery
 * embeds it. Without it the specimen went to the top layer and covered the
 * catalog it was supposed to sit inside.
 *
 * Closing is `onOpenChange(false)`, the contract every other dialog in the
 * catalog already spoke. This one took an `onClose` of its own, so any host
 * that drives dialogs generically — the gallery's "Open as modal" among them
 * — held a panel it had no way to close.
 */
import { MessageSquareQuote, X } from "lucide-react";
import { type KeyboardEvent, useRef, useState } from "react";
import { Button } from "../button/button.tsx";
import { cn } from "../cn/cn.ts";
import { Kbd } from "../kbd/kbd.tsx";
import { useArmedRing } from "../use-armed-ring/use-armed-ring.ts";
import { useModalDialog } from "../use-modal-dialog/use-modal-dialog.ts";
import "./canned-comments-dialog.css";

export interface CannedCommentsDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  comments: string[];
  onAdd: (text: string) => void;
  onRemove: (index: number) => void;
  inline?: boolean;
}

export function CannedCommentsDialog({
  open,
  ...rest
}: CannedCommentsDialogProps) {
  if (!open) {
    return null;
  }
  return <CannedCommentsDialogContent {...rest} />;
}

type Armed = number | "done" | null;

function enterActionLabel(armed: Armed, draft: string): string {
  if (armed === "done") {
    return "close";
  }
  if (typeof armed === "number") {
    return "delete";
  }
  return draft.trim() ? "add" : "nothing yet";
}

function CannedCommentsDialogContent({
  comments,
  onAdd,
  onRemove,
  onOpenChange,
  inline = false,
}: Omit<CannedCommentsDialogProps, "open">) {
  const inputRef = useRef<HTMLInputElement>(null);
  const onClose = () => {
    onOpenChange(false);
  };
  const { dialogRef, onDialogCancel, onDialogClose } = useModalDialog(
    onClose,
    inline ? undefined : inputRef,
    { modal: !inline }
  );
  const [draft, setDraft] = useState("");
  const armOrder: Armed[] = [null, ...comments.map((_, i) => i), "done"];
  const { armed, cycle, setArmed } = useArmedRing<Armed>(armOrder, null);

  const add = () => {
    const text = draft.trim();
    if (!text) {
      return;
    }
    setDraft("");
    setArmed(null);
    if (!comments.includes(text)) {
      onAdd(text);
    }
  };

  const remove = (index: number) => {
    onRemove(index);
    setArmed(null);
    inputRef.current?.focus();
  };

  const confirm = () => {
    if (armed === "done") {
      onClose();
      return;
    }
    if (typeof armed === "number") {
      remove(armed);
      return;
    }
    add();
  };

  const onDraftChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDraft(e.target.value);
    setArmed(null);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Tab") {
      e.preventDefault();
      cycle(e.shiftKey ? -1 : 1);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      confirm();
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <dialog
      aria-label="Canned comments"
      className={cn("q-dialog q-dialog-top qcd-panel", inline && "qcd-inline")}
      onCancel={onDialogCancel}
      onClose={onDialogClose}
      ref={dialogRef}
    >
      <div className="qcd-head">
        <h2 className="qcd-title">
          <MessageSquareQuote aria-hidden className="qcd-icon" size={14} />
          Canned comments
        </h2>
        <p className="qcd-sub">
          Type the opening of one in any comment box and the rest is offered.
          Plain text, kept on this machine, the same in every repository.
        </p>
      </div>

      <div className="qcd-body">
        <input
          aria-label="Add a canned comment"
          autoComplete="off"
          className="qcd-input"
          onChange={onDraftChange}
          onKeyDown={onKeyDown}
          placeholder="Add a canned comment…"
          ref={inputRef}
          spellCheck={false}
          value={draft}
        />

        <div className="qcd-list">
          {comments.length === 0 ? (
            <p className="qcd-none">
              Nothing saved yet. Type a line above and press Enter.
            </p>
          ) : (
            comments.map((text, i) => (
              <CannedRow
                armed={armed === i}
                index={i}
                key={text}
                onRemove={remove}
                text={text}
              />
            ))
          )}
        </div>
      </div>

      <div className="qcd-foot">
        <span className="qcd-keys">
          <Kbd combo="enter" /> {enterActionLabel(armed, draft)} ·{" "}
          <Kbd combo="tab" /> actions · <Kbd combo="esc" /> done
        </span>
        <Button
          className={cn(armed === "done" && "qcd-done-armed")}
          data-armed={armed === "done"}
          onClick={onClose}
          tabIndex={-1}
        >
          Done
        </Button>
      </div>
    </dialog>
  );
}

function CannedRow({
  text,
  index,
  armed,
  onRemove,
}: {
  armed: boolean;
  index: number;
  onRemove: (index: number) => void;
  text: string;
}) {
  const handleRemove = () => {
    onRemove(index);
  };

  return (
    <div className={cn("qcd-row", armed && "qcd-row-armed")} data-armed={armed}>
      <span className="qcd-text">{text}</span>
      <button
        aria-label={`Delete “${text}”`}
        className="qcd-x"
        onClick={handleRemove}
        tabIndex={-1}
        type="button"
      >
        <X aria-hidden size={13} />
      </button>
    </div>
  );
}
