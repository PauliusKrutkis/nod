/**
 * Container for the pending review shell: it looks the PR up in the inbox
 * cache so the header can paint the real title, branch and author before the
 * detail request lands, and stringifies whatever the query failed with. The
 * shell itself is props-pure in @nod/ui.
 */

import { ReviewScreenPending as PendingShell } from "@nod/ui/review-screen-pending";
import { queryClient, queryKeys } from "../../lib/query-client.ts";
import type { InboxBucket, InboxData, PullRequest } from "../../types.ts";

export function ReviewScreenPendingLoader({
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
  const cached = findCachedInboxPr(owner, repo, number);
  return (
    <PendingShell
      error={String(error)}
      isError={isError}
      onBack={goInbox}
      pr={cached ?? null}
    />
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
