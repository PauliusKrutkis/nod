import { Avatar } from "@nod/ui/avatar";
import { Tooltip } from "@nod/ui/tooltip";
import { Check, X } from "lucide-react";
import { cn } from "../../lib/cn.ts";
import { aggregateReviewVerdicts, type Reviewer } from "../../lib/reviews.ts";
import type { ReviewSummary } from "../../types.ts";

const MAX_FACES = 3;

/**
 * Header verdict summary: who approves and who requests changes, as two quiet
 * pills each fronted by the reviewers' faces. Renders nothing until at least
 * one reviewer has cast a verdict, so a PR with no reviews stays silent.
 *
 * The reviewer list is a hover tooltip plus an aria-label, deliberately not a
 * tab stop: the pill reports state and has nothing to activate, so making it
 * focusable would add a keyboard stop that does nothing in a keyboard-first
 * app.
 */
export function ReviewVerdicts({ reviews }: { reviews: ReviewSummary[] }) {
  const { approved, changesRequested } = aggregateReviewVerdicts(reviews);
  if (approved.length === 0 && changesRequested.length === 0) {
    return null;
  }
  return (
    <div className="qf-verdicts">
      {changesRequested.length > 0 && (
        <VerdictPill kind="changes" reviewers={changesRequested} />
      )}
      {approved.length > 0 && (
        <VerdictPill kind="approved" reviewers={approved} />
      )}
    </div>
  );
}

function VerdictPill({
  kind,
  reviewers,
}: {
  kind: "approved" | "changes";
  reviewers: Reviewer[];
}) {
  const label = kind === "approved" ? "Approved" : "Changes requested";
  const faces = reviewers.slice(0, MAX_FACES);
  const overflow = reviewers.length - faces.length;
  const names = reviewers.map((r) => r.user).join(", ");
  return (
    <Tooltip label={`${label} · ${names}`}>
      <span
        aria-label={`${label} · ${names}`}
        className={cn(
          "qf-verdict",
          kind === "approved" ? "qf-verdict-approved" : "qf-verdict-changes"
        )}
        role="img"
      >
        {kind === "approved" ? (
          <Check aria-hidden size={12} strokeWidth={2.75} />
        ) : (
          <X aria-hidden size={12} strokeWidth={2.75} />
        )}
        <span className="qf-verdict-faces">
          {faces.map((r) => (
            <Avatar
              key={r.user}
              name={r.user}
              silent
              size={16}
              url={r.userAvatarUrl}
            />
          ))}
          {overflow > 0 && <span className="qf-verdict-more">+{overflow}</span>}
        </span>
      </span>
    </Tooltip>
  );
}
