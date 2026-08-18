/**
 * The index of inline code threads inside the PR info drawer: one row per
 * root comment, each jumping to that thread in the diff. Rows for outdated
 * threads (no line left to anchor to) still list — the conversation exists
 * even when there is nowhere to jump.
 *
 * A row reads as a comment, not as a location: the author and what they said
 * lead, with the avatar and timestamp treatment the Conversation section
 * directly above already uses, and the file:line drops to a chip on the last
 * line. The click target and its jump-only job are unchanged — reply and
 * resolve live inline in the diff, never here.
 *
 * Rows carry only what a row shows: the host has already grouped replies onto
 * their root and folded the comment body down to its first line, because both
 * are decisions about a payload this side never sees. With no threads the
 * whole section renders nothing rather than an empty heading, which is why a
 * drawer with no code discussion shows no code-discussion section.
 *
 * The path reads right-to-left so the ellipsis eats the repository prefix and
 * leaves the file name — the part that identifies the thread. The author and
 * time classes are this component's own (comment-item owns the conversation's
 * pair): one class, one owner.
 */
import { CheckCircle2 } from "lucide-react";
import type { MouseEvent } from "react";
import { Avatar } from "../avatar/avatar.tsx";
import { formatAbsolute, formatRelativeTime } from "../time/time.ts";
import "./thread-index.css";

export interface ThreadIndexRow {
  createdAt: string;
  id: number;
  line: number | null;
  path: string;
  replyCount: number;
  resolved?: boolean;
  snippet: string;
  user: string;
  userAvatarUrl: string;
}

export function ThreadIndex({
  onJump,
  threads,
}: {
  onJump: (path: string, rootId: number) => void;
  threads: readonly ThreadIndexRow[];
}) {
  if (threads.length === 0) {
    return null;
  }

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    const path = e.currentTarget.dataset.threadPath;
    const rootId = Number(e.currentTarget.dataset.threadRoot);
    if (path && Number.isFinite(rootId)) {
      onJump(path, rootId);
    }
  };

  return (
    <section className="qf-threadindex">
      <h3 className="qf-threadindex-h">
        Code discussion
        <span className="qf-threadindex-count">{threads.length}</span>
      </h3>
      <div className="qf-threadindex-list">
        {threads.map((thread) => (
          <button
            className="qf-thread-row q-focus"
            data-thread-path={thread.path}
            data-thread-root={thread.id}
            key={thread.id}
            onClick={handleClick}
            title="Jump to this thread in the diff"
            type="button"
          >
            <span className="qf-thread-head">
              <Avatar name={thread.user} size={20} url={thread.userAvatarUrl} />
              <span className="qf-thread-author">{thread.user}</span>
              <span
                className="qf-thread-time"
                title={formatAbsolute(thread.createdAt)}
              >
                {formatRelativeTime(thread.createdAt)}
              </span>
              {!!thread.resolved && (
                <CheckCircle2
                  aria-label="Resolved"
                  className="qf-thread-check"
                  size={12}
                />
              )}
            </span>
            <span className="qf-thread-snip">{thread.snippet}</span>
            <span className="qf-thread-loc">
              <span className="qf-thread-chip">
                <span className="qf-thread-path">{thread.path}</span>
                <span className="qf-thread-line">
                  {thread.line === null ? " · outdated" : `:${thread.line}`}
                </span>
              </span>
              {thread.replyCount > 0 && (
                <span className="qf-thread-replies">
                  {thread.replyCount}{" "}
                  {thread.replyCount === 1 ? "reply" : "replies"}
                </span>
              )}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
