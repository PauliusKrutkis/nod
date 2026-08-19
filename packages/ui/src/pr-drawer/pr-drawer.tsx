/**
 * The PR detail drawer (toggled with `i`, Esc closes): pr-summary at the top,
 * the description, the complete conversation (PR-level comments merged with
 * review verdicts), thread-index for the inline code threads, and a composer
 * that expands from a one-line prompt (Esc backs out of the composer first,
 * then the drawer). Comments post optimistically — the composer never blocks.
 *
 * Your own conversation comments (never verdicts) carry the same quiet
 * Edit/Delete tools as inline threads, with the in-place "Delete?" confirm;
 * an optimistic comment (negative id) is not editable until the server
 * assigns it a real one. The composer starts as a one-line prompt and
 * expands on intent; it stays mounted (hidden) while collapsed so a
 * half-typed draft survives Esc — "drafts are never lost" (DESIGN.md) — and
 * the prompt advertises the draft. `initialDraft` seeds that surviving text
 * for a host that restores drafts (and for fixtures, which cannot type). It
 * docks as the drawer's footer: always reachable without scrolling, and the
 * expanded editor (with its submit row) is on-screen by construction. The
 * footer's divider only appears once the body scrolls, which is measured by
 * observing the body *and its sections* — the body's own box is pinned by
 * the drawer, so growing conversation only ever resizes a section. Posting
 * arms a one-shot reveal: the ref on the timeline's newest row fires when
 * the optimistic comment mounts and scrolls it into view, so the comment
 * you just wrote is never left below the fold. The scroll is instant (this
 * is a reading surface, not an animated one) and the arm is consumed by
 * that first mount, so a background refetch or your own later scrolling is
 * never yanked back.
 *
 * Host seams, in comment-thread's mold. `renderMarkdown` renders every body
 * (description, comments, verdicts); omit it and the package's Markdown
 * renders the string, which is what fixtures do. `composer` is asked for the
 * editor the footer and in-place edits use, and defaults to the package's
 * own AddCommentBox; the slot exists for hosts that wrap the editor (extra
 * extensions, upload wiring). Every imperative reach — mutations, openers,
 * close/widen, jump-to-thread — arrives on the `callbacks` object, so no
 * Tauri touches this side. `ownLogin` decides which comments are yours and
 * `trackerBase` linkifies ticket ids, both store reads the host keeps.
 *
 * Opening moves focus onto the panel so Esc lands here; closing blurs
 * anything left inside and asks the host, via `callbacks.onFocusExit`, to
 * seat focus back on its own surface. `embedded` renders the panel in
 * normal flow without the scrim and skips that focus traffic — it exists
 * for hosts with no positioned frame to dock into (the gallery), where the
 * drawer is a specimen rather than an overlay.
 *
 * `frameless` strips the frame entirely — no scrim, no aside, no head, no
 * focus traffic — and renders just the body and docked footer, for a host
 * that seats this content behind its own chrome (the right-dock's Info tab).
 * The wrapper stays focusable so collapsing the composer still parks focus
 * somewhere Esc can act on.
 */

import { PanelRightClose, PanelRightOpen } from "lucide-react";
import {
  type ReactNode,
  type Ref,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { AddCommentBox } from "../add-comment-box/add-comment-box.tsx";
import { Avatar } from "../avatar/avatar.tsx";
import type { CiStatus } from "../ci-pill/ci-pill.tsx";
import { cn } from "../cn/cn.ts";
import { CommentBody } from "../comment-item/comment-item.tsx";
import { CommentTools } from "../comment-tools/comment-tools.tsx";
import { Kbd } from "../kbd/kbd.tsx";
import { Markdown } from "../markdown/markdown.tsx";
import {
  PrSummary,
  type SummaryPullRequest,
} from "../pr-summary/pr-summary.tsx";
import {
  ThreadIndex,
  type ThreadIndexRow,
} from "../thread-index/thread-index.tsx";
import { formatAbsolute, formatRelativeTime } from "../time/time.ts";
import { Tooltip } from "../tooltip/tooltip.tsx";
import { useLatest } from "../use-latest/use-latest.ts";
import "../badge/badge.css";
import "./pr-drawer.css";

export interface PrDrawerHandle {
  openComposer: () => void;
}

export interface DrawerPullRequest extends SummaryPullRequest {
  body: string;
}

export interface DrawerComment {
  body: string;
  createdAt: string;
  id: number;
  user: string;
  userAvatarUrl: string;
}

export interface DrawerReview {
  body: string;
  id: number;
  state: string;
  submittedAt: string;
  user: string;
  userAvatarUrl: string;
}

export interface DrawerInlineComment {
  body: string;
  id: number;
  inReplyToId: number | null;
  line: number | null;
  path: string;
  resolved: boolean;
}

export interface PrDrawerCallbacks {
  onAddComment: (body: string) => Promise<void>;
  onClose: () => void;
  onDeleteComment: (a: { commentId: number }) => Promise<void>;
  onEditComment: (a: { commentId: number; body: string }) => Promise<void>;
  onFocusExit?: () => void;
  onJumpToThread: (path: string, rootId: number) => void;
  onOpenCiUrl: (url: string) => void;
  /** When the host seats a Checks tab beside this one, the CI pill switches
   *  to it instead of leaving the app; absent, the pill opens the host's
   *  checks page as it always did. */
  onShowChecks?: () => void;
  onOpenPr: () => void;
  onOpenTicket: (url: string) => void;
  /** Only the drawer's own (non-frameless) head shows the widen button. */
  onToggleWide?: () => void;
}

export interface DrawerComposerHandle {
  focus: () => void;
}

export interface DrawerComposerProps {
  autoFocus: boolean;
  initialMarkdown?: string;
  onCancel: () => void;
  onEmptyChange?: (empty: boolean) => void;
  onSubmit: (body: string) => void;
  pending: boolean;
  placeholder: string;
  ref?: Ref<DrawerComposerHandle>;
  submitLabel: string;
}

export interface PrDrawerProps {
  addCommentPending: boolean;
  callbacks: PrDrawerCallbacks;
  ci?: CiStatus;
  composer?: (props: DrawerComposerProps) => ReactNode;
  conversation: DrawerComment[];
  embedded?: boolean;
  fileCount: number;
  frameless?: boolean;
  initialDraft?: string;
  inlineComments: DrawerInlineComment[];
  open: boolean;
  openLabel: string;
  ownLogin?: string;
  pr: DrawerPullRequest;
  ref?: Ref<PrDrawerHandle>;
  renderMarkdown?: (body: string) => ReactNode;
  reviews: DrawerReview[];
  trackerBase?: string;
  /** Only the drawer's own (non-frameless) seating reads this. */
  wide?: boolean;
}

type TimelineEntry =
  | { kind: "comment"; at: string; comment: DrawerComment }
  | { kind: "review"; at: string; review: DrawerReview };

const noop = () => undefined;

const REVIEW_STATES: Record<string, { label: string; cls: string }> = {
  APPROVED: { cls: "q-pill-approved", label: "Approved" },
  CHANGES_REQUESTED: { cls: "q-pill-changes", label: "Changes requested" },
  COMMENTED: { cls: "q-pill-commented", label: "Commented" },
  DISMISSED: { cls: "q-pill-muted", label: "Dismissed" },
};

/** The first line of a comment body — the snippet a thread-index row shows. */
function firstLine(body: string): string {
  return body.trim().split("\n")[0] ?? "";
}

const defaultComposer = (props: DrawerComposerProps) => (
  <AddCommentBox {...props} />
);

export function PrDrawer({
  ref,
  addCommentPending,
  callbacks,
  ci,
  composer = defaultComposer,
  conversation,
  embedded = false,
  fileCount,
  frameless = false,
  initialDraft,
  inlineComments,
  open,
  openLabel,
  ownLogin,
  pr,
  renderMarkdown,
  reviews,
  trackerBase,
  wide = false,
}: PrDrawerProps) {
  const body = pr.body.trim();
  const callbacksRef = useLatest(callbacks);
  const [editingId, setEditingId] = useState<number | null>(null);

  const startEdit = (commentId: number) => {
    setEditingId(commentId);
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const submitEdit = (commentId: number, text: string) => {
    callbacks.onEditComment({ body: text, commentId }).catch(() => undefined);
    setEditingId(null);
  };

  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = panelRef.current;
    if (embedded || frameless || !el) {
      return;
    }
    if (open) {
      el.focus({ preventScroll: true });
    } else if (el.contains(document.activeElement)) {
      (document.activeElement as HTMLElement).blur();
      callbacksRef.current.onFocusExit?.();
    }
  }, [open, embedded, frameless, callbacksRef]);

  const [composing, setComposing] = useState(false);
  const [draftEmpty, setDraftEmpty] = useState(() => !initialDraft?.trim());
  const composerRef = useRef<DrawerComposerHandle>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const justPostedRef = useRef(false);
  const [bodyScrolls, setBodyScrolls] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-scans el.children, which gains the "Code discussion" section once inlineComments goes non-empty
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) {
      return;
    }
    const measure = () => {
      setBodyScrolls(el.scrollHeight > el.clientHeight + 1);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    for (const section of el.children) {
      ro.observe(section);
    }
    return () => ro.disconnect();
    // react-doctor-disable-next-line exhaustive-deps -- the expression is the dependency: the observer only needs rebuilding when the comment list crosses empty/non-empty, not when a comment is edited
  }, [inlineComments.length > 0]);

  useEffect(() => {
    if (composing) {
      composerRef.current?.focus();
    }
  }, [composing]);

  const startComposing = () => {
    setComposing(true);
  };

  useImperativeHandle(
    ref,
    (): PrDrawerHandle => ({
      openComposer: startComposing,
    }),
    // biome-ignore lint/correctness/useExhaustiveDependencies: the React Compiler (where the host runs it) stabilizes startComposing; a manual useCallback would be dead weight
    [startComposing] // react-doctor-disable-line exhaustive-deps -- as above: the compiler stabilizes startComposing
  );

  const collapseComposer = () => {
    setComposing(false);
    panelRef.current?.focus({ preventScroll: true });
  };

  const timeline: TimelineEntry[] = [
    ...conversation.map((c) => ({
      at: c.createdAt,
      comment: c,
      kind: "comment" as const,
    })),
    ...reviews.map((r) => ({
      at: r.submittedAt,
      kind: "review" as const,
      review: r,
    })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  const replyCounts = new Map<number, number>();
  for (const c of inlineComments) {
    if (c.inReplyToId !== null) {
      replyCounts.set(c.inReplyToId, (replyCounts.get(c.inReplyToId) ?? 0) + 1);
    }
  }
  const threads: ThreadIndexRow[] = inlineComments
    .filter((c) => c.inReplyToId === null)
    .map((root) => ({
      id: root.id,
      line: root.line,
      path: root.path,
      replyCount: replyCounts.get(root.id) ?? 0,
      resolved: root.resolved,
      snippet: firstLine(root.body),
    }));

  const handleAddComment = (text: string) => {
    justPostedRef.current = true;
    callbacks.onAddComment(text).catch(() => undefined);
    collapseComposer();
  };

  const revealNewestComment = (el: HTMLDivElement | null) => {
    if (!(el && justPostedRef.current)) {
      return;
    }
    justPostedRef.current = false;
    el.scrollIntoView({ behavior: "instant", block: "nearest" });
  };

  const head = (
    <div className="qf-drawer-head">
      <span className="qf-drawer-title">Pull request</span>
      <div className="qf-drawer-head-actions">
        <Tooltip combo="shift+i" label={`${wide ? "Narrow" : "Widen"} panel`}>
          <button
            aria-label={wide ? "Narrow panel" : "Widen panel"}
            aria-pressed={wide}
            className="qf-drawer-wide-btn q-focus"
            onClick={callbacks.onToggleWide}
            type="button"
          >
            {wide ? (
              <PanelRightClose aria-hidden size={15} />
            ) : (
              <PanelRightOpen aria-hidden size={15} />
            )}
          </button>
        </Tooltip>
        <Tooltip combo="esc" label="Close">
          <button
            aria-label="Close"
            className="qf-drawer-close q-focus"
            onClick={callbacks.onClose}
            type="button"
          >
            Esc
          </button>
        </Tooltip>
      </div>
    </div>
  );

  const content = (
    <>
      <div className="qf-drawer-body" ref={bodyRef}>
        <PrSummary
          ci={ci}
          fileCount={fileCount}
          onOpenCiUrl={callbacks.onOpenCiUrl}
          onOpenPr={callbacks.onOpenPr}
          onOpenTicket={callbacks.onOpenTicket}
          onShowChecks={callbacks.onShowChecks}
          openLabel={openLabel}
          pr={pr}
          trackerBase={trackerBase}
        />

        <DrawerDescription body={body} renderMarkdown={renderMarkdown} />

        <DrawerConversation
          composer={composer}
          editingId={editingId}
          newestRef={revealNewestComment}
          onCancelEdit={cancelEdit}
          onDelete={callbacks.onDeleteComment}
          onStartEdit={startEdit}
          onSubmitEdit={submitEdit}
          ownLogin={ownLogin}
          renderMarkdown={renderMarkdown}
          timeline={timeline}
        />

        <ThreadIndex onJump={callbacks.onJumpToThread} threads={threads} />
      </div>

      <div
        className={cn(
          "qf-drawer-foot",
          bodyScrolls && "qf-drawer-foot-divided"
        )}
      >
        <div hidden={!composing}>
          {composer({
            autoFocus: false,
            initialMarkdown: initialDraft,
            onCancel: collapseComposer,
            onEmptyChange: setDraftEmpty,
            onSubmit: handleAddComment,
            pending: addCommentPending,
            placeholder: "Comment on this pull request…",
            ref: composerRef,
            submitLabel: "Comment",
          })}
        </div>
        {!composing && (
          <button
            className="qf-comment-prompt q-focus"
            onClick={startComposing}
            type="button"
          >
            <span>
              {draftEmpty
                ? "Comment on this pull request…"
                : "Continue your draft…"}
            </span>
            <span aria-hidden className="qf-comment-prompt-key">
              <Kbd combo="shift+c" />
            </span>
          </button>
        )}
      </div>
    </>
  );

  if (frameless) {
    return (
      <div
        className="qf-drawer-frameless"
        ref={panelRef as Ref<HTMLDivElement>}
        tabIndex={-1}
      >
        {content}
      </div>
    );
  }

  return (
    <>
      {!embedded && (
        <button
          aria-label="Close panel"
          className={cn("qf-drawer-scrim", open && "qf-drawer-open")}
          onClick={callbacks.onClose}
          type="button"
        />
      )}
      <aside
        aria-hidden={!open}
        className={cn(
          "qf-drawer",
          open && "qf-drawer-open",
          wide && "qf-drawer-wide",
          embedded && "qf-drawer-embedded"
        )}
        inert={!open}
        ref={panelRef}
        tabIndex={-1}
      >
        {head}
        {content}
      </aside>
    </>
  );
}

interface DrawerDescriptionProps {
  body: string;
  renderMarkdown?: (body: string) => ReactNode;
}

function DrawerDescription({ body, renderMarkdown }: DrawerDescriptionProps) {
  return (
    <section className="qf-drawer-section">
      <h3 className="qf-drawer-h">Description</h3>
      {body ? (
        (renderMarkdown?.(body) ?? <Markdown>{body}</Markdown>)
      ) : (
        <p className="qf-drawer-empty">No description.</p>
      )}
    </section>
  );
}

interface DrawerConversationProps {
  composer: (props: DrawerComposerProps) => ReactNode;
  editingId: number | null;
  newestRef: (el: HTMLDivElement | null) => void;
  onCancelEdit: () => void;
  onDelete: (a: { commentId: number }) => Promise<void>;
  onStartEdit: (commentId: number) => void;
  onSubmitEdit: (commentId: number, body: string) => void;
  ownLogin: string | undefined;
  renderMarkdown?: (body: string) => ReactNode;
  timeline: TimelineEntry[];
}

function DrawerConversation({
  composer,
  editingId,
  newestRef,
  onCancelEdit,
  onDelete,
  onStartEdit,
  onSubmitEdit,
  ownLogin,
  renderMarkdown,
  timeline,
}: DrawerConversationProps) {
  const newest = timeline.at(-1);

  return (
    <section className="qf-drawer-section">
      <h3 className="qf-drawer-h">
        Conversation
        {timeline.length > 0 && (
          <span className="qf-drawer-count">{timeline.length}</span>
        )}
      </h3>
      {timeline.length === 0 ? (
        <p className="qf-drawer-empty">No discussion yet. Start one below.</p>
      ) : (
        <div className="qf-convo">
          {timeline.map((entry) =>
            entry.kind === "comment" ? (
              <ConversationItem
                at={entry.comment.createdAt}
                avatarUrl={entry.comment.userAvatarUrl}
                body={entry.comment.body}
                commentId={entry.comment.id}
                composer={composer}
                editing={editingId === entry.comment.id}
                key={`c-${entry.comment.id}`}
                onCancelEdit={onCancelEdit}
                onDelete={onDelete}
                onStartEdit={onStartEdit}
                onSubmitEdit={onSubmitEdit}
                own={entry.comment.id > 0 && entry.comment.user === ownLogin}
                ref={entry === newest ? newestRef : undefined}
                renderMarkdown={renderMarkdown}
                user={entry.comment.user}
              />
            ) : (
              <ConversationItem
                at={entry.review.submittedAt}
                avatarUrl={entry.review.userAvatarUrl}
                body={entry.review.body}
                composer={composer}
                key={`r-${entry.review.id}`}
                renderMarkdown={renderMarkdown}
                state={entry.review.state}
                user={entry.review.user}
              />
            )
          )}
        </div>
      )}
    </section>
  );
}

interface ConversationItemProps {
  at: string;
  avatarUrl: string;
  body: string;
  commentId?: number;
  composer: (props: DrawerComposerProps) => ReactNode;
  editing?: boolean;
  onCancelEdit?: () => void;
  onDelete?: (a: { commentId: number }) => Promise<void>;
  onStartEdit?: (commentId: number) => void;
  onSubmitEdit?: (commentId: number, body: string) => void;
  own?: boolean;
  ref?: Ref<HTMLDivElement>;
  renderMarkdown?: (body: string) => ReactNode;
  state?: string;
  user: string;
}

function ConversationItem({
  user,
  avatarUrl,
  at,
  body,
  composer,
  state,
  commentId,
  own = false,
  editing = false,
  onStartEdit,
  onCancelEdit,
  onSubmitEdit,
  onDelete,
  ref,
  renderMarkdown,
}: ConversationItemProps) {
  const chip = state ? (REVIEW_STATES[state] ?? REVIEW_STATES.COMMENTED) : null;

  const handleSubmitEdit = (text: string) => {
    if (commentId !== undefined) {
      onSubmitEdit?.(commentId, text);
    }
  };

  const handleDelete = (id: number) => {
    onDelete?.({ commentId: id })?.catch(() => undefined);
  };

  return (
    <div className="qf-convo-item" ref={ref}>
      <Avatar name={user} size={20} url={avatarUrl} />
      <div className="qf-convo-main">
        <div className="qf-convo-head">
          <span className="qf-comment-author">{user}</span>
          {chip === null ? null : (
            <span className={cn("q-pill", chip.cls)}>{chip.label}</span>
          )}
          <span className="qf-comment-time" title={formatAbsolute(at)}>
            {formatRelativeTime(at)}
          </span>
          {!editing && commentId !== undefined && (
            <CommentTools
              body={body}
              onDelete={
                own && onDelete ? () => handleDelete(commentId) : undefined
              }
              onStartEdit={
                own && onStartEdit ? () => onStartEdit(commentId) : undefined
              }
            />
          )}
        </div>
        {editing ? (
          composer({
            autoFocus: true,
            initialMarkdown: body,
            onCancel: onCancelEdit ?? noop,
            onSubmit: handleSubmitEdit,
            pending: false,
            placeholder: "Edit your comment…",
            submitLabel: "Save",
          })
        ) : (
          <CommentBody body={body} renderMarkdown={renderMarkdown} />
        )}
      </div>
    </div>
  );
}
