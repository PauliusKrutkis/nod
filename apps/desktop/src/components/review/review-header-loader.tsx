/**
 * Store and payload wiring for the review header; its view is review-header,
 * catalogued in @nod/ui. Three derivations live on this side because they are
 * all about the app's payloads rather than about the row of controls: the
 * account's issue tracker, the verdict rosters (aggregateReviewVerdicts, which
 * decides who currently approves), and how much conversation the drawer holds
 * — issue comments, reviews that said something, and inline thread roots.
 *
 * Stack detection also lives here: the chain joins over the inbox snapshot,
 * read from the query cache the way review-screen-pending already does (a
 * plain cache read, not a subscription — the inbox refreshes on its own
 * cadence — the header re-renders plenty). The join is left for the React
 * Compiler to memoize like the rest of this file's derivations; a hand-rolled
 * useMemo here is dead weight the compiler already does. Navigation reuses
 * openReview, the same action the inbox rows use.
 */

import { ReviewHeader } from "@nod/ui/review-header";
import { copyTextToClipboard } from "../../lib/clipboard.ts";
import { openExternal } from "../../lib/open-external.ts";
import { queryClient, queryKeys } from "../../lib/query-client.ts";
import { aggregateReviewVerdicts } from "../../lib/reviews.ts";
import { detectStack } from "../../lib/stacked-prs.ts";
import { useAppStore } from "../../store/app-store.ts";
import type {
  InboxData,
  PullRequest,
  PullRequestDetail,
  ReviewSummary,
} from "../../types.ts";

export function ReviewHeaderLoader({
  aiState,
  detail,
  onOpenSubmit,
  onToggleRightPanel,
  onToggleSidebar,
  pendingCount,
  pr,
  reviews,
  rightOpen,
  sidebarCompact,
  sidebarOpen,
}: {
  aiState: "working" | "done" | null;
  detail: PullRequestDetail;
  onOpenSubmit: () => void;
  onToggleRightPanel: () => void;
  onToggleSidebar: () => void;
  pendingCount: number;
  pr: PullRequest;
  reviews: ReviewSummary[];
  rightOpen: boolean;
  sidebarCompact: boolean;
  sidebarOpen: boolean;
}) {
  const trackerBase = useAppStore((s) =>
    s.activeAccountId ? s.issueTrackers[s.activeAccountId] : undefined
  );
  const openReview = useAppStore((s) => s.openReview);

  const inbox = queryClient.getQueryData<InboxData>(queryKeys.inbox);
  const pool = inbox
    ? [
        ...inbox.assigned.prs,
        ...inbox.created.prs,
        ...inbox.involved.prs,
        ...inbox.reviewRequested.prs,
      ]
    : [];
  const stack = detectStack(pr, pool);

  const openStackEntry = (number: number) => {
    const entry = stack?.entries.find((e) => e.number === number);
    if (entry) {
      openReview(entry.owner, entry.name, entry.number);
    }
  };

  const { approved, changesRequested } = aggregateReviewVerdicts(reviews);

  const convoCount =
    (detail.issueComments?.length ?? 0) +
    reviews.filter((r) => r.body.trim().length > 0).length +
    detail.comments.filter((c) => c.inReplyToId === null).length;

  return (
    <ReviewHeader
      aiState={aiState}
      approved={approved}
      changesRequested={changesRequested}
      ciState={detail.ciStatus?.state}
      convoCount={convoCount}
      onCopyBranch={copyTextToClipboard}
      onOpenStackEntry={openStackEntry}
      onOpenSubmit={onOpenSubmit}
      onOpenTicket={openExternal}
      onToggleRightPanel={onToggleRightPanel}
      onToggleSidebar={onToggleSidebar}
      pendingCount={pendingCount}
      pr={pr}
      rightOpen={rightOpen}
      showSidebarToggle={sidebarCompact || !sidebarOpen}
      sidebarOpen={sidebarOpen}
      stack={stack}
      trackerBase={trackerBase}
    />
  );
}
