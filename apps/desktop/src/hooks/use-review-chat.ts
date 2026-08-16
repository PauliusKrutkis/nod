/**
 * The review chat's runtime (docs/AI.md § Second surface). Settled turns
 * live in the app store keyed by PR — they persist across restarts — while
 * the in-flight turn (streamed partial, tool-activity line) is hook state:
 * it exists only while the mutation runs and is folded into the store when
 * the turn settles. Deltas arrive on `ai-chat-delta`/`ai-chat-tool` keyed by
 * turnId and are batched per animation frame, the ask note's precedent, so
 * token-rate events never force token-rate re-renders.
 *
 * One turn in flight per chat. History replays the settled conversation:
 * user turns are rebuilt with their region blocks (the code a past question
 * was about must survive the round trip), errored assistant turns are
 * skipped. A cancelled turn is a stop, not a failure — whatever streamed is
 * kept as the answer, and nothing is kept if nothing arrived. Unmounting
 * (PR switch) cancels an in-flight turn so no orphan stream keeps burning
 * the provider.
 */

import type { ChatPanelTurn } from "@nod/ui/chat-panel";
import { useLatest } from "@nod/ui/use-latest";
import { useMutation } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import { api } from "../lib/api.ts";
import { useAppStore } from "../store/app-store.ts";
import {
  type AiAskContext,
  type ChangedFile,
  type ChatRegion,
  type ChatTurnRecord,
  type PullRequest,
  prKey,
} from "../types.ts";

interface LiveTurn {
  partial: string;
  toolNote: string | null;
  turnId: string;
}

const EMPTY_TURNS: ChatTurnRecord[] = [];

function regionBlock(region: ChatRegion): string {
  const range = region.lineRange ? ` (lines ${region.lineRange})` : "";
  return `Code from ${region.filePath}${range}:\n\`\`\`\n${region.code}\n\`\`\``;
}

/** The settled conversation as wire turns — region blocks rebuilt so the
 *  code a past question was about stays in the replay. */
function historyMessages(
  turns: readonly ChatTurnRecord[]
): { role: string; content: string }[] {
  const out: { role: string; content: string }[] = [];
  for (const turn of turns) {
    if (turn.kind === "user") {
      const blocks = turn.regions.map(regionBlock);
      out.push({ content: [...blocks, turn.text].join("\n\n"), role: "user" });
    } else if (turn.error === null && turn.text) {
      out.push({ content: turn.text, role: "assistant" });
    }
  }
  return out;
}

function chatContext(
  files: readonly ChangedFile[],
  pr: PullRequest
): AiAskContext {
  return {
    code: null,
    diffSummary: files
      .map((f) => `${f.filename} (+${f.additions} -${f.deletions})`)
      .join("\n"),
    filePath: null,
    headSha: pr.headSha,
    lineRange: null,
    owner: pr.owner,
    prBody: pr.body,
    prTitle: pr.title,
    repo: pr.repo,
  };
}

export function useReviewChat(args: {
  files: readonly ChangedFile[];
  pr: PullRequest;
}) {
  const keyValue = prKey(args.pr);
  const turns = useAppStore((s) => s.chatHistory[keyValue]) ?? EMPTY_TURNS;
  const appendChatTurn = useAppStore((s) => s.appendChatTurn);
  const [draft, setDraft] = useState("");
  const [live, setLive] = useState<LiveTurn | null>(null);
  const liveRef = useLatest(live);

  useEffect(() => {
    const pending = new Map<string, string>();
    let toolPending: { detail: string; turnId: string } | null = null;
    let flushFrame = 0;
    const flush = () => {
      flushFrame = 0;
      const batch = new Map(pending);
      pending.clear();
      const tool = toolPending;
      toolPending = null;
      setLive((l) => {
        if (!l) {
          return l;
        }
        const text = batch.get(l.turnId);
        const note = tool && tool.turnId === l.turnId ? tool.detail : null;
        if (text === undefined && note === null) {
          return l;
        }
        return {
          ...l,
          partial: text === undefined ? l.partial : l.partial + text,
          toolNote: note ?? (text === undefined ? l.toolNote : null),
        };
      });
    };
    const arm = () => {
      if (!flushFrame) {
        flushFrame = requestAnimationFrame(flush);
      }
    };
    const unDelta = listen<{ chatId: string; turnId: string; text: string }>(
      "ai-chat-delta",
      (event) => {
        pending.set(
          event.payload.turnId,
          (pending.get(event.payload.turnId) ?? "") + event.payload.text
        );
        arm();
      }
    );
    const unTool = listen<{ chatId: string; turnId: string; detail: string }>(
      "ai-chat-tool",
      (event) => {
        toolPending = {
          detail: event.payload.detail,
          turnId: event.payload.turnId,
        };
        arm();
      }
    );
    return () => {
      if (flushFrame) {
        cancelAnimationFrame(flushFrame);
      }
      unDelta.then((stop) => stop());
      unTool.then((stop) => stop());
    };
  }, []);

  // react-doctor-disable-next-line query-mutation-missing-invalidation -- a chat turn is a one-shot completion, not cached server state; there is no query to invalidate
  const chat = useMutation({
    mutationFn: api.aiChat,
    onError: (error, vars) => {
      const message = String(error);
      const partial =
        liveRef.current?.turnId === vars.turnId ? liveRef.current.partial : "";
      setLive(null);
      if (message === "cancelled") {
        if (partial) {
          appendChatTurn(keyValue, {
            error: null,
            id: vars.turnId,
            kind: "assistant",
            text: partial,
          });
        }
        return;
      }
      appendChatTurn(keyValue, {
        error: message,
        id: vars.turnId,
        kind: "assistant",
        text: "",
      });
    },
    onSuccess: (answer, vars) => {
      setLive(null);
      appendChatTurn(keyValue, {
        error: null,
        id: vars.turnId,
        kind: "assistant",
        text: answer,
      });
    },
  });

  const chatPendingRef = useLatest(chat.isPending);
  useEffect(
    () => () => {
      if (chatPendingRef.current) {
        api.aiChatCancel(keyValue).catch(() => undefined);
      }
    },
    [keyValue, chatPendingRef]
  );

  const send = () => {
    const text = draft.trim();
    if (!text || chat.isPending) {
      return;
    }
    const turnId = crypto.randomUUID();
    const history = historyMessages(turns);
    appendChatTurn(keyValue, {
      id: crypto.randomUUID(),
      kind: "user",
      regions: [],
      text,
    });
    setDraft("");
    setLive({ partial: "", toolNote: null, turnId });
    chat.mutate({
      chatId: keyValue,
      context: chatContext(args.files, args.pr),
      history,
      message: text,
      regions: [],
      turnId,
    });
  };

  const stop = () => {
    api.aiChatCancel(keyValue).catch(() => undefined);
  };

  const panelTurns: ChatPanelTurn[] = [
    ...turns.map((turn): ChatPanelTurn => {
      if (turn.kind === "user") {
        return {
          id: turn.id,
          kind: "user",
          regions: turn.regions,
          text: turn.text,
        };
      }
      return {
        error: turn.error,
        id: turn.id,
        kind: "assistant",
        partial: "",
        text: turn.error === null ? turn.text : null,
        toolNote: null,
      };
    }),
    ...(live
      ? [
          {
            error: null,
            id: live.turnId,
            kind: "assistant" as const,
            partial: live.partial,
            text: null,
            toolNote: live.toolNote,
          },
        ]
      : []),
  ];

  return {
    draft,
    panelTurns,
    pending: chat.isPending,
    send,
    setDraft,
    stop,
  };
}
