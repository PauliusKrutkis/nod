/**
 * Panel state for the review screen: the right panel (Info | Chat tabs),
 * the file sidebar (inline column vs overlay drawer under the compact media
 * query), and the panel's persisted wide preference. The compact flag comes
 * straight from matchMedia via useSyncExternalStore; crossing the breakpoint
 * resets the sidebar to its default for that mode during render. Tab
 * semantics: `i` opens Info (or switches to it from Chat; closes from Info),
 * the chat toggle mirrors that for Chat, and opening Chat bumps chatFocusSeq
 * so the composer takes focus.
 */

import { useLatest } from "@nod/ui/use-latest";
import { useState, useSyncExternalStore } from "react";

/** Below this viewport width the 300px file tree stops being a push column and
 *  becomes an overlay drawer, so the diff keeps its full width on small windows
 *  and under high webview zoom (which shrinks the effective CSS width). */
const SIDEBAR_COMPACT_QUERY = "(max-width: 1024px)";

function getSidebarCompactSnapshot(): boolean {
  return window.matchMedia(SIDEBAR_COMPACT_QUERY).matches;
}

function getSidebarCompactServerSnapshot(): boolean {
  return false;
}

function subscribeSidebarCompact(onStoreChange: () => void): () => void {
  const mq = window.matchMedia(SIDEBAR_COMPACT_QUERY);
  mq.addEventListener("change", onStoreChange);
  return () => mq.removeEventListener("change", onStoreChange);
}

const DRAWER_WIDE_KEY = "nod:drawerWide";

// TODO: extract a useLocalStorage hook when a second persisted UI pref lands (separate PR).
function readDrawerWide(): boolean {
  try {
    return localStorage.getItem(DRAWER_WIDE_KEY) === "1";
  } catch {
    return false;
  }
}

function persistDrawerWide(wide: boolean): void {
  try {
    localStorage.setItem(DRAWER_WIDE_KEY, wide ? "1" : "0");
  } catch {
    // storage unavailable (private mode) — width just won't persist
  }
}

export function useReviewPanels() {
  const [rightOpen, setRightOpen] = useState(false);
  const rightOpenRef = useLatest(rightOpen);
  const [rightTab, setRightTab] = useState<"info" | "chat">("info");
  const rightTabRef = useLatest(rightTab);
  const [chatFocusSeq, setChatFocusSeq] = useState(0);
  const sidebarCompact = useSyncExternalStore(
    subscribeSidebarCompact,
    getSidebarCompactSnapshot,
    getSidebarCompactServerSnapshot
  );
  const [sidebarOpen, setSidebarOpen] = useState(
    () => !getSidebarCompactSnapshot()
  );
  const [prevSidebarCompact, setPrevSidebarCompact] = useState(sidebarCompact);
  if (prevSidebarCompact !== sidebarCompact) {
    setPrevSidebarCompact(sidebarCompact);
    setSidebarOpen(!sidebarCompact);
  }
  const sidebarOverlayOpen = sidebarCompact && sidebarOpen;
  const sidebarOverlayOpenRef = useLatest(sidebarOverlayOpen);
  const [drawerWide, setDrawerWide] = useState(readDrawerWide);

  const onToggleRightPanel = () => {
    if (!rightOpenRef.current) {
      setRightTab("info");
      setRightOpen(true);
      return;
    }
    if (rightTabRef.current === "chat") {
      setRightTab("info");
      return;
    }
    setRightOpen(false);
  };

  const openChatTab = () => {
    setRightTab("chat");
    setRightOpen(true);
    setChatFocusSeq((s) => s + 1);
  };

  const onSelectRightTab = (id: string) => {
    if (id === "chat") {
      openChatTab();
      return;
    }
    setRightTab("info");
  };

  const onCloseRightPanel = () => {
    setRightOpen(false);
  };

  const onToggleSidebar = () => {
    setSidebarOpen((open) => !open);
  };

  const onCloseSidebar = () => {
    setSidebarOpen(false);
  };

  const closeSidebarOverlay = () => {
    if (sidebarOverlayOpenRef.current) {
      setSidebarOpen(false);
    }
  };

  const onToggleDrawerWide = () => {
    if (!rightOpenRef.current) {
      setRightOpen(true);
      return;
    }
    const next = !drawerWide;
    setDrawerWide(next);
    persistDrawerWide(next);
  };

  return {
    chatFocusSeq,
    closeSidebarOverlay,
    drawerWide,
    onCloseRightPanel,
    onCloseSidebar,
    onSelectRightTab,
    onToggleDrawerWide,
    onToggleRightPanel,
    onToggleSidebar,
    openChatTab,
    rightOpen,
    rightOpenRef,
    rightTab,
    rightTabRef,
    setRightOpen,
    setSidebarOpen,
    sidebarCompact,
    sidebarOpen,
    sidebarOverlayOpen,
    sidebarOverlayOpenRef,
  };
}
