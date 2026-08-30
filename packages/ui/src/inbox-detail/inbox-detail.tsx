/**
 * The inbox reading pane — a calm summary of the selected PR: one meta line,
 * the title carrying the weight, an author row, a single stat strip, then the
 * description scrolling on its own under a pinned footer of hints. No
 * boxes-in-boxes.
 *
 * The stat strip omits what it has nothing to say about (a PR with no changed
 * files and no diff shows only its comment count) and the separators are
 * placed accordingly, so the line never opens or closes on a stray dot.
 *
 * Bodies are markdown in production, but a markdown renderer drags in the
 * host's link handling and sanitiser, so it stays a `renderBody` slot; with
 * none supplied the raw text renders, which is also what makes these captures
 * deterministic. Ticket links work the same way: the base URL is the host's
 * per-account setting and the host opens the resolved href.
 *
 * InboxPullRequest is the package's own minimal shape, not an import from the
 * app — the desktop's richer PullRequest satisfies it structurally. Number,
 * author, and time are optional for the same reason PRListItem's are: the
 * ledger's topic groups read through THIS pane (one component, different
 * data), and a group has no author, number, or timestamp. `openHint` and
 * `archivable` let that host label the footer truthfully — a ledger topic
 * opens a session and cannot be archived.
 */
import type { ReactNode } from "react";
import { Avatar } from "../avatar/avatar.tsx";
import { Badge } from "../badge/badge.tsx";
import { Kbd } from "../kbd/kbd.tsx";
import { TicketTitle } from "../ticket-title/ticket-title.tsx";
import { formatAbsolute, formatRelativeTime } from "../time/time.ts";
import "./inbox-detail.css";

export interface InboxPullRequest {
  additions: number;
  author?: string;
  authorAvatarUrl?: string | null;
  body: string;
  changedFiles: number;
  commentsCount: number;
  deletions: number;
  draft: boolean;
  lastComment?: {
    author: string;
    authorAvatarUrl?: string | null;
    body: string;
    createdAt: string;
  };
  merged: boolean;
  number?: number;
  repo: string;
  title: string;
  updatedAt?: string;
}

function stateBadge(pr: InboxPullRequest): ReactNode {
  if (pr.draft) {
    return (
      <Badge dot tone="warning">
        Draft
      </Badge>
    );
  }
  if (pr.merged) {
    return (
      <Badge dot tone="accent">
        Merged
      </Badge>
    );
  }
  return (
    <Badge dot tone="success">
      Open
    </Badge>
  );
}

function DetailStats({ pr }: { pr: InboxPullRequest }) {
  const hasFiles = pr.changedFiles > 0;
  const hasDiff = pr.additions + pr.deletions > 0;

  return (
    <div className="qi-detail-stats">
      {hasFiles ? (
        <span>
          {pr.changedFiles} file{pr.changedFiles === 1 ? "" : "s"}
        </span>
      ) : null}
      {hasDiff ? (
        <>
          {hasFiles ? <span className="q-dot">·</span> : null}
          <span>
            <span className="qi-add">+{pr.additions}</span>{" "}
            <span className="qi-del">−{pr.deletions}</span>
          </span>
        </>
      ) : null}
      {hasFiles || hasDiff ? <span className="q-dot">·</span> : null}
      <span>
        {pr.commentsCount} comment{pr.commentsCount === 1 ? "" : "s"}
      </span>
    </div>
  );
}

export function InboxDetail({
  pr,
  archived = false,
  archivable = true,
  openHint = "open review",
  trackerBase,
  onOpenTicket,
  renderBody,
}: {
  /** False hides the archive hint entirely — the ledger has no archive. */
  archivable?: boolean;
  archived?: boolean;
  onOpenTicket: (url: string) => void;
  /** What Enter does here, in the host's words. */
  openHint?: string;
  pr: InboxPullRequest;
  renderBody?: (body: string) => ReactNode;
  trackerBase?: string;
}) {
  const body = pr.body.trim();

  return (
    <aside aria-label="Pull request detail" className="qi-detail">
      <header className="qi-detail-head">
        <div className="qi-detail-meta">
          {stateBadge(pr)}
          {pr.number !== undefined && (
            <>
              <span className="qi-detail-num">#{pr.number}</span>
              <span className="q-dot">·</span>
            </>
          )}
          <span className="qi-detail-repo" title={pr.repo}>
            {pr.repo}
          </span>
        </div>
        <h2 className="qi-detail-title">
          <TicketTitle
            onOpenTicket={onOpenTicket}
            title={pr.title}
            trackerBase={trackerBase}
          />
        </h2>
        {pr.author !== undefined && (
          <div className="qi-detail-author">
            <Avatar name={pr.author} size={20} url={pr.authorAvatarUrl} />
            <span className="qi-detail-author-name">{pr.author}</span>
            {pr.updatedAt !== undefined && (
              <span
                className="qi-detail-time"
                title={formatAbsolute(pr.updatedAt)}
              >
                updated {formatRelativeTime(pr.updatedAt)}
              </span>
            )}
          </div>
        )}
        <DetailStats pr={pr} />
      </header>

      <div className="qi-detail-body">
        {body ? (
          <>
            <div className="qi-detail-kicker">Description</div>
            {renderBody ? (
              renderBody(body)
            ) : (
              <p className="qi-detail-raw">{body}</p>
            )}
          </>
        ) : (
          <p className="qi-detail-none">No description provided.</p>
        )}

        {pr.lastComment === undefined ? null : (
          <div className="qi-detail-comment">
            <div className="qi-detail-kicker">Latest comment</div>
            <div className="qi-detail-comment-meta">
              <Avatar
                name={pr.lastComment.author}
                size={16}
                url={pr.lastComment.authorAvatarUrl}
              />
              <span className="qi-detail-author-name">
                {pr.lastComment.author}
              </span>
              <span
                className="qi-detail-time"
                title={formatAbsolute(pr.lastComment.createdAt)}
              >
                {formatRelativeTime(pr.lastComment.createdAt)}
              </span>
            </div>
            <p className="qi-detail-comment-body">{pr.lastComment.body}</p>
          </div>
        )}
      </div>

      <footer className="qi-detail-foot">
        <span className="qi-detail-hint">
          <Kbd combo="enter" /> {openHint}
        </span>
        {archivable && (
          <>
            <span className="q-dot">·</span>
            <span className="qi-detail-hint">
              <Kbd combo="e" /> {archived ? "restore" : "archive"}
            </span>
          </>
        )}
      </footer>
    </aside>
  );
}
