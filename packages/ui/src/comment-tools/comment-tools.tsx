/**
 * The per-comment tool strip shared by both comment surfaces — inline threads
 * and the drawer conversation — so the own-comment affordances cannot drift
 * apart. Copy is offered on every comment; Edit and Delete appear only when
 * the surface passes their handlers, which is how each surface says "this one
 * is mine". Delete is two-step ("Delete" → "Delete?") and disarms on blur or
 * mouse-leave, so a mis-click never destroys a comment.
 *
 * The tools are icons, and the label and the key live in the tooltip. Printed
 * key chips made the strip read as a sentence running on from the author's
 * name — two grammars in one row, bare verbs beside verb-plus-chips, with the
 * chips brighter than the verbs they belonged to. The keys are also
 * conditional (they fire on the comment under the cursor, not globally), so
 * showing them permanently overstated them. Same call as the dock's tabs.
 *
 * `editKbd` is the key the Edit tooltip names — the thread surface passes it
 * on its last own comment only.
 *
 * The armed delete deliberately breaks the icon rule and spells out "Delete?"
 * in the danger colour: an armed destructive control is the one thing in this
 * strip that must not read as another quiet glyph.
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
import { Check, Copy, Pencil, SendHorizontal, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Tooltip } from "../tooltip/tooltip.tsx";
import "./comment-tools.css";

const ICON = 13;

const COPIED_FEEDBACK_MS = 1200;

export function CommentTools({
  body,
  confirmDelete = true,
  copyKbd,
  deleteKbd,
  deleteLabel,
  editKbd,
  onPostNow,
  onStartEdit,
  onDelete,
  postKbd,
}: {
  body: string;
  /** Posted comments arm before they delete, because the deletion is real and
   *  reaches the host. An unsent draft has nothing to lose that retyping
   *  cannot restore, so it goes on the first click. */
  confirmDelete?: boolean;
  copyKbd?: string;
  deleteKbd?: string;
  /** "Delete" for a posted comment, "Discard" for an unsent one — the same
   *  tool, named for what it actually does to the thing in front of you. */
  deleteLabel?: string;
  editKbd?: string;
  onDelete?: () => void;
  /** Post this one comment immediately, outside the batched review — only a
   *  pending comment offers it. */
  onPostNow?: () => void;
  onStartEdit?: () => void;
  postKbd?: string;
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
    onStartEdit?.();
  };

  const handleDelete = () => {
    if (confirmingDelete || !confirmDelete) {
      setConfirmingDelete(false);
      onDelete?.();
      return;
    }
    setConfirmingDelete(true);
  };

  const disarmDelete = () => {
    setConfirmingDelete(false);
  };

  return (
    <span className="qf-comment-tools">
      <Tooltip
        combo={copied ? undefined : copyKbd}
        label={copied ? "Copied" : "Copy"}
      >
        <button
          aria-label="Copy comment text"
          className="qf-comment-tool q-focus"
          onClick={handleCopy}
          type="button"
        >
          {copied ? (
            <Check aria-hidden size={ICON} />
          ) : (
            <Copy aria-hidden size={ICON} />
          )}
        </button>
      </Tooltip>
      {!!onPostNow && (
        <Tooltip combo={postKbd} label="Comment now">
          <button
            aria-label="Post this comment now"
            className="qf-comment-tool q-focus"
            onClick={onPostNow}
            type="button"
          >
            <SendHorizontal aria-hidden size={ICON} />
          </button>
        </Tooltip>
      )}
      {!!onStartEdit && (
        <Tooltip combo={editKbd} label="Edit">
          <button
            aria-label="Edit comment"
            className="qf-comment-tool q-focus"
            onClick={handleStartEdit}
            type="button"
          >
            <Pencil aria-hidden size={ICON} />
          </button>
        </Tooltip>
      )}
      {onDelete &&
        (confirmingDelete ? (
          <button
            aria-label={`${deleteLabel ?? "Delete"} comment`}
            className="qf-comment-tool qf-comment-tool-armed q-focus"
            onBlur={disarmDelete}
            onClick={handleDelete}
            onMouseLeave={disarmDelete}
            type="button"
          >
            {`${deleteLabel ?? "Delete"}?`}
          </button>
        ) : (
          <Tooltip combo={deleteKbd} label={deleteLabel ?? "Delete"}>
            <button
              aria-label={`${deleteLabel ?? "Delete"} comment`}
              className="qf-comment-tool qf-comment-tool-destructive q-focus"
              onBlur={disarmDelete}
              onClick={handleDelete}
              onMouseLeave={disarmDelete}
              type="button"
            >
              <Trash2 aria-hidden size={ICON} />
            </button>
          </Tooltip>
        ))}
    </span>
  );
}
