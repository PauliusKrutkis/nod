/**
 * Rows for inline code threads: one per root comment, each jumping to that
 * thread in the diff. Rows for outdated threads (no line left to anchor to)
 * still list — the conversation exists even when there is nowhere to jump.
 *
 * A row reads exactly like a conversation comment — avatar beside a main
 * column, author and time leading — because the drawer seats these rows in
 * the same Discussion feed as PR-level comments, interleaved by time. What
 * makes a thread row a thread row is the extra it carries: the file:line
 * chip (path laid out rtl so the ellipsis eats the directory prefix, not the
 * file name), the reply count, the resolved tick, and the click, whose only
 * job is the jump — reply and resolve live inline in the diff, never here.
 *
 * Rows carry only what a row shows: the host has already grouped replies onto
 * their root and folded the comment body down to its first line, because both
 * are decisions about a payload this side never sees. The desktop's
 * end-to-end specs locate threads by .qf-thread-row and its resolved tick,
 * so those class names are contract. ThreadIndex remains the standalone
 * listing of rows (the gallery's specimen and any host that wants only the
 * index); the drawer composes ThreadRow directly into its feed.
 */
import { CheckCircle2 } from "lucide-react";
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

export function ThreadRow({
  onJump,
  thread,
}: {
  onJump: (path: string, rootId: number) => void;
  thread: ThreadIndexRow;
}) {
  return (
    <button
      className="qf-thread-row q-focus"
      onClick={() => onJump(thread.path, thread.id)}
      title="Jump to this thread in the diff"
      type="button"
    >
      <Avatar name={thread.user} size={20} url={thread.userAvatarUrl} />
      <span className="qf-thread-main">
        <span className="qf-thread-head">
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
      </span>
    </button>
  );
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

  return (
    <section className="qf-threadindex">
      <h3 className="qf-threadindex-h">
        Code discussion
        <span className="qf-threadindex-count">{threads.length}</span>
      </h3>
      <div className="qf-threadindex-list">
        {threads.map((thread) => (
          <ThreadRow key={thread.id} onJump={onJump} thread={thread} />
        ))}
      </div>
    </section>
  );
}
