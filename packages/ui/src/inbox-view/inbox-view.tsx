/**
 * The inbox screen: the tab strip over a list of pull requests beside the
 * reading pane for whichever one the cursor is on. A view rather than a
 * part — it owns the whole window, and the thing it exists to hold still is
 * the relationship between its three regions, which no per-component cell
 * can show.
 *
 * The rows are data, not a slot: a view whose every region is a slot proves
 * only that the fixture composed something, and the rows are the region
 * whose look actually drifts. The reading pane, the archived banner and the
 * short-inbox hint stay slots because each needs the host's own renderers
 * (markdown, a docs opener) that no fixture should have to fake — and
 * `body` replaces both columns outright for the states where there is no
 * list to show: nothing yet, nothing at all, or a failure.
 *
 * The two-column split and its 900px fold live here now. They were Tailwind
 * in the desktop app, which meant the arrangement this screen IS could not
 * be rendered from a fixture; the fold matters because 900px is the app's
 * declared minimum window (tauri.conf.json), so it is a width the reviewer
 * can really be at, not a hypothetical.
 */

import type { ReactNode, RefObject } from "react";
import { type InboxTab, InboxTabs } from "../inbox-tabs/inbox-tabs.tsx";
import {
  PRListItem,
  type PullRequestRow,
} from "../pr-list-item/pr-list-item.tsx";
import "./inbox-view.css";

export interface InboxViewRow {
  pr: PullRequestRow;
  selected: boolean;
  unread: boolean;
}

export interface InboxViewTabs {
  activeKey: string;
  archivedActive: boolean;
  archivedCount: number;
  items: readonly InboxTab[];
  onSelect: (key: string) => void;
  onToggleArchived: () => void;
  onWatch: () => void;
}

export function InboxView({
  tabs,
  rows,
  onOpenRow,
  onHoverRow,
  listLabel,
  /** "keyboard" suppresses the stale pointer hover so only the cursor is
   *  lit; the host sets it because only the host knows what moved last. */
  listMode,
  listRef,
  onListMouseMove,
  banner = null,
  hint = null,
  detail = null,
  body = null,
}: {
  tabs: InboxViewTabs;
  rows: readonly InboxViewRow[];
  onOpenRow: (index: number) => void;
  onHoverRow?: (index: number) => void;
  listLabel: string;
  listMode?: string;
  listRef?: RefObject<HTMLDivElement | null>;
  onListMouseMove?: (e: React.MouseEvent<HTMLDivElement>) => void;
  banner?: ReactNode;
  hint?: ReactNode;
  detail?: ReactNode;
  body?: ReactNode;
}) {
  return (
    <div className="qiv">
      <InboxTabs
        activeKey={tabs.activeKey}
        archivedActive={tabs.archivedActive}
        archivedCount={tabs.archivedCount}
        onSelect={tabs.onSelect}
        onToggleArchived={tabs.onToggleArchived}
        onWatch={tabs.onWatch}
        tabs={[...tabs.items]}
      />
      {body ?? (
        <div className="qiv-body">
          <div
            aria-label={listLabel}
            className="qiv-list"
            data-mode={listMode}
            onMouseMove={onListMouseMove}
            ref={listRef}
            role="listbox"
          >
            {banner}
            {rows.map((row, index) => (
              <div data-index={index} key={row.pr.number}>
                <PRListItem
                  onHover={onHoverRow ? () => onHoverRow(index) : undefined}
                  onOpen={() => onOpenRow(index)}
                  pr={row.pr}
                  selected={row.selected}
                  unread={row.unread}
                />
              </div>
            ))}
            {hint}
          </div>
          {detail === null ? null : <div className="qiv-detail">{detail}</div>}
        </div>
      )}
    </div>
  );
}
