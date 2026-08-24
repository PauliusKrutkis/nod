/**
 * The inbox's tab strip: one underlined tab per bucket with its count, then
 * the Watch and Archived controls pushed to the right.
 *
 * Which tabs exist is the host's decision — it hides empty buckets, so the
 * digit hint a tab wears is its position in THIS list (1 is the leftmost tab
 * on screen, never a fixed slot in some canonical order). That is why the
 * hint is derived here from the index instead of arriving on the tab: a list
 * that renders can never disagree with the hints painted on it.
 *
 * Counts render verbatim, including 0 — the host only passes a bucket it
 * wants shown, and hiding the number on the tab you are looking at would read
 * as a loading state.
 */
import { Archive, ArchiveRestore, Eye } from "lucide-react";
import { Tooltip } from "../tooltip/tooltip.tsx";
import "./inbox-tabs.css";

export interface InboxTab {
  count: number;
  hint: string;
  key: string;
  label: string;
}

function InboxTabButton({
  tab,
  slot,
  active,
  onSelect,
}: {
  active: boolean;
  onSelect: (key: string) => void;
  slot: number;
  tab: InboxTab;
}) {
  const onClick = () => {
    onSelect(tab.key);
  };

  return (
    <Tooltip combo={String(slot + 1)} label={tab.hint}>
      <button
        className="qi-tab"
        data-state={active ? "active" : "inactive"}
        onClick={onClick}
        type="button"
      >
        {tab.label}
        <span className="qi-tab-count">{tab.count}</span>
      </button>
    </Tooltip>
  );
}

export function InboxTabs({
  tabs,
  activeKey,
  onSelect,
  archivedActive,
  archivedCount,
  onToggleArchived,
  onWatch,
}: {
  activeKey: string;
  archivedActive: boolean;
  archivedCount: number;
  onSelect: (key: string) => void;
  onToggleArchived: () => void;
  onWatch: () => void;
  tabs: readonly InboxTab[];
}) {
  return (
    <div className="qi-tabs">
      {tabs.map((tab, slot) => (
        <InboxTabButton
          active={tab.key === activeKey}
          key={tab.key}
          onSelect={onSelect}
          slot={slot}
          tab={tab}
        />
      ))}
      <Tooltip
        anchorClassName="qi-tabs-end"
        combo="w"
        label="Watch repositories…"
      >
        <button className="qi-watch-button" onClick={onWatch} type="button">
          <Eye aria-hidden size={14} />
          Watch
        </button>
      </Tooltip>
      <Tooltip
        combo="u"
        label={
          archivedActive ? "Back to the inbox" : "Show archived pull requests"
        }
      >
        <button
          className="qi-archived-toggle"
          data-state={archivedActive ? "active" : "inactive"}
          onClick={onToggleArchived}
          type="button"
        >
          {archivedActive ? (
            <ArchiveRestore aria-hidden size={14} />
          ) : (
            <Archive aria-hidden size={14} />
          )}
          Archived
          {archivedCount > 0 ? (
            <span className="qi-tab-count">{archivedCount}</span>
          ) : null}
        </button>
      </Tooltip>
    </div>
  );
}
