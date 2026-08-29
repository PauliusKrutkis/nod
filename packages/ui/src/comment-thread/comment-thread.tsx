/**
 * An inline code thread: a root comment, its replies, and the fold/resolve
 * affordances around them. A resolved thread arrives collapsed to one line;
 * `z` toggles it, and re-resolving from elsewhere re-collapses it, which is
 * what the wasResolved mirror is for.
 *
 * The three *Request props are keyboard commands addressed to one thread by
 * root id and made idempotent by a nonce — the surface owning the hotkeys is
 * far above this component, and a re-render must not replay the last one.
 * `shift+e` always edits your last comment in the thread — even one buried
 * under someone else's reply — but its hint chip only shows when that comment
 * is also the thread's last word, since otherwise the chip would misleadingly
 * suggest it's still the next thing you'd act on. While any composer is open
 * every comment hides its tools: those hotkeys (`r`/`x`/`z`/`shift+e`) are
 * inert while a text input has focus, so showing them would advertise dead
 * shortcuts.
 *
 * Two host seams keep the thread renderable from a fixture. `composer` is
 * asked for the editor that replies and edits use — a rich text editor the
 * package does not own — and a thread without one simply never opens it:
 * Reply and Edit render but stay inert, rather than swapping the card into a
 * composer state nothing can fill or leave.
 * `renderMarkdown` is the body renderer, passed through to each comment.
 * `ownLogin` decides which comments are yours, so the account lookup stays
 * with the surface that has the store.
 */

import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  MessageSquare,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { cn } from "../cn/cn.ts";
import { CommentItem } from "../comment-item/comment-item.tsx";
import { Kbd } from "../kbd/kbd.tsx";
import "./comment-thread.css";

export interface ThreadComment {
  body: string;
  createdAt: string;
  id: number;
  resolved?: boolean;
  threadId?: string | null;
  user: string;
  userAvatarUrl?: string;
}

export interface ReplyRequest {
  nonce: number;
  rootId: number;
}

export interface ToggleRequest {
  nonce: number;
  rootId: number;
}

export interface EditRequest {
  nonce: number;
  rootId: number;
}

export interface ThreadComposerProps {
  initialMarkdown?: string;
  onCancel: () => void;
  onSubmit: (body: string) => void;
  pending: boolean;
  placeholder: string;
  submitLabel: string;
}

export interface CommentThreadProps {
  comments: ThreadComment[];
  composer?: (props: ThreadComposerProps) => ReactNode;
  editRequest?: EditRequest | null;
  onDelete?: (a: { commentId: number }) => Promise<void>;
  onEdit?: (a: { commentId: number; body: string }) => Promise<void>;
  onHoverChange?: (hovering: boolean) => void;
  onReply: (a: { inReplyTo: number; body: string }) => Promise<void>;
  onResolve?: (a: { threadId: string; resolved: boolean }) => void;
  ownLogin?: string;
  renderMarkdown?: (body: string) => ReactNode;
  replyPending: boolean;
  replyRequest?: ReplyRequest | null;
  toggleRequest?: ToggleRequest | null;
}

/** The first line of a comment body — the snippet a folded thread shows. */
function firstLine(body: string): string {
  return body.trim().split("\n")[0] ?? "";
}

function applyCommand(
  request: { nonce: number; rootId: number } | null | undefined,
  rootId: number | undefined,
  lastNonce: number,
  setLastNonce: (nonce: number) => void,
  apply: () => void
): void {
  if (!request || request.rootId !== rootId || request.nonce === lastNonce) {
    return;
  }
  setLastNonce(request.nonce);
  apply();
}

export function CommentThread({
  comments,
  composer,
  onReply,
  replyPending,
  onResolve,
  onEdit,
  onDelete,
  onHoverChange,
  ownLogin,
  renderMarkdown,
  replyRequest,
  toggleRequest,
  editRequest,
}: CommentThreadProps) {
  const [root] = comments;
  const rootId = root?.id;
  const threadId = root?.threadId ?? null;
  const resolved = root?.resolved ?? false;
  const ownComments = comments.filter((c) => c.user === ownLogin);
  const lastOwnId = ownComments.at(-1)?.id;
  const editKbdId =
    lastOwnId !== undefined && lastOwnId === comments.at(-1)?.id
      ? lastOwnId
      : undefined;

  const [replying, setReplying] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState(resolved);
  const [wasResolved, setWasResolved] = useState(resolved);
  const [lastReplyNonce, setLastReplyNonce] = useState(0);
  const [lastToggleNonce, setLastToggleNonce] = useState(0);
  const [lastEditNonce, setLastEditNonce] = useState(0);
  const composerOpen = replying || editingId !== null;

  if (wasResolved !== resolved) {
    setWasResolved(resolved);
    setCollapsed(resolved);
    setReplying(false);
    setEditingId(null);
  }

  applyCommand(replyRequest, rootId, lastReplyNonce, setLastReplyNonce, () => {
    if (!composer) {
      return;
    }
    setCollapsed(false);
    setReplying(true);
    setEditingId(null);
  });
  applyCommand(
    toggleRequest,
    rootId,
    lastToggleNonce,
    setLastToggleNonce,
    () => {
      setCollapsed((v) => !v);
      setReplying(false);
      setEditingId(null);
    }
  );
  applyCommand(editRequest, rootId, lastEditNonce, setLastEditNonce, () => {
    if (lastOwnId === undefined || !onEdit || !composer) {
      return;
    }
    setCollapsed(false);
    setReplying(false);
    setEditingId(lastOwnId);
  });

  const submitReply = (body: string) => {
    if (rootId !== undefined) {
      onReply({ body, inReplyTo: rootId });
    }
    setReplying(false);
  };

  const submitEdit = (body: string) => {
    if (editingId !== null) {
      onEdit?.({ body, commentId: editingId })?.catch(() => undefined);
    }
    setEditingId(null);
  };

  const handleStartEdit = (commentId: number) => {
    if (!composer) {
      return;
    }
    setEditingId(commentId);
    setReplying(false);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
  };

  const handleDelete = (commentId: number) => {
    onDelete?.({ commentId })?.catch(() => undefined);
  };

  const expand = () => {
    setCollapsed(false);
  };

  const collapse = () => {
    setCollapsed(true);
    setReplying(false);
  };

  const handleCancelReply = () => {
    setReplying(false);
  };

  const handleStartReply = () => {
    if (!composer) {
      return;
    }
    setReplying(true);
  };

  const handleResolve = () => {
    if (threadId !== null && onResolve) {
      onResolve({ resolved: !resolved, threadId });
    }
  };

  if (comments.length === 0 || !root) {
    return null;
  }

  const hoverProps = {
    onMouseEnter: () => onHoverChange?.(true),
    onMouseLeave: () => onHoverChange?.(false),
  };

  if (collapsed) {
    const canResolve = threadId !== null && !!onResolve;
    return (
      <div
        className={cn(
          "qf-thread qf-thread-collapsed",
          !resolved && "qf-thread-collapsed-open"
        )}
        data-comment-root={rootId}
        {...hoverProps}
      >
        <button
          className="qf-thread-collapsed-lead q-focus"
          onClick={expand}
          title="Expand (z)"
          type="button"
        >
          {resolved ? (
            <CheckCircle2 aria-hidden size={13} />
          ) : (
            <MessageSquare aria-hidden size={13} />
          )}
          {!!resolved && <span className="qf-resolved-tag">Resolved</span>}
          <span className="qf-resolved-snip">
            {root.user} · {firstLine(root.body)}
          </span>
        </button>
        <div className="qf-thread-collapsed-actions">
          {resolved && canResolve && (
            <button
              className="qf-thread-fold q-focus"
              onClick={handleResolve}
              type="button"
            >
              Unresolve
              <span aria-hidden className="qf-key-hint">
                <Kbd combo="x" />
              </span>
            </button>
          )}
          <button
            aria-label="Expand thread"
            className="qf-thread-fold q-focus"
            onClick={expand}
            title="Expand (z)"
            type="button"
          >
            <ChevronDown aria-hidden size={11} />
            Expand
            <span aria-hidden className="qf-key-hint">
              <Kbd combo="z" />
            </span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="qf-thread qf-thread-expanded"
      data-comment-root={rootId}
      {...hoverProps}
    >
      <button
        aria-label="Collapse thread"
        className="qf-thread-fold qf-thread-fold-corner q-focus"
        onClick={collapse}
        title="Collapse (z)"
        type="button"
      >
        <ChevronUp aria-hidden size={11} />
        Collapse
        <span aria-hidden className="qf-key-hint">
          <Kbd combo="z" />
        </span>
      </button>
      {!!resolved && (
        <div className="qf-thread-resolved-bar">
          <CheckCircle2 aria-hidden size={13} />
          <span className="qf-resolved-tag">Resolved</span>
        </div>
      )}
      {comments.map((c, i) => (
        <CommentItem
          body={c.body}
          composer={
            editingId === c.id
              ? composer?.({
                  initialMarkdown: c.body,
                  onCancel: handleCancelEdit,
                  onSubmit: submitEdit,
                  pending: false,
                  placeholder: "Edit your comment…",
                  submitLabel: "Save",
                })
              : undefined
          }
          createdAt={c.createdAt}
          editKbd={c.id === editKbdId ? "shift+e" : undefined}
          key={c.id}
          onDelete={
            c.user === ownLogin && onDelete
              ? () => handleDelete(c.id)
              : undefined
          }
          onStartEdit={
            c.user === ownLogin && onEdit
              ? () => handleStartEdit(c.id)
              : undefined
          }
          renderMarkdown={renderMarkdown}
          reply={i > 0}
          tools={!composerOpen}
          user={c.user}
          userAvatarUrl={c.userAvatarUrl}
        />
      ))}
      {replying ? (
        <div className="qf-comment qf-comment-reply">
          {composer?.({
            onCancel: handleCancelReply,
            onSubmit: submitReply,
            pending: replyPending,
            placeholder: "Reply…",
            submitLabel: "Reply",
          })}
        </div>
      ) : (
        <div className="qf-thread-actions">
          <button
            className="qf-reply-btn q-focus"
            onClick={handleStartReply}
            type="button"
          >
            Reply
            <span aria-hidden className="qf-key-hint">
              <Kbd combo="r" />
            </span>
          </button>
          {threadId !== null && onResolve && (
            <button
              className="qf-reply-btn qf-resolve-btn q-focus"
              onClick={handleResolve}
              type="button"
            >
              {resolved ? "Unresolve" : "Resolve"}
              <span aria-hidden className="qf-key-hint">
                <Kbd combo="x" />
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
