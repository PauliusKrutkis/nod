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
 *
 * The stack chip sits beside the base chip because the stack fact is about
 * the base branch. It is a summoned menu in the model-picker's selection
 * model: the chip keeps DOM focus, rows are never focus stops, ↑↓ move
 * `aria-activedescendant`, Enter opens the active PR and Escape or blur
 * closes. The count is of the detected chain only — the host is never asked
 * how long the stack "really" is, so "2 of 3" claims exactly what the inbox
 * can see. Choosing the entry you are already on just closes the menu.
 */
import { Check, GitBranch, Layers, PanelLeft } from "lucide-react";
import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
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

export interface StackEntryView {
  current: boolean;
  number: number;
  title: string;
}

export interface StackView {
  entries: StackEntryView[];
  position: number;
}

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

/** One empty list for every "nobody yet" default: a fresh `[]` in a default
 *  parameter is a new identity on every render, which defeats the memo the
 *  header is wrapped in. */
const NO_REVIEWERS: readonly Reviewer[] = [];

export function ReviewHeader({
  approved = NO_REVIEWERS,
  changesRequested = NO_REVIEWERS,
  ciState,
  convoCount = 0,
  onCopyBranch,
  onOpenStackEntry,
  onOpenSubmit,
  onOpenTicket,
  onToggleRightPanel,
  onToggleSidebar,
  pendingCount = 0,
  pr,
  rightOpen = false,
  showSidebarToggle = false,
  sidebarOpen = false,
  stack = null,
  trackerBase,
}: {
  approved?: readonly Reviewer[];
  changesRequested?: readonly Reviewer[];
  ciState?: string;
  convoCount?: number;
  onCopyBranch: (name: string) => void;
  onOpenStackEntry?: (number: number) => void;
  onOpenSubmit: () => void;
  onOpenTicket: (url: string) => void;
  onToggleRightPanel: () => void;
  onToggleSidebar: () => void;
  pendingCount?: number;
  pr: HeaderPullRequest;
  rightOpen?: boolean;
  showSidebarToggle?: boolean;
  sidebarOpen?: boolean;
  stack?: StackView | null;
  trackerBase?: string;
}) {
  const ciDot = ciDotClass(ciState);
  const infoTitle = ciDot
    ? `PR info & checks · ${ciDotLabel(ciState)}`
    : "PR description & conversation";

  return (
    <header className="qf-header">
      {showSidebarToggle && (
        <Tooltip combo="mod+b" label="Show files">
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
                {stack && stack.entries.length > 1 && (
                  <StackChip onOpenEntry={onOpenStackEntry} stack={stack} />
                )}
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

/** The stack chip and its summoned menu: "2 of 3" opens the detected chain in
 *  merge order, bottom of the stack first, and picking a row navigates there. */
function StackChip({
  onOpenEntry,
  stack,
}: {
  onOpenEntry?: (number: number) => void;
  stack: StackView;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(stack.position - 1);
  const listId = useId();
  const rows = stack.entries;
  const activeIndex = Math.min(active, rows.length - 1);

  const openMenu = () => {
    setActive(stack.position - 1);
    setOpen(true);
  };

  const pick = (entry: StackEntryView) => {
    setOpen(false);
    if (!entry.current) {
      onOpenEntry?.(entry.number);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive(Math.min(activeIndex + 1, rows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(Math.max(activeIndex - 1, 0));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const entry = rows[activeIndex];
      if (entry) {
        pick(entry);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    }
  };

  const label = `${stack.position} of ${rows.length}`;
  return (
    <span className="qf-stack">
      <Tooltip
        anchorClassName="qf-branch-anchor"
        label={`Stacked pull requests · ${label}`}
      >
        <button
          aria-activedescendant={
            open ? `${listId}-${rows[activeIndex]?.number}` : undefined
          }
          aria-controls={open ? listId : undefined}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-label={`Stacked pull requests · ${label}`}
          className={cn("qf-branch-chip q-focus", open && "qf-stack-open")}
          onBlur={() => setOpen(false)}
          onClick={() => (open ? setOpen(false) : openMenu())}
          onKeyDown={onKeyDown}
          role="combobox"
          type="button"
        >
          <Layers aria-hidden size={11} />
          <span className="qf-branch-name">{label}</span>
        </button>
      </Tooltip>
      {open && (
        <div className="qf-stack-menu" id={listId} role="listbox">
          {rows.map((entry, i) => (
            <button
              aria-selected={i === activeIndex}
              className={cn(
                "qf-stack-opt",
                i === activeIndex && "qf-stack-opt-on"
              )}
              id={`${listId}-${entry.number}`}
              key={entry.number}
              onClick={() => pick(entry)}
              onMouseDown={preventFocusLoss}
              onMouseMove={() => setActive(i)}
              role="option"
              tabIndex={-1}
              type="button"
            >
              <span className="qf-stack-ordinal">{i + 1}</span>
              <span className="qf-stack-num">#{entry.number}</span>
              <span className="qf-stack-title">{entry.title}</span>
              {entry.current && (
                <Check aria-hidden className="qf-stack-here" size={11} />
              )}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

function preventFocusLoss(e: { preventDefault: () => void }) {
  e.preventDefault();
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
