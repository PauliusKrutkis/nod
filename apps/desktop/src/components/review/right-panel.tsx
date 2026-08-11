/**
 * The PR detail drawer: CI, verdict summary, and the conversation timeline.
 * Your own conversation comments (never verdicts) carry the same quiet
 * Edit/Delete tools as inline threads, with the in-place "Delete?" confirm.
 * The composer starts as a one-line prompt and expands on intent; it stays
 * mounted (hidden) while collapsed so a half-typed draft survives Esc —
 * "drafts are never lost" (DESIGN.md) — and the prompt advertises the draft.
 * It docks as the drawer's footer: always reachable without scrolling, and
 * the expanded editor (with its submit row) is on-screen by construction.
 * The footer's divider only appears once the body scrolls, which is measured
 * by observing the body *and its sections* — the body's own box is pinned by
 * the drawer, so growing conversation only ever resizes a section.
 * Posting arms a one-shot reveal: the ref on the timeline's newest row fires
 * when the optimistic comment mounts and scrolls it into view, so the comment
 * you just wrote is never left below the fold. The scroll is instant (this is
 * a reading surface, not an animated one) and the arm is consumed by that
 * first mount, so a background refetch or your own later scrolling is never
 * yanked back.
 *
 * Two of its sections are catalogued views now — pr-summary (identity, stats,
 * CI, the link out) and thread-index (the inline-thread list) — and this file
 * reduces the payloads they take. The rest stays app-side because it renders
 * Markdown and the comment composer, neither of which is portable yet.
 */

import {
  AddCommentBox,
  type AddCommentBoxHandle,
} from "@nod/ui/add-comment-box";
import { Avatar } from "@nod/ui/avatar";
import { CommentBody } from "@nod/ui/comment-item";
import { CommentTools } from "@nod/ui/comment-tools";
import { Kbd } from "@nod/ui/kbd";
import { PrSummary } from "@nod/ui/pr-summary";
import { ThreadIndex, type ThreadIndexRow } from "@nod/ui/thread-index";
import { formatAbsolute, formatRelativeTime } from "@nod/ui/time";
import { Tooltip } from "@nod/ui/tooltip";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import {
  type Ref,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { cn } from "../../lib/cn.ts";
import { firstLine } from "../../lib/comment-format.ts";
import { openExternal } from "../../lib/open-external.ts";
import { openOnProviderLabel } from "../../lib/provider.ts";
import { useAppStore } from "../../store/app-store.ts";
import type {
  CiStatus,
  IssueComment,
  PullRequest,
  ReviewComment,
  ReviewSummary,
} from "../../types.ts";
import { Markdown } from "../markdown-loader.tsx";

export interface RightPanelHandle {
  openComposer: () => void;
}

interface RightPanelProps {
  ci: CiStatus | undefined;
  conversation: IssueComment[];
  fileCount: number;
  inlineComments: ReviewComment[];
  addIssueCommentPending: boolean;
  onAddIssueComment: (body: string) => Promise<void>;
  onClose: () => void;
  onDeleteIssueComment: (a: { commentId: number }) => Promise<void>;
  onEditIssueComment: (a: { commentId: number; body: string }) => Promise<void>;
  onJumpToThread: (path: string, rootId: number) => void;
  onOpenPr: () => void;
  onToggleWide: () => void;
  open: boolean;
  pr: PullRequest;
  ref?: Ref<RightPanelHandle>;
  reviews: ReviewSummary[];
  wide: boolean;
}

/** One row of the merged conversation: a comment or a review verdict. */
type TimelineEntry =
  | { kind: "comment"; at: string; comment: IssueComment }
  | { kind: "review"; at: string; review: ReviewSummary };

const noop = () => undefined;

const REVIEW_STATES: Record<string, { label: string; cls: string }> = {
  APPROVED: { cls: "q-pill-approved", label: "Approved" },
  CHANGES_REQUESTED: { cls: "q-pill-changes", label: "Changes requested" },
  COMMENTED: { cls: "q-pill-commented", label: "Commented" },
  DISMISSED: { cls: "q-pill-muted", label: "Dismissed" },
};

/**
 * The info drawer (toggled with `i`, Esc closes): the PR description, the
 * complete conversation (PR-level comments merged with review verdicts), an
 * index of inline code threads, and a composer that expands from a one-line
 * prompt (Esc backs out of the composer first, then the drawer). Comments
 * post optimistically — the composer never blocks.
 */
export function RightPanel({
  ref,
  ci,
  pr,
  fileCount,
  conversation,
  reviews,
  inlineComments,
  open,
  wide,
  onClose,
  onToggleWide,
  addIssueCommentPending,
  onAddIssueComment,
  onDeleteIssueComment,
  onEditIssueComment,
  onJumpToThread,
  onOpenPr,
}: RightPanelProps) {
  const body = pr.body.trim();
  const trackerBase = useAppStore((s) =>
    s.activeAccountId ? s.issueTrackers[s.activeAccountId] : undefined
  );
  const ownLogin = useAppStore(
    (s) => s.accounts.find((a) => a.id === s.activeAccountId)?.login
  );
  const [editingId, setEditingId] = useState<number | null>(null);

  const startEdit = (commentId: number) => {
    setEditingId(commentId);
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const submitEdit = (commentId: number, text: string) => {
    onEditIssueComment({ body: text, commentId }).catch(() => undefined);
    setEditingId(null);
  };

  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = panelRef.current;
    if (!el) {
      return;
    }
    if (open) {
      el.focus({ preventScroll: true });
    } else if (el.contains(document.activeElement)) {
      (document.activeElement as HTMLElement).blur();
      document
        .querySelector<HTMLElement>(".qf-scrollhost")
        ?.focus({ preventScroll: true });
    }
  }, [open]);

  const [composing, setComposing] = useState(false);
  const [draftEmpty, setDraftEmpty] = useState(true);
  const composerRef = useRef<AddCommentBoxHandle>(null);
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
    (): RightPanelHandle => ({
      openComposer: startComposing,
    }),
    // biome-ignore lint/correctness/useExhaustiveDependencies: React Compiler (vite.config.ts) stabilizes startComposing; a manual useCallback would be dead weight
    [startComposing]
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

  const handleAddIssueComment = (text: string) => {
    justPostedRef.current = true;
    onAddIssueComment(text).catch(() => undefined);
    collapseComposer();
  };

  const revealNewestComment = (el: HTMLDivElement | null) => {
    if (!(el && justPostedRef.current)) {
      return;
    }
    justPostedRef.current = false;
    el.scrollIntoView({ behavior: "instant", block: "nearest" });
  };

  return (
    <>
      <button
        aria-label="Close panel"
        className={cn("qf-drawer-scrim", open && "qf-drawer-open")}
        onClick={onClose}
        type="button"
      />
      <aside
        aria-hidden={!open}
        className={cn(
          "qf-drawer",
          open && "qf-drawer-open",
          wide && "qf-drawer-wide"
        )}
        inert={!open}
        ref={panelRef}
        tabIndex={-1}
      >
        <div className="qf-drawer-head">
          <span className="qf-drawer-title">Pull request</span>
          <div className="qf-drawer-head-actions">
            <Tooltip
              combo="shift+i"
              label={`${wide ? "Narrow" : "Widen"} panel`}
            >
              <button
                aria-label={wide ? "Narrow panel" : "Widen panel"}
                aria-pressed={wide}
                className="qf-drawer-wide-btn qf-focusable"
                onClick={onToggleWide}
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
                className="qf-drawer-close qf-focusable"
                onClick={onClose}
                type="button"
              >
                Esc
              </button>
            </Tooltip>
          </div>
        </div>

        <div className="qf-drawer-body" ref={bodyRef}>
          <PrSummary
            ci={ci}
            fileCount={fileCount}
            onOpenCiUrl={openExternal}
            onOpenPr={onOpenPr}
            onOpenTicket={openExternal}
            openLabel={openOnProviderLabel(pr.url)}
            pr={pr}
            trackerBase={trackerBase}
          />

          <DrawerDescription body={body} owner={pr.owner} repo={pr.name} />

          <DrawerConversation
            editingId={editingId}
            newestRef={revealNewestComment}
            onCancelEdit={cancelEdit}
            onDelete={onDeleteIssueComment}
            onStartEdit={startEdit}
            onSubmitEdit={submitEdit}
            owner={pr.owner}
            ownLogin={ownLogin}
            repo={pr.name}
            timeline={timeline}
          />

          <ThreadIndex onJump={onJumpToThread} threads={threads} />
        </div>

        <div
          className={cn(
            "qf-drawer-foot",
            bodyScrolls && "qf-drawer-foot-divided"
          )}
        >
          <div hidden={!composing}>
            <AddCommentBox
              autoFocus={false}
              onCancel={collapseComposer}
              onEmptyChange={setDraftEmpty}
              onSubmit={handleAddIssueComment}
              pending={addIssueCommentPending}
              placeholder="Comment on this pull request…"
              ref={composerRef}
              submitLabel="Comment"
            />
          </div>
          {!composing && (
            <button
              className="qf-comment-prompt qf-focusable"
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
      </aside>
    </>
  );
}

interface DrawerDescriptionProps {
  body: string;
  owner: string;
  repo: string;
}

function DrawerDescription({ body, owner, repo }: DrawerDescriptionProps) {
  return (
    <section className="qf-drawer-section">
      <h3 className="qf-drawer-h">Description</h3>
      {body ? (
        <Markdown owner={owner} repo={repo}>
          {body}
        </Markdown>
      ) : (
        <p className="text-faint text-sm">No description.</p>
      )}
    </section>
  );
}

interface DrawerConversationProps {
  editingId: number | null;
  newestRef: (el: HTMLDivElement | null) => void;
  onCancelEdit: () => void;
  onDelete: (a: { commentId: number }) => Promise<void>;
  onStartEdit: (commentId: number) => void;
  onSubmitEdit: (commentId: number, body: string) => void;
  ownLogin: string | undefined;
  owner: string;
  repo: string;
  timeline: TimelineEntry[];
}

function DrawerConversation({
  editingId,
  newestRef,
  onCancelEdit,
  onDelete,
  onStartEdit,
  onSubmitEdit,
  ownLogin,
  owner,
  repo,
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
        <p className="text-faint text-sm">
          No discussion yet. Start one below.
        </p>
      ) : (
        <div className="qf-convo">
          {timeline.map((entry) =>
            entry.kind === "comment" ? (
              <ConversationItem
                at={entry.comment.createdAt}
                avatarUrl={entry.comment.userAvatarUrl}
                body={entry.comment.body}
                commentId={entry.comment.id}
                editing={editingId === entry.comment.id}
                key={`c-${entry.comment.id}`}
                onCancelEdit={onCancelEdit}
                onDelete={onDelete}
                onStartEdit={onStartEdit}
                onSubmitEdit={onSubmitEdit}
                own={entry.comment.id > 0 && entry.comment.user === ownLogin}
                owner={owner}
                ref={entry === newest ? newestRef : undefined}
                repo={repo}
                user={entry.comment.user}
              />
            ) : (
              <ConversationItem
                at={entry.review.submittedAt}
                avatarUrl={entry.review.userAvatarUrl}
                body={entry.review.body}
                key={`r-${entry.review.id}`}
                owner={owner}
                repo={repo}
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
  editing?: boolean;
  onCancelEdit?: () => void;
  onDelete?: (a: { commentId: number }) => Promise<void>;
  onStartEdit?: (commentId: number) => void;
  onSubmitEdit?: (commentId: number, body: string) => void;
  own?: boolean;
  owner: string;
  ref?: Ref<HTMLDivElement>;
  repo: string;
  state?: string;
  user: string;
}

/** A single conversation row — a comment, or a review verdict with its chip. */
function ConversationItem({
  user,
  avatarUrl,
  at,
  body,
  state,
  commentId,
  own = false,
  editing = false,
  onStartEdit,
  onCancelEdit,
  onSubmitEdit,
  onDelete,
  owner,
  ref,
  repo,
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

  const renderMarkdown = (text: string) => (
    <Markdown owner={owner} repo={repo}>
      {text}
    </Markdown>
  );

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
              commentId={commentId}
              onDelete={own && onDelete ? handleDelete : undefined}
              onStartEdit={own ? onStartEdit : undefined}
            />
          )}
        </div>
        {editing ? (
          <AddCommentBox
            autoFocus
            initialMarkdown={body}
            onCancel={onCancelEdit ?? noop}
            onSubmit={handleSubmitEdit}
            pending={false}
            placeholder="Edit your comment…"
            submitLabel="Save"
          />
        ) : (
          <CommentBody body={body} renderMarkdown={renderMarkdown} />
        )}
      </div>
    </div>
  );
}
