/**
 * The index of inline code threads inside the PR info drawer: one row per
 * root comment, each jumping to that thread in the diff. Rows for outdated
 * threads (no line left to anchor to) still list — the conversation exists
 * even when there is nowhere to jump.
 *
 * Rows carry only what a row shows: the host has already grouped replies onto
 * their root and folded the comment body down to its first line, because both
 * are decisions about a payload this side never sees. With no threads the
 * whole section renders nothing rather than an empty heading, which is why a
 * drawer with no code discussion shows no code-discussion section.
 *
 * The path reads right-to-left so the ellipsis eats the repository prefix and
 * leaves the file name — the part that identifies the thread.
 */
import { CheckCircle2 } from "lucide-react";
import type { MouseEvent } from "react";
import "./thread-index.css";

export interface ThreadIndexRow {
  id: number;
  line: number | null;
  path: string;
  replyCount: number;
  resolved?: boolean;
  snippet: string;
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
            <span className="qf-thread-loc">
              {!!thread.resolved && (
                <CheckCircle2
                  aria-label="Resolved"
                  className="qf-thread-check"
                  size={12}
                />
              )}
              <span className="qf-thread-path">{thread.path}</span>
              <span className="qf-thread-line">
                {thread.line === null ? " · outdated" : `:${thread.line}`}
              </span>
              {thread.replyCount > 0 && (
                <span className="qf-thread-replies">
                  {thread.replyCount}{" "}
                  {thread.replyCount === 1 ? "reply" : "replies"}
                </span>
              )}
            </span>
            <span className="qf-thread-snip">{thread.snippet}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
