/**
 * The per-comment tool strip shared by both comment surfaces — inline threads
 * and the drawer conversation — so the own-comment affordances cannot drift
 * apart. Copy is offered on every comment; Edit and Delete appear only when
 * the surface passes their handlers, which is how each surface says "this one
 * is mine". Delete is two-step ("Delete" → "Delete?") and disarms on blur or
 * mouse-leave, so a mis-click never destroys a comment.
 *
 * `editKbd` is the hotkey chip shown on Edit — the thread surface passes it on
 * its last own comment only.
 *
 * The clipboard write is fire-and-forget: the strip shows its own "Copied"
 * feedback, so a rejected promise (permission denied, or no API at all) must
 * not surface as an unhandled rejection.
 *
 * The strip is invisible at rest in the app — the surfaces reveal it on hover
 * and focus-within from their own stylesheet, since the ancestor doing the
 * revealing lives there. Here it renders visible, which is what a specimen of
 * the strip should show.
 */
import { useEffect, useRef, useState } from "react";
import { cn } from "../cn/cn.ts";
import { Kbd } from "../kbd/kbd.tsx";
import "./comment-tools.css";

const COPIED_FEEDBACK_MS = 1200;

export function CommentTools({
  body,
  commentId,
  editKbd,
  onStartEdit,
  onDelete,
}: {
  body: string;
  commentId: number;
  editKbd?: string;
  onDelete?: (commentId: number) => void;
  onStartEdit?: (commentId: number) => void;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
      }
    },
    []
  );

  const handleCopy = () => {
    setConfirmingDelete(false);
    navigator.clipboard?.writeText(body).catch(() => undefined);
    setCopied(true);
    if (copyTimerRef.current) {
      clearTimeout(copyTimerRef.current);
    }
    copyTimerRef.current = setTimeout(
      () => setCopied(false),
      COPIED_FEEDBACK_MS
    );
  };

  const handleStartEdit = () => {
    setConfirmingDelete(false);
    onStartEdit?.(commentId);
  };

  const handleDelete = () => {
    if (confirmingDelete) {
      setConfirmingDelete(false);
      onDelete?.(commentId);
    } else {
      setConfirmingDelete(true);
    }
  };

  const disarmDelete = () => {
    setConfirmingDelete(false);
  };

  return (
    <span className="qf-comment-tools">
      <button
        aria-label="Copy comment text"
        className="qf-comment-tool q-focus"
        onClick={handleCopy}
        type="button"
      >
        {copied ? "Copied" : "Copy"}
      </button>
      {!!onStartEdit && (
        <button
          aria-label="Edit comment"
          className="qf-comment-tool q-focus"
          onClick={handleStartEdit}
          type="button"
        >
          Edit
          {editKbd !== undefined && (
            <span aria-hidden className="qf-key-hint">
              <Kbd combo={editKbd} />
            </span>
          )}
        </button>
      )}
      {!!onDelete && (
        <button
          aria-label="Delete comment"
          className={cn(
            "qf-comment-tool q-focus",
            confirmingDelete && "qf-comment-tool-danger"
          )}
          onBlur={disarmDelete}
          onClick={handleDelete}
          onMouseLeave={disarmDelete}
          type="button"
        >
          {confirmingDelete ? "Delete?" : "Delete"}
        </button>
      )}
    </span>
  );
}
