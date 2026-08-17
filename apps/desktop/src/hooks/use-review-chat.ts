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
import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api.ts";
import { buildChatDiffs } from "../lib/chat-diffs.ts";
import { buildCommentableRanges } from "../lib/commentable-ranges.ts";
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
/** A thread's display name: whatever its opening message actually was.
 *  Prose first; failing that the skills it invoked (a skill on its own is a
 *  complete message, and "/pr-validity" names that thread better than any
 *  summary would); failing that the code it attached. Nothing is generated —
 *  a label is not worth a model call, and a thread named by its own first
 *  line is one the reviewer can recognise. */
function threadTitle(thread: ChatThread): string {
  const first = thread.turns.find((t) => t.kind === "user");
  if (first?.kind !== "user") {
    return "New chat";
  }
  const line = (first.text.split("\n")[0] ?? "").trim();
  const skills =
    first.skills ?? (first.skill === undefined ? [] : [first.skill]);
  const attached = (first.parts ?? []).find((p) => p.kind === "code");
  const label =
    line ||
    skills.map((name) => `/${name}`).join(" ") ||
    (attached?.kind === "code" ? regionTitle(attached.region) : "") ||
    first.regions.map((r) => regionTitle(r)).join(" ") ||
    "New chat";
  return label.length > 40 ? `${label.slice(0, 40)}…` : label;
}

/** The parked message, compressed to one recognisable line. */
function queuedLabel(queued: { parts: ChatPart[]; skills: string[] }): string {
  const text = queued.parts
    .filter((p) => p.kind === "text")
    .map((p) => (p.kind === "text" ? p.text : ""))
    .join("")
    .trim();
  const skills = queued.skills.map((name) => `/${name}`).join(" ");
  const label = [skills, text].filter(Boolean).join(" ");
  return label.length > 60 ? `${label.slice(0, 60)}…` : label;
}

function regionTitle(region: ChatRegion): string {
  if (!region.filePath) {
    return "pasted code";
  }
  return region.lineRange
    ? `${region.filePath}:${region.lineRange}`
    : region.filePath;
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

/** `pr.repo` is the "owner/name" path and `pr.name` is the bare repo name —
 *  the snapshot key and every forge call want the latter. */
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
    repo: pr.name,
  };
}

/** The repo snapshot behind the chat: its state, a kick to fetch it when it
 *  is missing, and the sentence the panel shows about what the model can
 *  currently read. Answering "why can't it see my repo?" is the whole job. */
function useChatSnapshot(args: { active: boolean; pr: PullRequest }): {
  note: string | null;
  state: string | undefined;
} {
  const snapshot = useQuery({
    enabled: args.active,
    queryFn: () =>
      api.snapshotStatus(args.pr.owner, args.pr.name, args.pr.headSha),
    queryKey: ["snapshotStatus", prKey(args.pr), args.pr.headSha],
    refetchInterval: (query) =>
      query.state.data?.state === "downloading" ? 2000 : false,
  });
  const snapshotState = snapshot.data?.state;
  const refetchSnapshot = snapshot.refetch;

  const headShaRef = useLatest(args.pr.headSha);
  const ownerRef = useLatest(args.pr.owner);
  const repoRef = useLatest(args.pr.name);
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

  return { note: contextNote, state: snapshotState };
}

function emptyHint(loading: boolean): string {
  return loading
    ? "Looking for skills…"
    : "No skill by that name. Send /find-skill and Nod will help you write one.";
}

/** The `/` picker. A leading slash with no space is a skill query; anything
 *  else is prose. Dismissing it is per-query, so Escape closes the list
 *  without also cancelling the slash you just typed. */
function useSlashSuggestions(args: {
  /** name → one-line description, for the row's footnote. */
  hints: Record<string, string>;
  loading: boolean;
  onPick: (name: string) => void;
  skillNames: string[];
  /** What the caret is typing after a `/`, straight from the field. */
  slash: string | null;
}): ChatSuggestionsState | null {
  const [index, setIndex] = useState(0);
  // Dismissal remembers the exact query it applied to, so Escape closes the
  // list and the next keystroke opens it again — no effect to keep in sync.
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  const query = args.slash === dismissedFor ? null : args.slash;
  const items = query === null ? [] : matchCanned(query, args.skillNames, 0);
  const selected = Math.min(index, Math.max(items.length - 1, 0));

  if (query === null) {
    return null;
  }
  return {
    emptyHint: items.length > 0 ? null : emptyHint(args.loading),
    hints: args.hints,
    items,
    onDismiss: () => setDismissedFor(query),
    onMove: (delta) =>
      setIndex(Math.min(Math.max(selected + delta, 0), items.length - 1)),
    onPick: args.onPick,
    query,
    selected,
  };
}

/** One frame's worth of stream folded into the live turn. Returns the turn
 *  unchanged when the frame carried nothing for it, so a flush aimed at an
 *  older turn cannot repaint the current one. */
function foldStream(
  live: LiveTurn,
  frame: {
    note: string | null;
    text: string | undefined;
    think: string | undefined;
  }
): LiveTurn {
  if (
    frame.text === undefined &&
    frame.think === undefined &&
    frame.note === null
  ) {
    return live;
  }
  return {
    ...live,
    activity:
      frame.note === null || live.activity.at(-1) === frame.note
        ? live.activity
        : [...live.activity, frame.note].slice(-MAX_ACTIVITY_LINES),
    partial:
      frame.text === undefined ? live.partial : live.partial + frame.text,
    reasoning:
      frame.think === undefined
        ? live.reasoning
        : (live.reasoning + frame.think).slice(-MAX_REASONING_CHARS),
  };
}

/** The live turn's incoming stream. Deltas, reasoning and tool notes arrive
 *  far faster than a frame, so they land in buffers and one rAF flush folds
 *  them into the turn — the transcript repaints once per frame, not once per
 *  token. */
function useChatStream(
  setLive: React.Dispatch<React.SetStateAction<LiveTurn | null>>
) {
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
      setLive((l) =>
        l === null
          ? l
          : foldStream(l, {
              note: tool && tool.turnId === l.turnId ? tool.detail : null,
              text: batch.get(l.turnId),
              think: thinkBatch.get(l.turnId),
            })
      );
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
  }, [setLive]);
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
  // The chips in the field are the truth; this mirror only exists so the
  // panel can gate on whether anything is invoked.
  const [, setInvokedSkills] = useState<string[]>([]);
  const [slash, setSlash] = useState<string | null>(null);
  const [live, setLive] = useState<LiveTurn | null>(null);
  const liveRef = useLatest(live);
  // Turns the stop button already wrote out; their mutation still resolves.
  const settledByStop = useRef(new Set<string>());

  const { note: contextNote, state: snapshotState } = useChatSnapshot(args);

  const skills = useQuery({
    enabled: args.active,
    queryFn: () =>
      api.listChatSkills(args.pr.owner, args.pr.name, args.pr.headSha),
    queryKey: ["chatSkills", keyValue, args.pr.headSha, snapshotState ?? ""],
    staleTime: Number.POSITIVE_INFINITY,
  });
  const skillNames = (skills.data ?? []).map((s) => s.name);
  const skillHints = Object.fromEntries(
    (skills.data ?? []).map((s) => [s.name, s.description])
  );

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

  // Picking a skill swaps the `/query` the reviewer typed for a chip in the
  // field — the same token a code region gets, removable the same ways, and
  // whatever else they had typed stays put. The state here mirrors the chip
  // only so the request can carry the skill beside the message.
  const pickSkill = (name: string) => {
    // `/` plus what has been typed after it — the characters the chip stands
    // in for.
    args.composerRef.current?.insertSkill(name, (slash?.length ?? 0) + 1);
  };
  const suggestions = useSlashSuggestions({
    hints: skillHints,
    loading: skills.isPending && args.active,
    onPick: pickSkill,
    skillNames,
    slash,
  });

  useChatStream(setLive);

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
      if (settledByStop.current.delete(vars.turnId)) {
        return;
      }
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
      if (settledByStop.current.delete(vars.turnId)) {
        return;
      }
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

  // One parked message. Enter while a turn is in flight should not be a
  // dead key: the message waits, visibly, and goes out the moment the turn
  // settles. One slot, last write wins — a queue of queues is a chat client.
  const [queued, setQueued] = useState<{
    parts: ChatPart[];
    skills: string[];
  } | null>(null);

  const send = (parts: ChatPart[], invokedOverride?: string[]): boolean => {
    // The chips in the field are the truth about which skills this message
    // runs; a flushed queue carries the skills it was parked with, because
    // the field was cleared the moment it was queued.
    const invoked = invokedOverride ?? args.composerRef.current?.skills() ?? [];
    const text = parts
      .filter((p) => p.kind === "text")
      .map((p) => (p.kind === "text" ? p.text : ""))
      .join("")
      .trim();
    // A skill on its own is a whole request — "run this pass" — so an empty
    // message sends when a skill chip is in the field.
    if (parts.length === 0 && invoked.length === 0) {
      return false;
    }
    if (chat.isPending) {
      setQueued({ parts, skills: invoked });
      return true;
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
      skills: invoked,
      text,
    });
    setInvokedSkills([]);
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
      skills: invoked,
      turnId,
    });
    return true;
  };

  const discardStaged = (id: string) => {
    useAppStore.getState().removePendingComment(keyValue, id);
  };

  /** Stop settles the turn here and now. The backend only notices a cancel
   *  between chunks — during a tool call or a long think that is seconds
   *  away — and a stop button that waits on the network reads as broken. The
   *  partial answer is kept as the turn, the id is remembered, and the
   *  mutation's late resolution is ignored so nothing lands twice. */
  const stop = () => {
    const live = liveRef.current;
    api.aiChatCancel(keyValue).catch(() => undefined);
    if (!live) {
      return;
    }
    settledByStop.current.add(live.turnId);
    setLive(null);
    if (live.partial) {
      appendChatTurn(keyValue, live.threadId, {
        ...settledTrail(live),
        error: null,
        id: live.turnId,
        kind: "assistant",
        text: live.partial,
      });
    }
  };

  // The parked message goes out the moment the mutation settles — not when
  // `live` clears (stop empties that early, while the cancel is still
  // unwinding; two in-flight turns on one chat id would interleave events).
  useEffect(() => {
    if (chat.isPending || queued === null) {
      return;
    }
    setQueued(null);
    send(queued.parts, queued.skills);
  });

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
          skills: turn.skills,
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
    setInvokedSkills([]);
    // A new chat exists to be typed into.
    args.composerRef.current?.clear();
    args.composerRef.current?.focus();
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
    // The stop button clears `live` at once, so the composer stops offering
    // to stop something that is, as far as the reviewer is concerned, over.
    pending: chat.isPending && live !== null,
    queued:
      queued === null
        ? null
        : {
            label: queuedLabel(queued),
            onDiscard: () => setQueued(null),
          },
    send,
    onSkillChange: setInvokedSkills,
    onSlashQuery: setSlash,
    skills: skills.data ?? EMPTY_SKILLS,
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
