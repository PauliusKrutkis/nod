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

import { matchCanned } from "@nod/ui/canned-suggestions";
import type { ChatPanelTurn, ChatSuggestionsState } from "@nod/ui/chat-panel";
import { useLatest } from "@nod/ui/use-latest";
import { useMutation, useQuery } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import { api } from "../lib/api.ts";
import { buildChatDiffs } from "../lib/chat-diffs.ts";
import { buildCommentableRanges } from "../lib/commentable-ranges.ts";
import { useAppStore } from "../store/app-store.ts";
import {
  type AiAskContext,
  type ChangedFile,
  type ChatRegion,
  type ChatThread,
  type ChatTurnRecord,
  type PullRequest,
  prKey,
} from "../types.ts";

interface LiveTurn {
  deltas: number;
  partial: string;
  threadId: string;
  toolNote: string | null;
  turnId: string;
}

const EMPTY_TURNS: ChatTurnRecord[] = [];
const EMPTY_THREADS: ChatThread[] = [];

/** A thread's display name: its opening message, tightly trimmed. */
function threadTitle(thread: ChatThread): string {
  const first = thread.turns.find((t) => t.kind === "user");
  if (!first || first.kind !== "user") {
    return "New chat";
  }
  const line = first.text.split("\n")[0].trim();
  return line.length > 40 ? `${line.slice(0, 40)}…` : line;
}

const CHAT_MODEL_KEY = "nod:chatModel:v1";

function readChatModel(): string | null {
  try {
    return localStorage.getItem(CHAT_MODEL_KEY);
  } catch {
    return null;
  }
}

function persistChatModel(id: string | null): void {
  try {
    if (id === null) {
      localStorage.removeItem(CHAT_MODEL_KEY);
    } else {
      localStorage.setItem(CHAT_MODEL_KEY, id);
    }
  } catch {
    /* storage unavailable (private mode) — the pick just won't persist */
  }
}

function regionBlock(region: ChatRegion): string {
  if (!region.filePath) {
    return `Pasted code:\n\`\`\`\n${region.code}\n\`\`\``;
  }
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
  active: boolean;
  files: readonly ChangedFile[];
  pr: PullRequest;
}) {
  const keyValue = prKey(args.pr);
  const threads = useAppStore((s) => s.chatHistory[keyValue]) ?? EMPTY_THREADS;
  const appendChatTurn = useAppStore((s) => s.appendChatTurn);
  const removeChatThread = useAppStore((s) => s.removeChatThread);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(
    () => threads.at(-1)?.id ?? null
  );
  const turns =
    threads.find((t) => t.id === activeThreadId)?.turns ?? EMPTY_TURNS;
  const chips = useAppStore((s) => s.chatChips);
  const removeChip = useAppStore((s) => s.removeChatChip);
  const clearChips = useAppStore((s) => s.clearChatChips);
  const suggestedCount = useAppStore(
    (s) => s.suggestedComments[keyValue]?.length ?? 0
  );
  const [draft, setDraftState] = useState("");
  const [skill, setSkill] = useState<string | null>(null);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [suggestionsDismissed, setSuggestionsDismissed] = useState(false);
  const [live, setLive] = useState<LiveTurn | null>(null);
  const liveRef = useLatest(live);

  const snapshot = useQuery({
    enabled: args.active,
    queryFn: () =>
      api.snapshotStatus(args.pr.owner, args.pr.repo, args.pr.headSha),
    queryKey: ["snapshotStatus", keyValue, args.pr.headSha],
    refetchInterval: (query) =>
      query.state.data?.state === "downloading" ? 2000 : false,
  });
  const snapshotState = snapshot.data?.state;
  const refetchSnapshot = snapshot.refetch;

  const headShaRef = useLatest(args.pr.headSha);
  const ownerRef = useLatest(args.pr.owner);
  const repoRef = useLatest(args.pr.repo);
  useEffect(() => {
    if (
      args.active &&
      (snapshotState === "idle" || snapshotState === "failed")
    ) {
      api
        .ensureRepoSnapshot(
          ownerRef.current,
          repoRef.current,
          headShaRef.current
        )
        .then(() => refetchSnapshot())
        .catch(() => undefined);
    }
  }, [
    args.active,
    snapshotState,
    headShaRef,
    ownerRef,
    repoRef,
    refetchSnapshot,
  ]);

  const skills = useQuery({
    enabled: args.active,
    queryFn: () =>
      api.listChatSkills(args.pr.owner, args.pr.repo, args.pr.headSha),
    queryKey: ["chatSkills", keyValue, args.pr.headSha, snapshotState ?? ""],
    staleTime: Number.POSITIVE_INFINITY,
  });
  const skillNames = (skills.data ?? []).map((s) => s.name);

  const [modelOverride, setModelOverride] = useState<string | null>(
    readChatModel
  );
  const aiConfig = useQuery({
    enabled: args.active,
    queryFn: api.getAiConfig,
    queryKey: ["aiConfig"],
  });
  const models = useQuery({
    enabled: args.active,
    queryFn: api.aiListModels,
    queryKey: ["aiModels"],
    staleTime: Number.POSITIVE_INFINITY,
  });
  const currentModel = modelOverride ?? aiConfig.data?.model ?? null;

  const pickModel = (id: string) => {
    const trimmed = id.trim();
    const next = !trimmed || trimmed === aiConfig.data?.model ? null : trimmed;
    setModelOverride(next);
    persistChatModel(next);
  };

  let contextNote: string | null = null;
  if (snapshotState === "downloading" || snapshotState === "idle") {
    contextNote =
      "Fetching the repository so the chat can read beyond the diff. The diff itself is already available.";
  } else if (snapshotState === "failed" || snapshotState === "skipped") {
    contextNote =
      "Repository unavailable — the chat reads this pull request's diff, not the rest of the repo.";
  }

  const setDraft = (value: string) => {
    setDraftState(value);
    setSuggestionIndex(0);
    setSuggestionsDismissed(false);
  };

  const slashQuery =
    skill === null && draft.startsWith("/") && !/[\s]/.test(draft)
      ? draft.slice(1)
      : null;
  const suggestionItems =
    slashQuery !== null && !suggestionsDismissed
      ? matchCanned(slashQuery, skillNames, 0)
      : [];
  const selectedSuggestion = Math.min(
    suggestionIndex,
    Math.max(suggestionItems.length - 1, 0)
  );

  const pickSkill = (name: string) => {
    setSkill(name);
    setDraftState("");
  };

  const skillsEmptyHint =
    skills.isPending && args.active
      ? "Looking for skills…"
      : "No skills yet. Add a SKILL.md under .claude/skills in this repo, or in Nod's own skills folder.";

  const suggestions: ChatSuggestionsState | null =
    slashQuery !== null && !suggestionsDismissed
      ? {
          emptyHint: suggestionItems.length === 0 ? skillsEmptyHint : null,
          items: suggestionItems,
          onDismiss: () => setSuggestionsDismissed(true),
          onMove: (delta) =>
            setSuggestionIndex(
              Math.min(
                Math.max(selectedSuggestion + delta, 0),
                suggestionItems.length - 1
              )
            ),
          onPick: pickSkill,
          query: slashQuery ?? "",
          selected: selectedSuggestion,
        }
      : null;

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
          deltas: l.deltas + (text === undefined ? 0 : 1),
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

  useEffect(() => {
    const unProposal = listen<{
      chatId: string;
      turnId: string;
      proposal: {
        body: string;
        line: number;
        path: string;
        side: string;
        startLine: number | null;
      };
    }>("ai-chat-proposal", (event) => {
      const p = event.payload.proposal;
      useAppStore.getState().addSuggestedComment(event.payload.chatId, {
        body: p.body,
        line: p.line,
        path: p.path,
        side: p.side,
        startLine: p.startLine ?? undefined,
        turnId: event.payload.turnId,
      });
    });
    return () => {
      unProposal.then((stop) => stop());
    };
  }, []);

  // react-doctor-disable-next-line query-mutation-missing-invalidation -- a chat turn is a one-shot completion, not cached server state; there is no query to invalidate
  const chat = useMutation({
    mutationFn: ({
      threadId: _threadId,
      ...request
    }: { threadId: string } & Parameters<typeof api.aiChat>[0]) =>
      api.aiChat(request),
    onError: (error, vars) => {
      const message = String(error);
      const partial =
        liveRef.current?.turnId === vars.turnId ? liveRef.current.partial : "";
      setLive(null);
      if (message === "cancelled") {
        if (partial) {
          appendChatTurn(keyValue, vars.threadId, {
            error: null,
            id: vars.turnId,
            kind: "assistant",
            text: partial,
          });
        }
        return;
      }
      appendChatTurn(keyValue, vars.threadId, {
        error: message,
        id: vars.turnId,
        kind: "assistant",
        text: "",
      });
    },
    onSuccess: (answer, vars) => {
      const streamed =
        liveRef.current?.turnId === vars.turnId
          ? liveRef.current.deltas > 0
          : true;
      setLive(null);
      appendChatTurn(keyValue, vars.threadId, {
        error: null,
        id: vars.turnId,
        kind: "assistant",
        streamed,
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
      useAppStore.getState().clearChatChips();
    },
    [keyValue, chatPendingRef]
  );

  const send = () => {
    if (slashQuery !== null && skillNames.includes(slashQuery.trim())) {
      pickSkill(slashQuery.trim());
      return;
    }
    const text = draft.trim();
    if (!text || chat.isPending) {
      return;
    }
    const turnId = crypto.randomUUID();
    const threadId = activeThreadId ?? crypto.randomUUID();
    if (activeThreadId === null) {
      setActiveThreadId(threadId);
    }
    const history = historyMessages(turns);
    const regions = chips;
    appendChatTurn(keyValue, threadId, {
      id: crypto.randomUUID(),
      kind: "user",
      regions,
      skill: skill ?? undefined,
      text,
    });
    setDraftState("");
    setSkill(null);
    clearChips();
    setLive({ deltas: 0, partial: "", threadId, toolNote: null, turnId });
    chat.mutate({
      chatId: keyValue,
      threadId,
      commentable: buildCommentableRanges(args.files),
      context: chatContext(args.files, args.pr),
      diffs: buildChatDiffs(args.files),
      history,
      message: text,
      model: modelOverride,
      regions,
      skill,
      turnId,
    });
  };

  const pasteCode = (code: string) => {
    useAppStore.getState().addChatChip({
      code: code.replace(/\n+$/, ""),
      filePath: "",
      lineRange: "",
      side: "",
    });
  };

  const acceptAllSuggested = () => {
    useAppStore.getState().acceptAllSuggested(keyValue);
  };

  const discardAllSuggested = () => {
    useAppStore.getState().clearSuggestedComments(keyValue);
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
          skill: turn.skill,
          text: turn.text,
        };
      }
      return {
        error: turn.error,
        id: turn.id,
        kind: "assistant",
        partial: "",
        streamed: turn.streamed,
        text: turn.error === null ? turn.text : null,
        toolNote: null,
      };
    }),
    ...(live && live.threadId === activeThreadId
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

  const newChat = () => {
    setActiveThreadId(null);
    setDraftState("");
    setSkill(null);
  };

  const removeThread = (threadId: string) => {
    removeChatThread(keyValue, threadId);
    if (threadId === activeThreadId) {
      const remaining = threads.filter((t) => t.id !== threadId);
      setActiveThreadId(remaining.at(-1)?.id ?? null);
    }
  };

  const threadsState =
    threads.length > 0
      ? {
          active: activeThreadId,
          items: threads.map((t) => ({ id: t.id, title: threadTitle(t) })),
          onNew: newChat,
          onPick: setActiveThreadId,
          onRemove: removeThread,
        }
      : null;

  const modelState =
    currentModel === null
      ? null
      : {
          current: currentModel,
          models: models.data ?? null,
          onPick: pickModel,
        };

  return {
    acceptAllSuggested,
    chips,
    contextNote,
    discardAllSuggested,
    draft,
    model: modelState,
    panelTurns,
    pasteCode,
    pending: chat.isPending,
    removeChip,
    removeSkill: () => setSkill(null),
    send,
    setDraft,
    skill,
    stop,
    suggestedCount,
    suggestions,
    threads: threadsState,
  };
}
