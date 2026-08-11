/**
 * Titles with issue-tracker links: ticket IDs (SCR-2891, ABC-42, …) become
 * links to the configured tracker — mirroring what GitLab's Jira integration
 * renders in its own UI (the API only hands us plain text, so the base URL is
 * configured once per account: ⌘K → "Issue tracker…").
 *
 * Without a trackerBase there is nothing to link to, so the title renders as
 * plain text — the same fallback a title with no ticket-shaped run takes. The
 * host opens the URL: onOpenTicket keeps this side of the boundary free of
 * Tauri, and receives the resolved href rather than the raw id so the template
 * rules stay in one place.
 *
 * Segments carry their position because a title repeats separators verbatim
 * ("ABC-1 and ABC-2 and ABC-3" yields two identical text runs); keying the
 * spans by their text made React see duplicate siblings.
 */
import { Tooltip } from "../tooltip/tooltip.tsx";
import "./ticket-title.css";

const TICKET_RE = /\b([A-Z][A-Z0-9]{1,9}-\d+)\b/g;
const TRAILING_SLASH_RE = /\/$/;

/** `<base><id>`, or the {id} placeholder replaced when the template has one. */
function ticketUrl(base: string, id: string): string {
  return base.includes("{id}")
    ? base.replace("{id}", id)
    : `${base.replace(TRAILING_SLASH_RE, "")}/${id}`;
}

interface TitleSegment {
  kind: "text" | "ticket";
  position: number;
  value: string;
}

function parseTitleSegments(title: string): TitleSegment[] {
  const parts = title.split(TICKET_RE);
  if (parts.length === 1) {
    return [{ kind: "text", position: 0, value: title }];
  }
  const segments: TitleSegment[] = [];
  let expectTicket = false;
  for (const part of parts) {
    if (expectTicket) {
      segments.push({ kind: "ticket", position: segments.length, value: part });
    } else if (part) {
      segments.push({ kind: "text", position: segments.length, value: part });
    }
    expectTicket = !expectTicket;
  }
  return segments;
}

function TicketLink({
  id,
  trackerBase,
  onOpenTicket,
}: {
  id: string;
  trackerBase: string;
  onOpenTicket: (url: string) => void;
}) {
  const href = ticketUrl(trackerBase, id);
  const onClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    onOpenTicket(href);
  };
  return (
    <Tooltip label={href}>
      <button className="q-ticket" onClick={onClick} type="button">
        {id}
      </button>
    </Tooltip>
  );
}

export function TicketTitle({
  title,
  trackerBase,
  onOpenTicket,
}: {
  title: string;
  trackerBase?: string;
  onOpenTicket: (url: string) => void;
}) {
  if (!trackerBase) {
    return <>{title}</>;
  }
  const segments = parseTitleSegments(title);
  if (segments.length === 1 && segments[0]?.kind === "text") {
    return <>{title}</>;
  }
  return (
    <>
      {segments.map((segment) =>
        segment.kind === "ticket" ? (
          <TicketLink
            id={segment.value}
            key={`ticket-${segment.position}`}
            onOpenTicket={onOpenTicket}
            trackerBase={trackerBase}
          />
        ) : (
          <span key={`text-${segment.position}`}>{segment.value}</span>
        )
      )}
    </>
  );
}
