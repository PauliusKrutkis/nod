/**
 * One ledger queue row — a topic group awaiting review, wearing the inbox
 * row's exact anatomy: pr-list-item.css is imported as the single source of
 * the q-pr metrics, so the two lists can never drift apart. The title is
 * the topic name, the meta line carries the size of the sitting (regions ·
 * files · lines), the provenance chips capped at a few plus a count, and
 * the group's leading commit subject trailing as the story. The unread-dot
 * slot stays for column alignment with the PR list but never lights — a
 * queue group has no unread state — and a decayed approval shows as a
 * warning badge, the queue's "Δ since" made pill-shaped.
 *
 * Same interaction contract as PRListItem: a listbox option under a roving
 * tabindex the list owns, Enter/Space open it exactly as a click does, and
 * clicking blurs afterwards so a focused row cannot steal the arrows.
 */
import type { KeyboardEvent, MouseEvent } from "react";
import { Badge } from "../badge/badge.tsx";
import { cn } from "../cn/cn.ts";
import "../pr-list-item/pr-list-item.css";
import "./ledger-row.css";

const CHIP_CAP = 3;

export interface LedgerRowGroup {
  /** Feature topic, or the fallback bucket label (`#123`, short sha). */
  topic: string;
  /** The group's leading commit subject — its one-line story. */
  subject: string;
  regions: number;
  files: number;
  lines: number;
  /** Provenance chips beyond the topic itself: `#123`, short shas. */
  chips: string[];
  /** Short sha of a decayed approval: these lines changed since it. */
  deltaSince?: string | null;
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

export function LedgerRow({
  group,
  selected,
  onOpen,
  onHover,
}: {
  group: LedgerRowGroup;
  onHover?: () => void;
  onOpen: () => void;
  selected: boolean;
}) {
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen();
    }
  };

  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    onOpen();
    e.currentTarget.blur();
  };

  const chips = group.chips.slice(0, CHIP_CAP);
  const overflow = group.chips.length - chips.length;

  return (
    <div
      aria-selected={selected}
      className={cn("q-pr", selected && "q-pr-selected")}
      onClick={onClick}
      onKeyDown={onKeyDown}
      onMouseEnter={onHover}
      role="option"
      tabIndex={-1}
    >
      <span aria-hidden className="q-pr-dot" />

      <div className="q-pr-main">
        <div className="q-pr-head">
          <span className="q-pr-title q-pr-title-unread">{group.topic}</span>
          {group.deltaSince ? (
            <Badge tone="warning">Δ since {group.deltaSince}</Badge>
          ) : null}
        </div>
        <div className="q-pr-meta">
          <span className="q-lr-size q-mono">
            {plural(group.regions, "region")} · {plural(group.files, "file")} ·{" "}
            {group.lines} lines
          </span>
          {chips.length > 0 ? (
            <>
              <span className="q-dot">·</span>
              <span className="q-lr-chips q-mono">
                {chips.join(" ")}
                {overflow > 0 ? ` +${overflow}` : ""}
              </span>
            </>
          ) : null}
          {group.subject ? (
            <>
              <span className="q-dot">·</span>
              <span className="q-pr-cell">{group.subject}</span>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
