/**
 * Inline ask-about-code state (docs/AI.md): `a` anchors an AI note under the
 * cursor row — or above the first file when there is no cursor — and falls
 * through to the setup dialog when no key is configured (the keybind is the
 * discovery point). The target is frozen at open: the chip names exactly what
 * a question will ship with, so cursor moves after opening must not silently
 * change it. Exchanges and the in-flight mutation live in this hook, not in
 * the note component: the note renders inside the virtualized diff list, so
 * scrolling it out of frame unmounts it, and an answer must survive that.
 * The hook holds no refs of its own — callers pass the cursor/model snapshot
 * at the moment of the keypress, which also keeps it callable before the
 * render's list model exists.
 */
import { useMutation } from "@tanstack/react-query";
import type React from "react";
import { useState } from "react";
import { api } from "../lib/api.ts";
import { askTargetLabel, buildAskContext } from "../lib/ask-context.ts";
import {
  buildCursorMover,
  type CursorPos,
  type resolveLiveSelection,
} from "../lib/review-cursor.ts";
import {
  anchorLine,
  fileAnchorKey,
  type ReviewListModel,
} from "../lib/review-items.ts";
import { useAppStore } from "../store/app-store.ts";
import type { ChangedFile, PullRequest } from "../types.ts";

export interface AskExchange {
  answer: string | null;
  error: string | null;
  id: number;
  question: string;
}

/** Where the note renders; a null target means whole-PR scope. */
export interface AskTarget {
  anchor: string;
  fileIndex: number;
  startLine: number | null;
}

type LiveSelection = ReturnType<typeof resolveLiveSelection>;

export interface AskSnapshot {
  cursor: CursorPos | null;
  files: readonly ChangedFile[];
  model: ReviewListModel;
  selection: LiveSelection;
}

interface AskFreeze {
  cursor: CursorPos | null;
  selection: LiveSelection;
}

interface AskNoteState {
  exchanges: AskExchange[];
  focusSeq: number;
  freeze: AskFreeze;
  label: string;
  open: boolean;
  target: AskTarget | null;
}

const CLOSED: AskNoteState = {
  exchanges: [],
  focusSeq: 0,
  freeze: { cursor: null, selection: null },
  label: "",
  open: false,
  target: null,
};

let nextExchangeId = 0;

function freezeTarget(
  model: ReviewListModel,
  freeze: AskFreeze
): AskTarget | null {
  const sel = freeze.selection;
  if (sel) {
    const endItem = model.items[sel.toItem];
    const startItem = model.items[sel.fromItem];
    if (
      endItem?.kind === "row" &&
      endItem.anchor !== null &&
      startItem?.kind === "row" &&
      startItem.anchor !== null
    ) {
      return {
        anchor: endItem.anchor,
        fileIndex: sel.fileIndex,
        startLine: anchorLine(startItem.anchor),
      };
    }
  }
  if (freeze.cursor) {
    return {
      anchor: freeze.cursor.anchor,
      fileIndex: freeze.cursor.fileIndex,
      startLine: null,
    };
  }
  return null;
}

export function useAskNote() {
  const [state, setState] = useState<AskNoteState>(CLOSED);

  const settleLast = (patch: Partial<AskExchange>) => {
    setState((s) => {
      const last = s.exchanges.at(-1);
      if (!last || last.answer !== null || last.error !== null) {
        return s;
      }
      return {
        ...s,
        exchanges: [...s.exchanges.slice(0, -1), { ...last, ...patch }],
      };
    });
  };

  // react-doctor-disable-next-line query-mutation-missing-invalidation -- an ask is a one-shot completion, not cached server state; there is no query to invalidate
  const ask = useMutation({
    mutationFn: api.aiAsk,
    onError: (error) => settleLast({ error: String(error) }),
    onSuccess: (answer) => settleLast({ answer }),
  });

  const openAsk = (snap: AskSnapshot) => {
    api
      .getAiConfig()
      .then((aiInfo) => {
        if (!aiInfo.configured) {
          useAppStore.getState().openAiSetup();
          return;
        }
        const freeze: AskFreeze = {
          cursor: snap.cursor,
          selection: snap.selection,
        };
        const target = freezeTarget(snap.model, freeze);
        setState((s) => ({
          // Re-anchoring elsewhere starts a fresh conversation; pressing `a`
          // again at the same spot keeps it.
          exchanges:
            s.target?.anchor === target?.anchor &&
            s.target?.fileIndex === target?.fileIndex
              ? s.exchanges
              : [],
          focusSeq: s.focusSeq + 1,
          freeze,
          label: askTargetLabel({
            cursor: freeze.cursor,
            files: snap.files,
            model: snap.model,
            selection: freeze.selection,
          }),
          open: true,
          target,
        }));
      })
      .catch(() => useAppStore.getState().openAiSetup());
  };

  const closeAsk = () => {
    // Exchanges survive the close: an accidental Esc must not eat an answer.
    // Reopening at the same target resumes; elsewhere starts fresh (openAsk).
    setState((s) => ({ ...s, open: false }));
  };

  const submitAsk = (
    question: string,
    deps: {
      files: readonly ChangedFile[];
      model: ReviewListModel;
      pr: PullRequest;
    }
  ) => {
    if (ask.isPending) {
      return;
    }
    const context = buildAskContext({
      cursor: state.freeze.cursor,
      files: deps.files,
      model: deps.model,
      pr: deps.pr,
      selection: state.freeze.selection,
    });
    nextExchangeId += 1;
    setState((s) => ({
      ...s,
      exchanges: [
        ...s.exchanges,
        { answer: null, error: null, id: nextExchangeId, question },
      ],
    }));
    ask.mutate({ context, question });
  };

  return {
    askPending: ask.isPending,
    closeAsk,
    exchanges: state.exchanges,
    focusSeq: state.focusSeq,
    label: state.label,
    open: state.open,
    openAsk,
    submitAsk,
    target: state.target,
  };
}

/** The list-model slot the open note occupies, if it is line-anchored. */
export function askModelInput(
  askNote: ReturnType<typeof useAskNote>
): { anchor: string; fileIndex: number } | null {
  return askNote.open && askNote.target
    ? {
        anchor: askNote.target.anchor,
        fileIndex: askNote.target.fileIndex,
      }
    : null;
}

/** Bring the just-opened note into frame: its item when line-anchored, the
 *  top of the list for a whole-PR note (it renders above the first file). */
export function nudgeAskIntoView(args: {
  askNote: ReturnType<typeof useAskNote>;
  list: {
    nudgeItemIntoView: (itemIndex: number) => void;
    scroller: () => HTMLElement | null;
  } | null;
  model: ReviewListModel;
}) {
  if (!(args.askNote.open && args.list)) {
    return;
  }
  if (args.model.askItem !== null) {
    args.list.nudgeItemIntoView(args.model.askItem);
  } else if (args.askNote.target === null) {
    args.list.scroller()?.scrollTo({ behavior: "smooth", top: 0 });
  }
}

/**
 * Glue between the hook, the keyboard layer, and the list props, so the
 * review screen's own complexity budget stays spent on review concerns.
 * `askAi` flushes any rAF-queued cursor move first: `a` right after `j` must
 * see the cursor the user just placed. Also owns the promoted draft — the
 * answer handed to the composer — and clears it by wrapping `onCloseBox`:
 * a draft belongs to exactly one composer opening, and must not haunt the
 * next one after the box posts or cancels.
 */
export function useAskNoteWiring(args: {
  askNote: ReturnType<typeof useAskNote>;
  cursorMoverRefs: Parameters<typeof buildCursorMover>[0];
  cursorRef: React.RefObject<CursorPos | null>;
  filesRef: React.RefObject<readonly ChangedFile[]>;
  listCallbacks: {
    onCloseBox: (fileIndex: number, anchor: string) => void;
    onOpenBox: (fileIndex: number, anchor: string, startLine?: number) => void;
  };
  liveSelectionRef: React.RefObject<ReturnType<typeof resolveLiveSelection>>;
  modelRef: React.RefObject<ReviewListModel>;
  pr: PullRequest | null;
}) {
  const { askNote } = args;
  const [askDraft, setAskDraft] = useState<{
    key: string;
    text: string;
  } | null>(null);

  const askAi = () => {
    const moved = buildCursorMover(args.cursorMoverRefs).flushNow();
    askNote.openAsk({
      cursor: moved
        ? { anchor: moved.anchor, fileIndex: moved.fileIndex, kind: moved.kind }
        : args.cursorRef.current,
      files: args.filesRef.current,
      model: args.modelRef.current,
      selection: args.liveSelectionRef.current,
    });
  };

  const submit = (question: string) => {
    if (!args.pr) {
      return;
    }
    askNote.submitAsk(question, {
      files: args.filesRef.current,
      model: args.modelRef.current,
      pr: args.pr,
    });
  };

  const promote = (text: string) => {
    const target = askNote.target;
    if (!target) {
      return;
    }
    setAskDraft({
      key: fileAnchorKey(target.fileIndex, target.anchor),
      text,
    });
    askNote.closeAsk();
    args.listCallbacks.onOpenBox(
      target.fileIndex,
      target.anchor,
      target.startLine ?? undefined
    );
  };

  const onCloseBox = (fileIndex: number, anchor: string) => {
    setAskDraft(null);
    args.listCallbacks.onCloseBox(fileIndex, anchor);
  };

  const askNoteProps = askNote.open
    ? {
        exchanges: askNote.exchanges,
        focusSeq: askNote.focusSeq,
        label: askNote.label,
        onClose: askNote.closeAsk,
        onPromote: askNote.target === null ? null : promote,
        onSubmit: submit,
        pending: askNote.askPending,
        prScope: askNote.target === null,
      }
    : null;

  return { askAi, askDraft, askNoteProps, onCloseBox };
}
