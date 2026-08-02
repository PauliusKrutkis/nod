/**
 * The review screen's pending shell: sidebar + main-pane skeleton bars painted
 * from the inbox cache's view of the PR (title, branch, author) so the frame
 * is recognizable before detail loads, and the error state with a retry path.
 */
import { queryClient, queryKeys } from "../../lib/query-client.ts";
import type { InboxBucket, InboxData, PullRequest } from "../../types.ts";
import { Avatar } from "../ui/avatar.tsx";

const SIDEBAR_SKELETON_WIDTHS = [88, 72, 56, 40, 88, 72, 56, 40, 88] as const;
const MAIN_SKELETON_WIDTHS = Array.from(
  { length: 16 },
  (_, index) => ((index * 37) % 52) + 32
);

export function ReviewScreenPending({
  error,
  goInbox,
  isError,
  number,
  owner,
  repo,
}: {
  error: unknown;
  goInbox: () => void;
  isError: boolean;
  number: number;
  owner: string;
  repo: string;
}) {
  if (isError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="font-medium text-danger text-sm">
          Couldn't load this pull request
        </p>
        <p className="max-w-md break-words text-muted text-xs">
          {String(error)}
        </p>
        <button
          className="rounded-card border border-line px-3 py-1.5 text-fg text-sm hover:bg-elevated"
          onClick={goInbox}
          type="button"
        >
          Back to inbox
        </button>
        <p className="text-faint text-xs">Press Esc to go back</p>
      </div>
    );
  }

  const cached = findCachedInboxPr(owner, repo, number);
  return (
    <div className="dir-quiet relative flex h-full min-h-0 overflow-hidden">
      <aside className="w-[300px] shrink-0 border-line border-r">
        <div className="qf-sidebar flex h-full flex-col">
          <div className="qf-side-head flex items-center justify-between px-4 py-3">
            <span className="qf-side-title">Files</span>
          </div>
          <div className="px-3 py-1">
            {SIDEBAR_SKELETON_WIDTHS.map((width, index, widths) => {
              const n = widths
                .slice(0, index)
                .filter((w) => w === width).length;
              return (
                <div
                  className="qf-skel"
                  key={`${width}-${n}`}
                  style={{
                    height: 17,
                    margin: "10px 8px",
                    width: `${width}%`,
                  }}
                />
              );
            })}
          </div>
        </div>
      </aside>
      <main className="qf-main flex min-w-0 flex-1 flex-col">
        <header className="qf-header shrink-0 px-6 py-3">
          {cached ? (
            <>
              <div className="flex items-center gap-2">
                <h1 className="qf-pr-title truncate" title={cached.title}>
                  {cached.title}
                </h1>
              </div>
              <div className="qf-pr-sub mt-1 flex items-center gap-2">
                <span className="qf-pr-num">#{cached.number}</span>
                <span className="qf-dot">·</span>
                <span>{cached.repo}</span>
                <span className="qf-dot">·</span>
                <Avatar
                  name={cached.author}
                  size={15}
                  url={cached.authorAvatarUrl}
                />
                <span className="qf-muted">{cached.author}</span>
              </div>
            </>
          ) : (
            <>
              <div className="qf-skel" style={{ height: 16, width: 340 }} />
              <div
                className="qf-skel"
                style={{ height: 11, marginTop: 9, width: 190 }}
              />
            </>
          )}
        </header>
        <div className="min-w-0 flex-1 overflow-hidden px-6 py-5">
          {MAIN_SKELETON_WIDTHS.map((width) => (
            <div
              className="qf-skel"
              key={width}
              style={{
                height: 12,
                margin: "11px 0",
                width: `${width}%`,
              }}
            />
          ))}
        </div>
      </main>
    </div>
  );
}

/** The inbox cache's view of a PR, for painting the shell before detail loads. */
function findCachedInboxPr(
  owner: string,
  repo: string,
  number: number
): PullRequest | undefined {
  const match = (p: PullRequest) =>
    p.owner === owner && p.name === repo && p.number === number;
  const inbox = queryClient.getQueryData<InboxData>(queryKeys.inbox);
  if (inbox) {
    for (const key of [
      "reviewRequested",
      "assigned",
      "created",
      "involved",
    ] as const) {
      const hit = inbox[key].prs.find(match);
      if (hit) {
        return hit;
      }
    }
  }
  return queryClient
    .getQueryData<InboxBucket>(queryKeys.subscribed)
    ?.prs.find(match);
}
