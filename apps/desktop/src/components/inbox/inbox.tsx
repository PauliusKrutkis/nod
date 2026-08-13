/**
 * Tabs hide when empty (and not active) so the bar reflects where work
 * actually is, and the digit hotkeys address what you can SEE: `1` is the
 * leftmost visible tab, not a fixed slot in TABS. A digit therefore never
 * summons an empty tab out of hiding, and the hints on the bar always read
 * 1, 2, 3 with no gaps. cycleTab walks the same visible list, falling back
 * to index 0 when the active tab is itself hidden. Watching repos is a
 * separate action (the "w" hotkey, command palette, and docked Watch button
 * all open the same dialog), so the Watching tab follows the same
 * visibility rule as every other tab. A hidden tab keeps a KEYLESS binding
 * so the command palette can still reach it — typing "watching" is an
 * explicit request, where a digit is positional.
 *
 * On cold start, if the active tab turns out empty, `autoTabSelected` guards
 * a one-shot correction to the first tab with content — a module-level flag
 * rather than a ref, since Inbox unmounts/remounts on every Esc-to-inbox
 * visit and re-running the correction on each remount would boomerang a
 * deliberate visit to an empty tab back to whichever tab has content.
 *
 * What is left here is the wiring: the inbox and subscribed queries, the
 * archive ledger, tab visibility and the hotkey scope. The views it arranges
 * — inbox-tabs, inbox-zero, inbox-detail and the pr-list-item rows — are
 * catalogued in @nod/ui, and the reading pane gets its markdown, tracker
 * base and link opener from this side of the boundary.
 */

import { InboxDetail } from "@nod/ui/inbox-detail";
import { InboxTabs } from "@nod/ui/inbox-tabs";
import { InboxZero } from "@nod/ui/inbox-zero";
import { Kbd } from "@nod/ui/kbd";
import { PRListItem } from "@nod/ui/pr-list-item";
import { Spinner } from "@nod/ui/spinner";
import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  CornerDownLeft,
  Eye,
  Link,
  Undo2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useInbox } from "../../hooks/use-inbox.ts";
import { prefetchPullRequest } from "../../hooks/use-pull-request-detail.ts";
import { useSubscribed } from "../../hooks/use-subscribed.ts";
import { useHotkeys } from "../../keyboard/use-hotkeys.ts";
import { openExternal } from "../../lib/open-external.ts";
import { useAppStore } from "../../store/app-store.ts";
import type { InboxData, InboxTabKey, PullRequest } from "../../types.ts";
import { prKey } from "../../types.ts";
import { Markdown } from "../markdown-loader.tsx";
import { WatchReposLoader } from "./watch-repos-loader.tsx";

const TABS: { key: InboxTabKey; label: string; hint: string }[] = [
  {
    hint: "PRs where your review was requested. PRs you opened appear under “Created”.",
    key: "reviewRequested",
    label: "Review requests",
  },
  { hint: "PRs assigned to you.", key: "assigned", label: "Assigned" },
  { hint: "PRs you opened.", key: "created", label: "Created" },
  {
    hint: "PRs that involve or mention you.",
    key: "involved",
    label: "Involved",
  },
  {
    hint: "Every open PR in the repositories you watch, involved or not.",
    key: "subscribed",
    label: "Watching",
  },
];

const EMPTY: InboxData = {
  assigned: { count: 0, prs: [] },
  created: { count: 0, prs: [] },
  involved: { count: 0, prs: [] },
  reviewRequested: { count: 0, prs: [] },
};

let autoTabSelected = false;

const keyFor = (pr: PullRequest) =>
  prKey({ name: pr.name, number: pr.number, owner: pr.owner });

const isHidden = (pr: PullRequest, at: string | undefined) =>
  !!at && new Date(pr.updatedAt).getTime() <= new Date(at).getTime();

function inboxZeroTitle(tab: InboxTabKey, activeTabLabel: string): string {
  if (tab === "reviewRequested") {
    return "All clear";
  }
  if (tab === "subscribed") {
    return "Not watching anything yet";
  }
  return `Nothing in “${activeTabLabel}”`;
}

export function Inbox() {
  const { data, isLoading, isError, error, refetch } = useInbox();

  const openReview = useAppStore((s) => s.openReview);
  const markSeen = useAppStore((s) => s.markSeen);
  const isUnread = useAppStore((s) => s.isUnread);

  const tab = useAppStore((s) => s.inboxTab);
  const setTab = useAppStore((s) => s.setInboxTab);
  const selectedKey = useAppStore((s) => s.inboxSelectedKey);
  const setSelectedKey = useAppStore((s) => s.setInboxSelectedKey);

  const listRef = useRef<HTMLDivElement>(null);
  const [listMode, setListMode] = useState<"keyboard" | "mouse">("mouse");
  const [showArchived, setShowArchived] = useState(false);

  const dismissed = useAppStore((s) => s.dismissed);
  const dismiss = useAppStore((s) => s.dismiss);
  const clearDismissed = useAppStore((s) => s.clearDismissed);
  const undoDismiss = useAppStore((s) => s.undoDismiss);
  const setToast = useAppStore((s) => s.setToast);

  const { data: subscribedData } = useSubscribed();
  const [watchOpen, setWatchOpen] = useState(false);

  const buckets = {
    ...(data ?? EMPTY),
    subscribed: subscribedData ?? { count: 0, prs: [] },
  };

  const archivedList = buckets[tab].prs.filter((pr) =>
    isHidden(pr, dismissed[keyFor(pr)])
  );
  const filtered = showArchived
    ? archivedList
    : buckets[tab].prs.filter((pr) => !isHidden(pr, dismissed[keyFor(pr)]));

  const visibleCounts = (() => {
    const m = {} as Record<InboxTabKey, number>;
    for (const t of TABS) {
      const bucket = buckets[t.key];
      const hidden = bucket.prs.filter((pr) =>
        isHidden(pr, dismissed[keyFor(pr)])
      ).length;
      m[t.key] = Math.max(0, bucket.count - hidden);
    }
    return m;
  })();

  const tabsLoaded = data !== null;
  const visibleTabs = TABS.filter(
    (t) => !tabsLoaded || visibleCounts[t.key] > 0 || t.key === tab
  );

  const inboxDataLoaded = data !== undefined && subscribedData !== undefined;
  useEffect(() => {
    if (autoTabSelected || !inboxDataLoaded) {
      return;
    }
    autoTabSelected = true;
    if (visibleCounts[tab] > 0) {
      return;
    }
    const firstNonEmpty = TABS.find((t) => visibleCounts[t.key] > 0);
    if (firstNonEmpty) {
      setTab(firstNonEmpty.key);
    }
  }, [inboxDataLoaded, visibleCounts, tab, setTab]);

  const selectedIndex = (() => {
    if (!selectedKey) {
      return 0;
    }
    const i = filtered.findIndex((pr) => keyFor(pr) === selectedKey);
    return i < 0 ? 0 : i;
  })();

  const openPR = (pr: PullRequest) => {
    setSelectedKey(keyFor(pr));
    markSeen(keyFor(pr), pr.updatedAt);
    openReview(pr.owner, pr.name, pr.number);
  };

  const open = (index: number) => {
    const pr = filtered[index];
    if (pr) {
      openPR(pr);
    }
  };

  const selectTab = (key: InboxTabKey) => {
    setTab(key);
    setSelectedKey(null);
  };

  const selectTabByKey = (key: string) => {
    const target = TABS.find((t) => t.key === key);
    if (target) {
      selectTab(target.key);
    }
  };

  const cycleTab = (dir: number) => {
    const order = visibleTabs.map((t) => t.key);
    if (order.length === 0) {
      return;
    }
    const i = order.indexOf(tab);
    const from = i < 0 ? 0 : i;
    selectTab(order[(from + dir + order.length) % order.length]);
  };

  const moveTo = (index: number) => {
    const pr = filtered[index];
    if (pr) {
      setSelectedKey(keyFor(pr));
    }
  };

  const next = () => {
    setListMode("keyboard");
    moveTo(Math.min(selectedIndex + 1, filtered.length - 1));
  };

  const prev = () => {
    setListMode("keyboard");
    moveTo(Math.max(selectedIndex - 1, 0));
  };

  const archiveSelected = () => {
    const pr = filtered[selectedIndex];
    if (!pr) {
      return;
    }
    const fallback = filtered[selectedIndex + 1] ?? filtered[selectedIndex - 1];
    setSelectedKey(fallback ? keyFor(fallback) : null);
    dismiss(keyFor(pr), pr.updatedAt);
    setToast({
      action: undoDismiss,
      actionLabel: "Undo",
      message: pr.title,
      note: "Back when it updates",
      title: "Archived",
    });
  };

  const restoreSelected = () => {
    const pr = filtered[selectedIndex];
    if (!pr) {
      return;
    }
    const fallback = filtered[selectedIndex + 1] ?? filtered[selectedIndex - 1];
    setSelectedKey(fallback ? keyFor(fallback) : null);
    clearDismissed(keyFor(pr));
    setToast({
      message: pr.title,
      note: "Back in your inbox",
      title: "Restored",
    });
  };

  const archiveOrRestoreSelected = () => {
    if (showArchived) {
      restoreSelected();
    } else {
      archiveSelected();
    }
  };

  const toggleArchived = () => {
    setShowArchived((v) => !v);
    setSelectedKey(null);
  };

  const undoArchive = () => {
    undoDismiss();
    setToast(null);
  };

  const copySelectedLink = () => {
    const pr = filtered[selectedIndex];
    if (!pr) {
      return;
    }
    navigator.clipboard?.writeText(pr.url).catch(() => undefined);
    setToast({ message: pr.url, title: "Copied PR link" });
  };

  const openSelected = () => {
    open(selectedIndex);
  };

  const openWatchDialog = () => {
    setWatchOpen(true);
  };

  const closeWatchDialog = () => {
    setWatchOpen(false);
  };

  const handleRetry = () => {
    refetch();
  };

  useInboxHotkeys({
    archiveSelected: archiveOrRestoreSelected,
    copySelectedLink,
    cycleTab,
    next,
    openSelected,
    openWatchDialog,
    prev,
    selectTab,
    toggleArchived,
    undoArchive,
    visibleTabs,
  });

  const activeTab = TABS.find((t) => t.key === tab) ?? TABS[0];
  const selectedPR = filtered[selectedIndex];

  const setInboxPaneVisible = useAppStore((s) => s.setInboxPaneVisible);
  const paneVisible =
    selectedPR !== undefined && !(isLoading && !data) && !(isError && !data);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-index="${selectedIndex}"]`
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  useEffect(() => {
    const timer = setTimeout(() => {
      for (const offset of [0, 1, -1]) {
        const pr = filtered[selectedIndex + offset];
        if (pr) {
          prefetchPullRequest(pr.owner, pr.name, pr.number);
        }
      }
    }, 180);
    return () => clearTimeout(timer);
  }, [selectedIndex, filtered]);

  useEffect(() => {
    setInboxPaneVisible(paneVisible);
  }, [paneVisible, setInboxPaneVisible]);
  useEffect(() => () => setInboxPaneVisible(false), [setInboxPaneVisible]);

  return (
    <div className="flex h-full flex-col">
      <InboxTabs
        activeKey={tab}
        archivedActive={showArchived}
        archivedCount={archivedList.length}
        onSelect={selectTabByKey}
        onToggleArchived={toggleArchived}
        onWatch={openWatchDialog}
        tabs={visibleTabs.map((t) => ({ ...t, count: visibleCounts[t.key] }))}
      />

      <InboxMainContent
        activeTab={activeTab}
        filtered={filtered}
        isUnread={isUnread}
        listMode={listMode}
        listRef={listRef}
        onOpenAt={open}
        onOpenWatch={openWatchDialog}
        onRetry={handleRetry}
        onSelectPr={setSelectedKey}
        onSetListMode={setListMode}
        selectedIndex={selectedIndex}
        selectedPR={selectedPR}
        showArchived={showArchived}
        tab={tab}
        view={inboxMainView(
          isLoading,
          isError,
          data !== null,
          filtered.length,
          error
        )}
      />

      <WatchReposLoader onClose={closeWatchDialog} open={watchOpen} />
    </div>
  );
}

function useInboxHotkeys({
  next,
  prev,
  openSelected,
  archiveSelected,
  undoArchive,
  toggleArchived,
  copySelectedLink,
  cycleTab,
  selectTab,
  openWatchDialog,
  visibleTabs,
}: {
  next: () => void;
  prev: () => void;
  openSelected: () => void;
  archiveSelected: () => void;
  undoArchive: () => void;
  toggleArchived: () => void;
  copySelectedLink: () => void;
  cycleTab: (dir: number) => void;
  selectTab: (key: InboxTabKey) => void;
  openWatchDialog: () => void;
  visibleTabs: typeof TABS;
}) {
  const cycleTabForward = (e: KeyboardEvent) => {
    cycleTab(e.shiftKey ? -1 : 1);
  };

  useHotkeys("inbox", [
    {
      description: "Next PR",
      group: "Navigation",
      icon: ArrowDown,
      keys: ["j", "down"],
      run: next,
    },
    {
      description: "Previous PR",
      group: "Navigation",
      icon: ArrowUp,
      keys: ["k", "up"],
      run: prev,
    },
    {
      description: "Open PR",
      group: "Navigation",
      icon: CornerDownLeft,
      keys: "enter",
      run: openSelected,
    },
    {
      description: "Archive until it updates",
      group: "Navigation",
      icon: Archive,
      keys: "e",
      run: archiveSelected,
    },
    {
      description: "Undo archive",
      group: "Navigation",
      icon: Undo2,
      keys: "z",
      run: undoArchive,
    },
    {
      description: "Show archived / back",
      group: "Navigation",
      icon: ArchiveRestore,
      keys: "u",
      run: toggleArchived,
    },
    {
      description: "Copy PR link",
      group: "Navigation",
      icon: Link,
      keys: "y",
      run: copySelectedLink,
    },
    {
      description: "Next / previous tab",
      group: "Tabs",
      icon: ArrowLeftRight,
      keys: "tab",
      run: cycleTabForward,
    },
    ...TABS.map((t) => {
      const slot = visibleTabs.indexOf(t);
      return {
        description: `Tab: ${t.label}`,
        group: "Tabs",
        keys: slot === -1 ? [] : String(slot + 1),
        run: () => selectTab(t.key),
      };
    }),
    {
      description: "Watch repositories…",
      group: "Tabs",
      icon: Eye,
      keys: "w",
      run: openWatchDialog,
    },
  ]);
}

function inboxMainView(
  isLoading: boolean,
  isError: boolean,
  hasData: boolean,
  filteredLength: number,
  error: unknown
):
  | { kind: "loading" }
  | { kind: "error"; error: unknown }
  | { kind: "empty" }
  | { kind: "list" } {
  if (isLoading && !hasData) {
    return { kind: "loading" };
  }
  if (isError && !hasData) {
    return { error, kind: "error" };
  }
  if (filteredLength === 0) {
    return { kind: "empty" };
  }
  return { kind: "list" };
}

function InboxMainContent({
  view,
  filtered,
  tab,
  activeTab,
  onOpenWatch,
  onRetry,
  listRef,
  listMode,
  onSetListMode,
  selectedIndex,
  selectedPR,
  onSelectPr,
  onOpenAt,
  isUnread,
  showArchived,
}: {
  view:
    | { kind: "loading" }
    | { kind: "error"; error: unknown }
    | { kind: "empty" }
    | { kind: "list" };
  filtered: PullRequest[];
  tab: InboxTabKey;
  activeTab: (typeof TABS)[number];
  onOpenWatch: () => void;
  onRetry: () => void;
  listRef: React.RefObject<HTMLDivElement | null>;
  listMode: "keyboard" | "mouse";
  onSetListMode: (mode: "keyboard" | "mouse") => void;
  selectedIndex: number;
  selectedPR: PullRequest | undefined;
  onSelectPr: (key: string | null) => void;
  onOpenAt: (index: number) => void;
  isUnread: (key: string, updatedAt: string) => boolean;
  showArchived: boolean;
}) {
  if (view.kind === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner label="Loading pull requests…" />
      </div>
    );
  }

  if (view.kind === "error") {
    return (
      <div className="flex flex-1 items-center justify-center px-6">
        <div className="max-w-md text-center">
          <p className="font-medium text-danger text-sm">
            Couldn't load pull requests
          </p>
          <p className="mt-1 break-words text-muted text-xs">
            {String(view.error)}
          </p>
          <button
            className="q-btn q-btn-quiet mt-3"
            onClick={onRetry}
            type="button"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (view.kind === "empty") {
    if (showArchived) {
      return (
        <InboxZero
          hint="Archive a PR with e and it waits here. Press u to come back."
          title={`No archived PRs in “${activeTab.label}”`}
        />
      );
    }
    return (
      <InboxZero
        action={
          tab === "subscribed"
            ? {
                kbd: "w",
                label: "Watch a repository",
                onClick: onOpenWatch,
              }
            : undefined
        }
        hint={
          tab === "reviewRequested"
            ? "Nothing is waiting on your review. New requests land here and pop a toast."
            : activeTab.hint
        }
        title={inboxZeroTitle(tab, activeTab.label)}
      />
    );
  }

  return (
    <InboxListPane
      activeTab={activeTab}
      filtered={filtered}
      isUnread={isUnread}
      listMode={listMode}
      listRef={listRef}
      onOpenAt={onOpenAt}
      onSelectPr={onSelectPr}
      onSetListMode={onSetListMode}
      selectedIndex={selectedIndex}
      selectedPR={selectedPR}
      showArchived={showArchived}
    />
  );
}

function InboxListPane({
  activeTab,
  filtered,
  listRef,
  listMode,
  onSetListMode,
  selectedIndex,
  selectedPR,
  onSelectPr,
  onOpenAt,
  isUnread,
  showArchived,
}: {
  activeTab: (typeof TABS)[number];
  filtered: PullRequest[];
  listRef: React.RefObject<HTMLDivElement | null>;
  listMode: "keyboard" | "mouse";
  onSetListMode: (mode: "keyboard" | "mouse") => void;
  selectedIndex: number;
  selectedPR: PullRequest | undefined;
  onSelectPr: (key: string | null) => void;
  onOpenAt: (index: number) => void;
  isUnread: (key: string, updatedAt: string) => boolean;
  showArchived: boolean;
}) {
  const handleListMouseMove = () => {
    if (listMode !== "mouse") {
      onSetListMode("mouse");
    }
  };

  const handleSelectPr = (pr: PullRequest) => {
    onSelectPr(keyFor(pr));
  };

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[1fr_380px] max-[900px]:grid-cols-1">
      <div
        aria-label={activeTab.label}
        className="q-inbox-list min-h-0 overflow-y-auto border-line border-r py-3"
        data-mode={listMode}
        onMouseMove={handleListMouseMove}
        ref={listRef}
        role="listbox"
      >
        {showArchived && (
          <div className="qi-archived-banner">
            <ArchiveRestore size={13} />
            <span>
              Archived · <Kbd combo="e" /> restores, <Kbd combo="u" /> returns
            </span>
          </div>
        )}
        {filtered.map((pr, i) => (
          <InboxPrRow
            index={i}
            key={pr.id}
            onOpenAt={onOpenAt}
            onSelectPr={handleSelectPr}
            pr={pr}
            selected={i === selectedIndex}
            unread={isUnread(keyFor(pr), pr.updatedAt)}
          />
        ))}
      </div>

      {selectedPR === undefined ? null : (
        <div className="hidden min-[900px]:contents">
          <InboxDetailPane archived={showArchived} pr={selectedPR} />
        </div>
      )}
    </div>
  );
}

function InboxPrRow({
  pr,
  index,
  selected,
  onSelectPr,
  onOpenAt,
  unread,
}: {
  pr: PullRequest;
  index: number;
  selected: boolean;
  onSelectPr: (pr: PullRequest) => void;
  onOpenAt: (index: number) => void;
  unread: boolean;
}) {
  const handleHover = () => {
    onSelectPr(pr);
    prefetchPullRequest(pr.owner, pr.name, pr.number);
  };

  const handleOpen = () => {
    onOpenAt(index);
  };

  return (
    <div data-index={index}>
      <PRListItem
        onHover={handleHover}
        onOpen={handleOpen}
        pr={pr}
        selected={selected}
        unread={unread}
      />
    </div>
  );
}

function InboxDetailPane({
  pr,
  archived,
}: {
  archived: boolean;
  pr: PullRequest;
}) {
  const trackerBase = useAppStore((s) =>
    s.activeAccountId ? s.issueTrackers[s.activeAccountId] : undefined
  );

  const renderBody = (body: string) => (
    <Markdown owner={pr.owner} repo={pr.name}>
      {body}
    </Markdown>
  );

  return (
    <InboxDetail
      archived={archived}
      onOpenTicket={openExternal}
      pr={pr}
      renderBody={renderBody}
      trackerBase={trackerBase}
    />
  );
}
