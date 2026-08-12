/**
 * The review screen's header: PR state pill, ticket-aware title, repo/author/
 * branch meta with copyable branch chips, the reviewer verdict row, the CI-dot
 * info toggle and the submit button.
 *
 * Everything it shows is already decided by the host: the verdict rosters
 * (collapsing a review timeline is the app's aggregateReviewVerdicts), the
 * conversation count, and how many drafts are waiting. Clipboard, ticket
 * links and the panels themselves are callbacks — this side of the boundary
 * knows nothing about Tauri, the store, or where a branch name goes.
 *
 * The header is its own container query context, so it responds to its own
 * width (main minus the file column) rather than the viewport: under 440px it
 * tightens the action gap and drops the verdict pills, which is why that rule
 * lives here rather than with review-verdicts — the header is what hides
 * them, and only inside its own container.
 *
 * HeaderPullRequest is the package's own minimal shape, not an import from
 * the app: the desktop's richer PullRequest satisfies it structurally.
 */
import { Check, GitBranch, PanelLeft } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "../avatar/avatar.tsx";
import { cn } from "../cn/cn.ts";
import { Kbd } from "../kbd/kbd.tsx";
import {
  type Reviewer,
  ReviewVerdicts,
} from "../review-verdicts/review-verdicts.tsx";
import { TicketTitle } from "../ticket-title/ticket-title.tsx";
import { Tooltip } from "../tooltip/tooltip.tsx";
import "./review-header.css";

export interface HeaderPullRequest {
  author: string;
  authorAvatarUrl?: string | null;
  baseRef?: string;
  draft: boolean;
  headRef?: string;
  merged: boolean;
  number: number;
  repo: string;
  state: string;
  title: string;
}

export function ReviewHeader({
  approved = [],
  changesRequested = [],
  ciState,
  convoCount = 0,
  onCopyBranch,
  onOpenSubmit,
  onOpenTicket,
  onToggleRightPanel,
  onToggleSidebar,
  pendingCount = 0,
  pr,
  rightOpen = false,
  showSidebarToggle = false,
  sidebarOpen = false,
  trackerBase,
}: {
  approved?: readonly Reviewer[];
  changesRequested?: readonly Reviewer[];
  ciState?: string;
  convoCount?: number;
  onCopyBranch: (name: string) => void;
  onOpenSubmit: () => void;
  onOpenTicket: (url: string) => void;
  onToggleRightPanel: () => void;
  onToggleSidebar: () => void;
  pendingCount?: number;
  pr: HeaderPullRequest;
  rightOpen?: boolean;
  showSidebarToggle?: boolean;
  sidebarOpen?: boolean;
  trackerBase?: string;
}) {
  const ciDot = ciDotClass(ciState);
  const infoTitle = ciDot
    ? `PR info & checks · ${ciDotLabel(ciState)}`
    : "PR description & conversation";

  return (
    <header className="qf-header">
      {showSidebarToggle && (
        <Tooltip combo="b" label="Show files">
          <button
            aria-label="Show files"
            aria-pressed={sidebarOpen}
            className="qf-files-toggle q-focus"
            onClick={onToggleSidebar}
            type="button"
          >
            <PanelLeft aria-hidden size={16} />
          </button>
        </Tooltip>
      )}
      <div className="qf-header-id">
        <div className="qf-header-title-row">
          <span className={cn("qf-state", stateClass(pr))}>
            <span className="qf-state-dot" />
            {stateLabel(pr)}
          </span>
          <h1 className="qf-pr-title" title={pr.title}>
            <TicketTitle
              onOpenTicket={onOpenTicket}
              title={pr.title}
              trackerBase={trackerBase}
            />
          </h1>
        </div>
        <div className="qf-pr-sub">
          <span className="qf-pr-num">#{pr.number}</span>
          <span className="q-dot">·</span>
          <span>{pr.repo}</span>
          <span className="q-dot">·</span>
          <Avatar name={pr.author} size={15} url={pr.authorAvatarUrl} />
          <span className="qf-header-author">{pr.author}</span>
          {!!pr.baseRef && !!pr.headRef && (
            <>
              <span className="q-dot">·</span>
              <span className="qf-branch">
                <BranchChip
                  label="Target branch · click to copy"
                  name={pr.baseRef}
                  onCopy={onCopyBranch}
                />
                <span className="qf-arrow">←</span>
                <BranchChip
                  label="PR branch · click to copy"
                  name={pr.headRef}
                  onCopy={onCopyBranch}
                />
              </span>
            </>
          )}
        </div>
      </div>

      <div className="qf-header-actions">
        <ReviewVerdicts
          approved={approved}
          changesRequested={changesRequested}
        />
        <Tooltip combo="i" label={infoTitle}>
          <button
            aria-label={infoTitle}
            aria-pressed={rightOpen}
            className="qf-info-btn q-focus"
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
          className="qf-submit q-focus"
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
 *  has no checks (state "none", or a state this build does not know) — the
 *  dot should stay quiet then. */
function ciDotClass(state: string | undefined): string | null {
  if (state === "success" || state === "failure" || state === "pending") {
    return `qf-ci-dot-${state}`;
  }
  return null;
}

function ciDotLabel(state: string | undefined): string {
  switch (state) {
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

function stateClass(pr: HeaderPullRequest): string {
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

function stateLabel(pr: HeaderPullRequest): string {
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
function BranchChip({
  name,
  label,
  onCopy,
}: {
  label: string;
  name: string;
  onCopy: (name: string) => void;
}) {
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
  const handleCopy = () => {
    onCopy(name);
    setCopied(true);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => setCopied(false), 1200);
  };
  return (
    <Tooltip
      anchorClassName="qf-branch-anchor"
      label={copied ? "Copied" : label}
    >
      <button
        className={cn("qf-branch-chip q-focus", copied && "qf-branch-copied")}
        onClick={handleCopy}
        type="button"
      >
        {copied ? (
          <Check aria-hidden size={11} />
        ) : (
          <GitBranch aria-hidden size={11} />
        )}
        <span className="qf-branch-name">{name}</span>
      </button>
    </Tooltip>
  );
}
