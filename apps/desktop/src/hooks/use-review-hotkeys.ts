/**
 * The review screen's hotkey table: one binding literal covering navigation,
 * selection, comments, find, occurrences, files, panels and submit, registered
 * on the "review" scope. Callbacks and refs come in via config so the table
 * itself stays a contiguous, order-preserving literal.
 */
import {
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  Check,
  CheckCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronsDown,
  ChevronsDownUp,
  ChevronsUp,
  Copy,
  ExternalLink,
  FileCode,
  FileSearch,
  Inbox,
  Info,
  Link,
  MessageSquare,
  MessageSquarePlus,
  PanelLeft,
  PanelRightOpen,
  Pencil,
  Search,
  Send,
  Sparkles,
  TextSearch,
  Trash2,
} from "lucide-react";
import type React from "react";
import type { Binding } from "../keyboard/types.ts";
import { useHotkeys } from "../keyboard/use-hotkeys.ts";
import type { OccState } from "../lib/code-dom.ts";
import { buildCursorMover, type LineSelection } from "../lib/review-cursor.ts";
import { buildOccNav } from "../lib/review-occurrences.ts";

export function useReviewHotkeys(config: {
  askAi: () => void;
  askOpenRef: React.RefObject<boolean>;
  closeAsk: () => void;
  closeFind: () => void;
  commentAtCursor: () => void;
  commentOnPr: () => void;
  copyFilePath: () => void;
  copyLink: () => void;
  cursorMoverRefs: Parameters<typeof buildCursorMover>[0];
  cycleFile: (dir: number) => void;
  editActiveThreadComment: () => void;
  discardPendingAtCursor: () => void;
  extendSelection: (delta: 1 | -1) => void;
  findOpen: boolean;
  findOpenRef: React.RefObject<boolean>;
  findStep: (dir: 1 | -1) => void;
  goInbox: () => void;
  goToComment: (delta: number) => void;
  moveCursorFast: (delta: 1 | -1, isRepeat: boolean) => void;
  markViewedAndNext: () => void;
  occNavRefs: Parameters<typeof buildOccNav>[0];
  occSpec: OccState | null;
  openFind: () => void;
  openPrFiles: () => void;
  openSubmit: () => void;
  pageScroll: (dir: number) => void;
  prevFile: () => void;
  replyToActiveThreadOrNextFile: () => void;
  resolveActiveThread: () => void;
  closeSidebar: () => void;
  rightOpenRef: React.RefObject<boolean>;
  selectionRef: React.RefObject<LineSelection | null>;
  setPrSearch: (mode: null | "files" | "text") => void;
  setRightOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setSelection: (s: LineSelection | null) => void;
  sidebarOverlayOpenRef: React.RefObject<boolean>;
  toggleActiveThread: () => void;
  toggleDrawerWide: () => void;
  toggleFullFile: () => void;
  toggleSidebar: () => void;
  toggleViewedFile: () => void;
}): void {
  const bindings = [
    {
      description: "Next line",
      group: "Navigation",
      icon: ArrowDown,
      keys: ["j", "down"],
      run: (e: KeyboardEvent) => {
        config.setSelection(null);
        buildCursorMover(config.cursorMoverRefs).move(1, e.repeat);
      },
    },
    {
      description: "Previous line",
      group: "Navigation",
      icon: ArrowUp,
      keys: ["k", "up"],
      run: (e: KeyboardEvent) => {
        config.setSelection(null);
        buildCursorMover(config.cursorMoverRefs).move(-1, e.repeat);
      },
    },
    {
      description: "Extend selection down",
      group: "Comments",
      icon: ArrowDown,
      keys: ["shift+j", "shift+down"],
      run: () => config.extendSelection(1),
    },
    {
      description: "Extend selection up",
      group: "Comments",
      icon: ArrowUp,
      keys: ["shift+k", "shift+up"],
      run: () => config.extendSelection(-1),
    },
    {
      description: "Comment on line / selection",
      group: "Comments",
      icon: MessageSquarePlus,
      keys: "c",
      run: config.commentAtCursor,
    },
    {
      description: "Comment on the pull request",
      group: "Comments",
      icon: MessageSquarePlus,
      keys: "shift+c",
      run: config.commentOnPr,
    },
    {
      description: "Reply to comment / next file",
      group: "Files",
      icon: ChevronRight,
      keys: ["r"],
      run: config.replyToActiveThreadOrNextFile,
    },
    {
      description: "Previous file",
      group: "Files",
      icon: ChevronLeft,
      keys: ["t"],
      run: config.prevFile,
    },
    {
      description: "Fast down",
      group: "Navigation",
      icon: ChevronsDown,
      keys: "f",
      run: (e: KeyboardEvent) => {
        config.setSelection(null);
        config.moveCursorFast(1, e.repeat);
      },
    },
    {
      description: "Fast up",
      group: "Navigation",
      icon: ChevronsUp,
      keys: "g",
      run: (e: KeyboardEvent) => {
        config.setSelection(null);
        config.moveCursorFast(-1, e.repeat);
      },
    },
    {
      description: "Cycle files",
      group: "Files",
      icon: ArrowLeftRight,
      keys: "tab",
      run: (e: KeyboardEvent) => config.cycleFile(e.shiftKey ? -1 : 1),
    },
    {
      description: "Page down",
      group: "Navigation",
      icon: ChevronsDown,
      keys: ["space", "pagedown"],
      run: () => config.pageScroll(1),
    },
    {
      description: "Page up",
      group: "Navigation",
      icon: ChevronsUp,
      keys: ["pageup"],
      run: () => config.pageScroll(-1),
    },
    {
      description: "Next comment",
      group: "Comments",
      icon: MessageSquare,
      keys: "q",
      run: () => config.goToComment(1),
    },
    {
      description: "Previous comment",
      group: "Comments",
      icon: MessageSquare,
      keys: "w",
      run: () => config.goToComment(-1),
    },
    {
      description: "Resolve / unresolve comment",
      group: "Comments",
      icon: CheckCircle2,
      keys: "x",
      run: (e: KeyboardEvent) => {
        if (e.repeat) {
          return;
        }
        config.resolveActiveThread();
      },
    },
    {
      description: "Edit your comment",
      group: "Comments",
      icon: Pencil,
      keys: "shift+e",
      run: config.editActiveThreadComment,
    },
    {
      description: "Discard pending comment",
      group: "Comments",
      icon: Trash2,
      keys: "shift+d",
      run: (e: KeyboardEvent) => {
        if (e.repeat) {
          return;
        }
        config.discardPendingAtCursor();
      },
    },
    {
      description: "Expand / collapse comment",
      group: "Comments",
      icon: ChevronsDownUp,
      keys: "z",
      run: config.toggleActiveThread,
    },
    {
      description: "Mark viewed & next",
      group: "Files",
      icon: CheckCheck,
      keys: "e",
      run: config.markViewedAndNext,
    },
    {
      description: "Toggle file viewed",
      group: "Files",
      icon: Check,
      keys: "v",
      run: config.toggleViewedFile,
    },
    {
      description: "Expand full file",
      group: "Files",
      icon: FileCode,
      keys: "shift+v",
      run: config.toggleFullFile,
    },
    {
      description: "Toggle file tree",
      group: "Files",
      icon: PanelLeft,
      keys: "b",
      run: config.toggleSidebar,
    },
    {
      description: "Submit review",
      group: "Review",
      icon: Send,
      keys: "s",
      run: config.openSubmit,
    },
    {
      description: "Ask about code (AI)",
      group: "General",
      icon: Sparkles,
      keys: "a",
      run: config.askAi,
    },
    {
      description: "Open files in the browser",
      group: "General",
      icon: ExternalLink,
      keys: "o",
      run: config.openPrFiles,
    },
    {
      description: "Copy PR link",
      group: "General",
      icon: Link,
      keys: "y",
      run: config.copyLink,
    },
    {
      description: "Copy file path",
      group: "Files",
      icon: Copy,
      keys: "mod+shift+c",
      run: config.copyFilePath,
    },
    {
      description: "Toggle info panel",
      group: "General",
      icon: Info,
      keys: "i",
      run: () => config.setRightOpen((open) => !open),
    },
    {
      description: "Widen info panel",
      group: "General",
      icon: PanelRightOpen,
      keys: "shift+i",
      run: config.toggleDrawerWide,
    },
    {
      description: "Find a file",
      group: "Navigation",
      icon: FileSearch,
      keys: "mod+t",
      run: () => config.setPrSearch("files"),
    },
    {
      description: "Search code",
      group: "Navigation",
      icon: Search,
      keys: "mod+r",
      run: () => config.setPrSearch("text"),
    },
    {
      description: "Find in diff",
      group: "Navigation",
      icon: TextSearch,
      keys: "mod+f",
      run: config.openFind,
    },
    ...(config.findOpen
      ? ([
          {
            description: "Next find match",
            hidden: true,
            keys: ["enter", "f3"],
            run: (e: KeyboardEvent) => config.findStep(e.shiftKey ? -1 : 1),
          },
          {
            description: "Next find match",
            hidden: true,
            keys: "mod+g",
            run: (e: KeyboardEvent) => config.findStep(e.shiftKey ? -1 : 1),
          },
        ] satisfies Binding[])
      : []),
    ...(config.occSpec
      ? ([
          {
            description: "Next occurrence",
            hidden: true,
            keys: "n",
            run: () => buildOccNav(config.occNavRefs).step(1),
          },
          {
            description: "Previous occurrence",
            hidden: true,
            keys: "p",
            run: () => buildOccNav(config.occNavRefs).step(-1),
          },
        ] satisfies Binding[])
      : []),
    {
      description: "Close panel / back to inbox",
      group: "Navigation",
      icon: Inbox,
      keys: "esc",
      run: () => {
        if (config.selectionRef.current) {
          config.setSelection(null);
        } else if (config.findOpenRef.current) {
          config.closeFind();
        } else if (config.sidebarOverlayOpenRef.current) {
          config.closeSidebar();
        } else if (config.askOpenRef.current) {
          config.closeAsk();
        } else if (config.rightOpenRef.current) {
          config.setRightOpen(false);
        } else {
          config.goInbox();
        }
      },
    },
  ];
  useHotkeys("review", bindings);
}
