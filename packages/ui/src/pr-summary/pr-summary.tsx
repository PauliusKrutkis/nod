/**
 * The identity block at the top of the PR info drawer: number and ticket-aware
 * title, then the one-line vitals (author, file count, diff stat, when it last
 * moved) and the two handoffs — the checks pill and the link out to the host
 * that owns the pull request.
 *
 * What the "open" link should say is the host's call (GitHub or GitLab, read
 * off the URL there), so it arrives as `openLabel` rather than being sniffed
 * here; both openers are callbacks so no Tauri reaches this side.
 *
 * SummaryPullRequest is the package's own minimal shape, not an import from
 * the app: the desktop's richer PullRequest satisfies it structurally.
 */
import { ExternalLink } from "lucide-react";
import { Avatar } from "../avatar/avatar.tsx";
import { CiPill, type CiStatus } from "../ci-pill/ci-pill.tsx";
import { TicketTitle } from "../ticket-title/ticket-title.tsx";
import { formatAbsolute, formatRelativeTime } from "../time/time.ts";
import { Tooltip } from "../tooltip/tooltip.tsx";
import "./pr-summary.css";

/**
 * Author, number, time and url are optional for the same reason the
 * header's and row's are: the drawer also crowns things that are PR-shaped
 * without being PRs (a ledger topic has no forge number and no page to
 * open), and each absent field simply leaves its slot out.
 */
export interface SummaryPullRequest {
  additions: number;
  author?: string;
  authorAvatarUrl?: string | null;
  deletions: number;
  number?: number;
  title: string;
  updatedAt?: string;
  url?: string;
}

export function PrSummary({
  ci,
  fileCount,
  onOpenCiUrl,
  onOpenPr,
  onOpenTicket,
  onShowChecks,
  openLabel,
  pr,
  trackerBase,
}: {
  ci?: CiStatus;
  fileCount: number;
  onOpenCiUrl: (url: string) => void;
  onOpenPr: () => void;
  onOpenTicket: (url: string) => void;
  /** Routes the CI pill to the host's Checks tab instead of the browser. */
  onShowChecks?: () => void;
  openLabel: string;
  pr: SummaryPullRequest;
  trackerBase?: string;
}) {
  return (
    <section className="qf-drawer-summary">
      <div className="qf-drawer-pr">
        {pr.number !== undefined && (
          <span className="qf-drawer-num">#{pr.number}</span>
        )}
        <span className="qf-drawer-pr-title">
          <TicketTitle
            onOpenTicket={onOpenTicket}
            title={pr.title}
            trackerBase={trackerBase}
          />
        </span>
      </div>
      <div className="qf-drawer-meta">
        {pr.author !== undefined && (
          <>
            <Avatar name={pr.author} size={15} url={pr.authorAvatarUrl} />
            <span>{pr.author}</span>
            <span className="q-dot">·</span>
          </>
        )}
        <span>
          {fileCount} file{fileCount === 1 ? "" : "s"}
        </span>
        <span className="q-dot">·</span>
        <span className="qf-drawer-add">+{pr.additions}</span>
        <span className="qf-drawer-del">−{pr.deletions}</span>
        {pr.updatedAt !== undefined && (
          <>
            <span className="q-dot">·</span>
            <span
              className="qf-drawer-when"
              title={formatAbsolute(pr.updatedAt)}
            >
              {formatRelativeTime(pr.updatedAt)}
            </span>
          </>
        )}
      </div>
      <div className="qf-drawer-links">
        <CiPill
          ci={ci}
          onOpen={onShowChecks ? () => onShowChecks() : onOpenCiUrl}
        />
        {!!pr.url && (
          <Tooltip label={pr.url}>
            <button
              className="qf-drawer-link q-focus"
              onClick={onOpenPr}
              type="button"
            >
              <span className="qf-drawer-link-label">{openLabel}</span>
              <ExternalLink aria-hidden size={13} />
            </button>
          </Tooltip>
        )}
      </div>
    </section>
  );
}
