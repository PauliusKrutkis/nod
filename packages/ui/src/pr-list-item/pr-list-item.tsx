/**
 * One inbox row: an unread dot, the title with its draft/merged pills, and a
 * metadata line (number · repo · author · branch · comments) with the relative
 * update time trailing right. Selection and unread are the host's decisions —
 * the row only renders them.
 *
 * The row is a listbox option under a roving tabindex the list owns, so it is
 * never tab-focused and Enter/Space open it exactly as a click does. Clicking
 * blurs afterwards: a row left focused steals the arrow keys from the list.
 *
 * PullRequestRow is the package's own minimal shape, not an import from the
 * app — the desktop's richer PullRequest satisfies it structurally. Number,
 * author, and time are optional because the row also renders things that
 * are PR-shaped without being PRs: the ledger's topic groups have a story
 * and a repo but no author, no number, and no timestamp, and the ledger
 * reuses THIS row (one component, different data) so the two lists can
 * never drift apart.
 */
import { GitBranch, MessageSquare } from "lucide-react";
import type { KeyboardEvent, MouseEvent } from "react";
import { Avatar } from "../avatar/avatar.tsx";
import { Badge } from "../badge/badge.tsx";
import { cn } from "../cn/cn.ts";
import { formatAbsolute, formatRelativeTime } from "../time/time.ts";
import "./pr-list-item.css";

export interface PullRequestRow {
  author?: string;
  authorAvatarUrl?: string | null;
  commentsCount: number;
  draft: boolean;
  headRef: string;
  merged: boolean;
  number?: number;
  repo: string;
  title: string;
  updatedAt?: string;
}

export function PRListItem({
  pr,
  selected,
  unread,
  onOpen,
  onHover,
}: {
  onHover?: () => void;
  onOpen: () => void;
  pr: PullRequestRow;
  selected: boolean;
  unread: boolean;
}) {
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen();
    }
  };

  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    onOpen();
    e.currentTarget.blur();
  };

  return (
    <div
      aria-selected={selected}
      className={cn("q-pr", selected && "q-pr-selected")}
      onClick={onClick}
      onKeyDown={onKeyDown}
      onMouseEnter={onHover}
      role="option"
      tabIndex={-1}
    >
      <span
        aria-hidden
        className={cn("q-pr-dot", unread && "q-pr-dot-unread")}
      />

      <div className="q-pr-main">
        <div className="q-pr-head">
          <span className={cn("q-pr-title", unread && "q-pr-title-unread")}>
            {pr.title}
          </span>
          {pr.draft ? <Badge tone="warning">Draft</Badge> : null}
          {pr.merged ? <Badge tone="accent">Merged</Badge> : null}
        </div>
        <div className="q-pr-meta">
          {pr.number !== undefined && (
            <>
              <span className="q-pr-num q-mono">#{pr.number}</span>
              <span className="q-dot">·</span>
            </>
          )}
          <span className="q-pr-cell">{pr.repo}</span>
          {pr.author !== undefined && (
            <>
              <span className="q-dot">·</span>
              <Avatar name={pr.author} size={14} url={pr.authorAvatarUrl} />
              <span className="q-pr-cell">{pr.author}</span>
            </>
          )}
          {pr.headRef ? (
            <>
              <span className="q-dot">·</span>
              <span className="q-pr-branch q-mono">
                <GitBranch aria-hidden size={11} />
                <span className="q-pr-cell">{pr.headRef}</span>
              </span>
            </>
          ) : null}
          {pr.commentsCount > 0 ? (
            <>
              <span className="q-dot">·</span>
              <span className="q-pr-comments q-mono">
                <MessageSquare aria-hidden size={11} />
                {pr.commentsCount}
              </span>
            </>
          ) : null}
        </div>
      </div>

      {pr.updatedAt !== undefined && (
        <span className="q-pr-time q-mono" title={formatAbsolute(pr.updatedAt)}>
          {formatRelativeTime(pr.updatedAt)}
        </span>
      )}
    </div>
  );
}
