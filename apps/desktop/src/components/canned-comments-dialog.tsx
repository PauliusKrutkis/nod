import { Button } from "@nod/ui/button";
import { Kbd } from "@nod/ui/kbd";
import { useArmedRing } from "@nod/ui/use-armed-ring";
import { useModalDialog } from "@nod/ui/use-modal-dialog";
import { MessageSquareQuote, X } from "lucide-react";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { useHotkeys } from "../keyboard/use-hotkeys.ts";
import {
  hasOpenComposer,
  insertCannedComment,
  loadCannedComments,
  saveCannedComments,
} from "../lib/canned-comments.ts";
import { cn } from "../lib/cn.ts";

type Armed = number | "done" | null;

function enterActionLabel(ctx: {
  armed: Armed;
  canInsert: boolean;
  draft: string;
}): string {
  if (ctx.armed === "done") {
    return "close";
  }
  if (typeof ctx.armed === "number") {
    return "delete";
  }
  if (ctx.draft.trim()) {
    return "add";
  }
  return ctx.canInsert ? "insert" : "add";
}

function handleCannedKey(
  e: KeyboardEvent,
  ctx: {
    confirm: () => void;
    count: number;
    cycleArmed: (dir: 1 | -1) => void;
    onClose: () => void;
    setArmed: (value: Armed) => void;
    setSel: React.Dispatch<React.SetStateAction<number>>;
  }
) {
  if (e.key === "Tab") {
    e.preventDefault();
    ctx.cycleArmed(e.shiftKey ? -1 : 1);
    return;
  }
  if (e.key === "ArrowDown") {
    e.preventDefault();
    ctx.setArmed(null);
    ctx.setSel((s) => Math.min(s + 1, ctx.count - 1));
    return;
  }
  if (e.key === "ArrowUp") {
    e.preventDefault();
    ctx.setArmed(null);
    ctx.setSel((s) => Math.max(s - 1, 0));
    return;
  }
  if (e.key === "Enter") {
    e.preventDefault();
    ctx.confirm();
    return;
  }
  if (e.key === "Escape") {
    e.preventDefault();
    ctx.onClose();
  }
}

/**
 * The canned-comment picker and its editor, in one dialog: ⌘; opens it, the
 * arrows walk the list, Enter drops the highlighted line into the comment box
 * you were last writing in. Typing turns Enter into "add" so the list grows
 * from the same field, and Tab arms each row for deletion the way the watched
 * repos dialog arms its rows, keeping DOM focus in the input throughout.
 * Whether a composer is on screen is read once when the dialog opens: focus is
 * trapped in here afterwards, so it cannot change while the dialog is up.
 */
export function CannedCommentsDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  if (!open) {
    return null;
  }
  return <CannedCommentsDialogContent onClose={onClose} />;
}

function CannedCommentsDialogContent({ onClose }: { onClose: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { dialogRef, onDialogCancel, onDialogClose } = useModalDialog(
    onClose,
    inputRef
  );
  const [list, setList] = useState(loadCannedComments);
  const [draft, setDraft] = useState("");
  const [sel, setSel] = useState(0);
  const [canInsert] = useState(hasOpenComposer);
  const armOrder: Armed[] = [null, ...list.map((_, i) => i), "done"];
  const { armed, cycle, setArmed } = useArmedRing<Armed>(armOrder, null);

  const commit = (next: string[]) => {
    setList(next);
    saveCannedComments(next);
  };

  const add = () => {
    const text = draft.trim();
    if (!text) {
      return;
    }
    const next = list.includes(text) ? list : [...list, text];
    commit(next);
    setDraft("");
    setSel(next.length - 1);
    setArmed(null);
  };

  const remove = (index: number) => {
    const next = list.filter((_, i) => i !== index);
    commit(next);
    setArmed(next.length === 0 ? null : Math.min(index, next.length - 1));
    setSel((s) => Math.min(s, Math.max(next.length - 1, 0)));
    inputRef.current?.focus();
  };

  const insertAt = (index: number) => {
    const text = list[index];
    if (!(text && insertCannedComment(text))) {
      return;
    }
    onClose();
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
    if (draft.trim()) {
      add();
      return;
    }
    insertAt(sel);
  };

  const onDraftChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDraft(e.target.value);
    setArmed(null);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    handleCannedKey(e, {
      confirm,
      count: list.length,
      cycleArmed: cycle,
      onClose,
      setArmed,
      setSel,
    });
  };

  useEffect(() => {
    const cursor = typeof armed === "number" ? armed : sel;
    listRef.current
      ?.querySelector(`[data-index="${cursor}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [sel, armed]);

  useHotkeys(
    "canned-comments",
    [{ description: "Close", hidden: true, keys: "esc", run: onClose }],
    { enabled: true }
  );

  return (
    <dialog
      aria-label="Canned comments"
      className="q-dialog q-dialog-top qn-panel"
      onCancel={onDialogCancel}
      onClose={onDialogClose}
      ref={dialogRef}
    >
      <div className="border-line border-b px-5 py-3.5">
        <h2 className="flex items-center gap-2 font-semibold text-fg text-sm">
          <MessageSquareQuote aria-hidden className="text-accent" size={14} />
          Canned comments
        </h2>
        <p className="mt-0.5 text-muted text-xs">
          The lines you type on every review. Plain text, kept on this machine,
          the same in every repository.
        </p>
      </div>

      <div className="px-5 py-4">
        <input
          aria-label="Add a canned comment"
          autoComplete="off"
          className="q-input"
          onChange={onDraftChange}
          onKeyDown={onKeyDown}
          placeholder="Add a canned comment…"
          ref={inputRef}
          spellCheck={false}
          value={draft}
        />

        <div
          className="mt-3 flex max-h-72 flex-col gap-1 overflow-y-auto"
          ref={listRef}
        >
          {list.length === 0 ? (
            <p className="py-4 text-center text-faint text-xs">
              Nothing saved yet. Type a line above and press Enter.
            </p>
          ) : (
            list.map((text, i) => (
              <CannedRow
                armed={armed === i}
                canInsert={canInsert}
                cursor={armed === i || (armed === null && sel === i)}
                index={i}
                key={text}
                onInsert={insertAt}
                onRemove={remove}
                text={text}
              />
            ))
          )}
        </div>

        {canInsert ? null : (
          <p className="mt-3 text-faint text-xs">
            No comment box is open, so there is nothing to insert into. You can
            still edit the list here.
          </p>
        )}
      </div>

      <div className="flex items-center justify-between border-line border-t px-5 py-3">
        <span className="text-faint text-xs">
          <Kbd combo="up" />
          <Kbd combo="down" /> pick · <Kbd combo="enter" />{" "}
          {enterActionLabel({ armed, canInsert, draft })} · <Kbd combo="tab" />{" "}
          actions · <Kbd combo="esc" /> done
        </span>
        <Button
          className={cn(armed === "done" && "qn-done-armed")}
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
  cursor,
  canInsert,
  onInsert,
  onRemove,
}: {
  armed: boolean;
  canInsert: boolean;
  cursor: boolean;
  index: number;
  onInsert: (index: number) => void;
  onRemove: (index: number) => void;
  text: string;
}) {
  const handleInsert = () => {
    onInsert(index);
  };

  const handleRemove = () => {
    onRemove(index);
  };

  return (
    <div
      className={cn(
        "qn-row",
        cursor && !armed && "qn-row-on",
        armed && "qn-row-armed"
      )}
      data-armed={armed}
      data-index={index}
    >
      <button
        className="qn-pick"
        disabled={!canInsert}
        onClick={handleInsert}
        tabIndex={-1}
        type="button"
      >
        {text}
      </button>
      <button
        aria-label={`Delete “${text}”`}
        className="qb-x"
        onClick={handleRemove}
        tabIndex={-1}
        type="button"
      >
        <X aria-hidden size={13} />
      </button>
    </div>
  );
}
