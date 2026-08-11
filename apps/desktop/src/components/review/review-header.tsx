/**
 * The review screen's header: PR state pill, ticket-aware title, repo/author/
 * branch meta with copyable branch chips, the reviewer verdict row, the CI-dot
 * info toggle and the submit button. Owns its own derivations from the PR and
 * detail payloads; interaction state stays in the screen and arrives as
 * callbacks.
 */

import { Avatar } from "@nod/ui/avatar";
import { Kbd } from "@nod/ui/kbd";
import { Check, GitBranch, PanelLeft } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { copyTextToClipboard } from "../../lib/clipboard.ts";
import { cn } from "../../lib/cn.ts";
import { useAppStore } from "../../store/app-store.ts";
import type {
  CiStatus,
  PullRequest,
  PullRequestDetail,
  ReviewSummary,
} from "../../types.ts";
import { TicketTitle } from "../ui/ticket-title.tsx";
import { Tooltip } from "../ui/tooltip.tsx";
import { ReviewVerdicts } from "./review-verdicts.tsx";

export function ReviewHeader({
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

  const stateClass = resolvePrStateClass(pr);
  const stateLabel = resolvePrStateLabel(pr);

  const convoCount =
    (detail.issueComments?.length ?? 0) +
    reviews.filter((r) => r.body.trim().length > 0).length +
    detail.comments.filter((c) => c.inReplyToId === null).length;

  const ciDot = ciDotClass(detail.ciStatus);
  const infoTitle = ciDot
    ? `PR info & checks · ${ciDotLabel(detail.ciStatus)}`
    : "PR description & conversation";

  return (
    <header className="qf-header flex shrink-0 items-center gap-4 px-6 py-3">
      {(sidebarCompact || !sidebarOpen) && (
        <Tooltip combo="b" label="Show files">
          <button
            aria-label="Show files"
            aria-pressed={sidebarOpen}
            className="qf-files-toggle qf-focusable"
            onClick={onToggleSidebar}
            type="button"
          >
            <PanelLeft aria-hidden size={16} />
          </button>
        </Tooltip>
      )}
      <div className="qf-header-id min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn("qf-state", stateClass)}>
            <span className="qf-state-dot" />
            {stateLabel}
          </span>
          <h1 className="qf-pr-title truncate" title={pr.title}>
            <TicketTitle title={pr.title} trackerBase={trackerBase} />
          </h1>
        </div>
        <div className="qf-pr-sub mt-1 flex min-w-0 items-center gap-2">
          <span className="qf-pr-num">#{pr.number}</span>
          <span className="qf-dot">·</span>
          <span>{pr.repo}</span>
          <span className="qf-dot">·</span>
          <Avatar name={pr.author} size={15} url={pr.authorAvatarUrl} />
          <span className="qf-muted">{pr.author}</span>
          {!!pr.baseRef && !!pr.headRef && (
            <>
              <span className="qf-dot">·</span>
              <span className="qf-branch">
                <BranchChip
                  label="Target branch · click to copy"
                  name={pr.baseRef}
                />
                <span className="qf-arrow">←</span>
                <BranchChip
                  label="PR branch · click to copy"
                  name={pr.headRef}
                />
              </span>
            </>
          )}
        </div>
      </div>

      <div className="qf-header-actions flex shrink-0 items-center gap-4">
        <ReviewVerdicts reviews={reviews} />
        <Tooltip combo="i" label={infoTitle}>
          <button
            aria-pressed={rightOpen}
            className="qf-info-btn qf-focusable"
            onClick={onToggleRightPanel}
            type="button"
          >
            i{ciDot && <span aria-hidden className={cn("qf-ci-dot", ciDot)} />}
            {convoCount > 0 && (
              <span className="qf-info-count">{convoCount}</span>
            )}
          </button>
        </Tooltip>
        <button
          className="qf-submit qf-focusable"
          onClick={onOpenSubmit}
          type="button"
        >
          {pendingCount > 0 ? "Submit review" : "Review"}
          {pendingCount > 0 && (
            <span className="qf-submit-badge">{pendingCount}</span>
          )}
          <Kbd combo="s" />
        </button>
      </div>
    </header>
  );
}

/** Class for the small CI status dot on the info button, or null when a repo
 *  has no checks (state "none") — the dot should stay quiet then. */
function ciDotClass(ci: CiStatus | undefined): string | null {
  if (!ci || ci.state === "none") {
    return null;
  }
  return `qf-ci-dot-${ci.state}`;
}

function ciDotLabel(ci: CiStatus | undefined): string {
  switch (ci?.state) {
    case "success":
      return "checks passing";
    case "failure":
      return "checks failing";
    case "pending":
      return "checks running";
    default:
      return "checks";
  }
}

function resolvePrStateClass(pr: PullRequest): string {
  if (pr.draft) {
    return "qf-state-draft";
  }
  if (pr.merged) {
    return "qf-state-merged";
  }
  if (pr.state === "open") {
    return "qf-state-open";
  }
  return "qf-state-draft";
}

function resolvePrStateLabel(pr: PullRequest): string {
  if (pr.draft) {
    return "Draft";
  }
  if (pr.merged) {
    return "Merged";
  }
  if (pr.state === "open") {
    return "Open";
  }
  return pr.state;
}

/** A branch name as a copyable chip: click copies the name, the icon confirms. */
function BranchChip({ name, label }: { name: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    },
    []
  );
  const onCopy = () => {
    copyTextToClipboard(name);
    setCopied(true);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => setCopied(false), 1200);
  };
  return (
    <Tooltip label={copied ? "Copied" : label}>
      <button
        className={cn("qf-branch-chip", copied && "qf-branch-copied")}
        onClick={onCopy}
        type="button"
      >
        {copied ? (
          <Check aria-hidden size={11} />
        ) : (
          <GitBranch aria-hidden size={11} />
        )}
        {name}
      </button>
    </Tooltip>
  );
}
