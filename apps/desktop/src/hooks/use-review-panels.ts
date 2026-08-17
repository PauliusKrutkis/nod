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

const DOCK_WIDTH_KEY = "nod:dockWidth";
const SIDEBAR_WIDTH_KEY = "nod:sidebarWidth";

function readDockWidth(): number | null {
  try {
    const width = Number(localStorage.getItem(DOCK_WIDTH_KEY));
    return Number.isFinite(width) && width >= 320 ? width : null;
  } catch {
    return null;
  }
}

function readSidebarWidth(): number | null {
  try {
    const width = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY));
    return Number.isFinite(width) && width >= 200 ? width : null;
  } catch {
    return null;
  }
}

function persistSidebarWidth(width: number): void {
  try {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(width));
  } catch {
    /* storage unavailable (private mode) — width just won't persist */
  }
}

function persistDockWidth(width: number | null): void {
  try {
    if (width === null) {
      localStorage.removeItem(DOCK_WIDTH_KEY);
    } else {
      localStorage.setItem(DOCK_WIDTH_KEY, String(width));
    }
  } catch {
    /* storage unavailable (private mode) — width just won't persist */
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
  const [dockWidth, setDockWidth] = useState(readDockWidth);

  const [sidebarWidth, setSidebarWidth] = useState(readSidebarWidth);

  const onSidebarResize = (width: number) => {
    setSidebarWidth(width);
    persistSidebarWidth(width);
  };

  const onDockResize = (width: number) => {
    setDockWidth(width);
    persistDockWidth(width);
  };

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

  return {
    chatFocusSeq,
    closeSidebarOverlay,
    dockWidth,
    onCloseRightPanel,
    onDockResize,
    onCloseSidebar,
    onSelectRightTab,
    onSidebarResize,
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
    sidebarWidth,
  };
}
