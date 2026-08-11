import { ReviewHeader } from "@nod/ui/review-header";
import { copyTextToClipboard } from "../../lib/clipboard.ts";
import { openExternal } from "../../lib/open-external.ts";
import { aggregateReviewVerdicts } from "../../lib/reviews.ts";
import { useAppStore } from "../../store/app-store.ts";
import type {
  PullRequest,
  PullRequestDetail,
  ReviewSummary,
} from "../../types.ts";

/**
 * Store and payload wiring for the review header; its view is review-header,
 * catalogued in @nod/ui. Three derivations live on this side because they are
 * all about the app's payloads rather than about the row of controls: the
 * account's issue tracker, the verdict rosters (aggregateReviewVerdicts, which
 * decides who currently approves), and how much conversation the drawer holds
 * — issue comments, reviews that said something, and inline thread roots.
 */

export function ReviewHeaderLoader({
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

  const { approved, changesRequested } = aggregateReviewVerdicts(reviews);

  const convoCount =
    (detail.issueComments?.length ?? 0) +
    reviews.filter((r) => r.body.trim().length > 0).length +
    detail.comments.filter((c) => c.inReplyToId === null).length;

  return (
    <ReviewHeader
      approved={approved}
      changesRequested={changesRequested}
      ciState={detail.ciStatus?.state}
      convoCount={convoCount}
      onCopyBranch={copyTextToClipboard}
      onOpenSubmit={onOpenSubmit}
      onOpenTicket={openExternal}
      onToggleRightPanel={onToggleRightPanel}
      onToggleSidebar={onToggleSidebar}
      pendingCount={pendingCount}
      pr={pr}
      rightOpen={rightOpen}
      showSidebarToggle={sidebarCompact || !sidebarOpen}
      sidebarOpen={sidebarOpen}
      trackerBase={trackerBase}
    />
  );
}
