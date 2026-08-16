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
import type { ChatComposerHandle } from "@nod/ui/chat-composer";
import type { ChatPanelTurn, ChatSuggestionsState } from "@nod/ui/chat-panel";
import { useLatest } from "@nod/ui/use-latest";
import { useMutation, useQuery } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import type React from "react";
import { useEffect, useState } from "react";
import { api } from "../lib/api.ts";
import { buildChatDiffs } from "../lib/chat-diffs.ts";
import { buildCommentableRanges } from "../lib/commentable-ranges.ts";
import { revealFolder } from "../lib/open-external.ts";
import { useAppStore } from "../store/app-store.ts";
import {
  type AiAskContext,
  type ChangedFile,
  type ChatPart,
  type ChatRegion,
  type ChatThread,
  type ChatTurnRecord,
  type PendingComment,
  type PullRequest,
  prKey,
  type SkillInfo,
} from "../types.ts";

interface LiveTurn {
  activity: string[];
  partial: string;
  reasoning: string;
  startedAt: number;
  threadId: string;
  turnId: string;
}

const MAX_ACTIVITY_LINES = 40;
const MAX_REASONING_CHARS = 8000;

/** What a finished turn keeps of its working: how long it took, the tools it
 *  ran and the thinking it streamed, so the trail survives a reload. */
function settledTrail(live: LiveTurn | null) {
  return {
    activity: live && live.activity.length > 0 ? live.activity : undefined,
    at: new Date().toISOString(),
    reasoning: live?.reasoning || undefined,
    workedMs: live ? Date.now() - live.startedAt : undefined,
  };
}

const EMPTY_TURNS: ChatTurnRecord[] = [];
const EMPTY_PENDING: PendingComment[] = [];
const EMPTY_SKILLS: SkillInfo[] = [];
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
  composerRef: React.RefObject<ChatComposerHandle | null>;
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
  const clearChips = useAppStore((s) => s.clearChatChips);
  const stagedByAi = useAppStore(
    (s) => s.pendingComments[keyValue] ?? EMPTY_PENDING
  ).filter((c) => c.fromAi);
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
    const why = snapshot.data?.detail;
    contextNote = `Reading this pull request's diff only${
      why ? ` — ${why}` : ""
    }. Repo-wide search and file reads are off.`;
  }

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
    args.composerRef.current?.clear();
    args.composerRef.current?.focus();
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
    const pendingReasoning = new Map<string, string>();
    let toolPending: { detail: string; turnId: string } | null = null;
    let flushFrame = 0;
    const flush = () => {
      flushFrame = 0;
      const batch = new Map(pending);
      const thinkBatch = new Map(pendingReasoning);
      pending.clear();
      pendingReasoning.clear();
      const tool = toolPending;
      toolPending = null;
      setLive((l) => {
        if (!l) {
          return l;
        }
        const text = batch.get(l.turnId);
        const think = thinkBatch.get(l.turnId);
        const note = tool && tool.turnId === l.turnId ? tool.detail : null;
        if (text === undefined && think === undefined && note === null) {
          return l;
        }
        return {
          ...l,
          activity:
            note === null || l.activity.at(-1) === note
              ? l.activity
              : [...l.activity, note].slice(-MAX_ACTIVITY_LINES),
          partial: text === undefined ? l.partial : l.partial + text,
          reasoning:
            think === undefined
              ? l.reasoning
              : (l.reasoning + think).slice(-MAX_REASONING_CHARS),
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
    const unThink = listen<{ chatId: string; turnId: string; text: string }>(
      "ai-chat-reasoning",
      (event) => {
        pendingReasoning.set(
          event.payload.turnId,
          (pendingReasoning.get(event.payload.turnId) ?? "") +
            event.payload.text
        );
        arm();
      }
    );
    return () => {
      if (flushFrame) {
        cancelAnimationFrame(flushFrame);
      }
      unDelta.then((stop) => stop());
      unTool.then((stop) => stop());
      unThink.then((stop) => stop());
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
      useAppStore.getState().addPendingComment(event.payload.chatId, {
        body: p.body,
        fromAi: true,
        line: p.line,
        path: p.path,
        side: p.side,
        startLine: p.startLine ?? undefined,
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
      const live =
        liveRef.current?.turnId === vars.turnId ? liveRef.current : null;
      const partial = live?.partial ?? "";
      setLive(null);
      if (message === "cancelled") {
        if (partial) {
          appendChatTurn(keyValue, vars.threadId, {
            ...settledTrail(live),
            error: null,
            id: vars.turnId,
            kind: "assistant",
            text: partial,
          });
        }
        return;
      }
      appendChatTurn(keyValue, vars.threadId, {
        ...settledTrail(live),
        error: message,
        id: vars.turnId,
        kind: "assistant",
        text: "",
      });
    },
    onSuccess: (answer, vars) => {
      const live =
        liveRef.current?.turnId === vars.turnId ? liveRef.current : null;
      setLive(null);
      appendChatTurn(keyValue, vars.threadId, {
        ...settledTrail(live),
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
      useAppStore.getState().clearChatChips();
    },
    [keyValue, chatPendingRef]
  );

  const send = (parts: ChatPart[]): boolean => {
    const text = parts
      .filter((p) => p.kind === "text")
      .map((p) => (p.kind === "text" ? p.text : ""))
      .join("")
      .trim();
    if (parts.length === 0 || chat.isPending) {
      return false;
    }
    const turnId = crypto.randomUUID();
    const threadId = activeThreadId ?? crypto.randomUUID();
    if (activeThreadId === null) {
      setActiveThreadId(threadId);
    }
    const history = historyMessages(turns);
    const regions = parts
      .filter((p) => p.kind === "code")
      .map((p) => (p.kind === "code" ? p.region : null))
      .filter((r): r is ChatRegion => r !== null);
    appendChatTurn(keyValue, threadId, {
      at: new Date().toISOString(),
      id: crypto.randomUUID(),
      kind: "user",
      parts,
      regions,
      skill: skill ?? undefined,
      text,
    });
    setSkill(null);
    setLive({
      activity: [],
      partial: "",
      reasoning: "",
      startedAt: Date.now(),
      threadId,
      turnId,
    });
    chat.mutate({
      chatId: keyValue,
      threadId,
      commentable: buildCommentableRanges(args.files),
      context: chatContext(args.files, args.pr),
      diffs: buildChatDiffs(args.files),
      history,
      message: text,
      model: modelOverride,
      parts,
      regions,
      skill,
      turnId,
    });
    return true;
  };

  const createSkill = (name: string) => {
    api
      .createSkill(name)
      .then((path) => {
        revealFolder(path);
        return skills.refetch();
      })
      .catch(() => undefined);
  };

  const openSkillsFolder = () => {
    api
      .openSkillsDir()
      .then((path) => {
        revealFolder(path);
        return skills.refetch();
      })
      .catch(() => undefined);
  };

  const discardStaged = (id: string) => {
    useAppStore.getState().removePendingComment(keyValue, id);
  };

  const stop = () => {
    api.aiChatCancel(keyValue).catch(() => undefined);
  };

  const panelTurns: ChatPanelTurn[] = [
    ...turns.map((turn): ChatPanelTurn => {
      if (turn.kind === "user") {
        return {
          at: turn.at,
          id: turn.id,
          kind: "user",
          parts: turn.parts,
          regions: turn.regions,
          skill: turn.skill,
          text: turn.text,
        };
      }
      return {
        activity: turn.activity ?? [],
        at: turn.at,
        error: turn.error,
        id: turn.id,
        kind: "assistant",
        partial: "",
        reasoning: turn.reasoning ?? "",
        startedAt: null,
        text: turn.error === null ? turn.text : null,
        workedMs: turn.workedMs,
      };
    }),
    ...(live && live.threadId === activeThreadId
      ? [
          {
            activity: live.activity,
            error: null,
            id: live.turnId,
            kind: "assistant" as const,
            partial: live.partial,
            reasoning: live.reasoning,
            startedAt: live.startedAt,
            text: null,
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
    chips,
    clearChips,
    contextNote,
    model: modelState,
    panelTurns,
    pending: chat.isPending,
    createSkill,
    openSkillsFolder,
    skills: skills.data ?? EMPTY_SKILLS,
    removeSkill: () => setSkill(null),
    skillCount: skillNames.length,
    send,
    onComposerChange: (text: string) => {
      setDraftState(text);
      setSuggestionsDismissed(false);
    },
    skill,
    stop,
    staged: stagedByAi.map((c) => ({
      body: c.body,
      id: c.id,
      label: `${c.path}:${c.line}`,
      line: c.line,
      path: c.path,
      side: c.side,
    })),
    stagedDiscard: discardStaged,
    suggestions,
    threads: threadsState,
  };
}
