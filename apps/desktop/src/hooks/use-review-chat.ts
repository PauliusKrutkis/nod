/**
 * The review chat's runtime (docs/AI.md § Second surface). Settled turns
 * live in the app store keyed by PR — they persist across restarts — while
 * the in-flight turn (streamed partial, tool-activity line) is hook state:
 * it exists only while the mutation runs and is folded into the store when
 * the turn settles. Deltas arrive on `ai-chat-delta`/`ai-chat-tool` keyed by
 * turnId and are batched per animation frame, the ask note's precedent, so
 * token-rate events never force token-rate re-renders.
 *
 * The composer's field is the truth about what a message carries — its code
 * chips and its skill chips — and the state here mirrors it only so the
 * request can carry the skills beside the message and the `/` picker can
 * gate on whether one is invoked. A message sent while a turn runs parks in
 * a single slot (last write wins) and goes out when the MUTATION settles,
 * not when the live turn clears: stop empties that early, while the cancel
 * is still unwinding, and two in-flight turns on one chat id would
 * interleave their events.
 *
 * One turn in flight per chat. History replays the settled conversation:
 * user turns are rebuilt with their region blocks (the code a past question
 * was about must survive the round trip), errored assistant turns are
 * skipped. A cancelled turn is a stop, not a failure — whatever streamed is
 * kept as the answer, and nothing is kept if nothing arrived. Unmounting
 * (PR switch) cancels an in-flight turn so no orphan stream keeps burning
 * the provider.
 */

import type { ChatComposerHandle } from "@nod/ui/chat-composer";
import type { ChatPanelTurn, ChatSuggestionsState } from "@nod/ui/chat-panel";
import { matchCanned } from "@nod/ui/match-canned";
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
import { useRepoStore } from "./use-repo-store.ts";

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

/** The prose in a message, with the code chips left out. */
function partsText(parts: readonly ChatPart[]): string {
  let text = "";
  for (const part of parts) {
    if (part.kind === "text") {
      text += part.text;
    }
  }
  return text.trim();
}

/** The code chips in a message, in the order they were attached. */
function partsRegions(parts: readonly ChatPart[]): ChatRegion[] {
  const regions: ChatRegion[] = [];
  for (const part of parts) {
    if (part.kind === "code") {
      regions.push(part.region);
    }
  }
  return regions;
}

/** The comments one turn staged, as the panel's rows. */
function stagedForTurn(
  pending: readonly PendingComment[],
  turnId: string
): { body: string; id: string; label: string }[] {
  const rows: { body: string; id: string; label: string }[] = [];
  for (const comment of pending) {
    if (comment.turnId === turnId) {
      rows.push({
        body: comment.body,
        id: comment.id,
        label: `${comment.path}:${comment.line}`,
      });
    }
  }
  return rows;
}

/** The parked message, compressed to one recognisable line. */
function queuedLabel(queued: { parts: ChatPart[]; skills: string[] }): string {
  const text = partsText(queued.parts);
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
const CHAT_EFFORT_KEY = "nod:chatEffort:v1";
const EFFORT_REFUSED_KEY = "nod:chatEffortUnsupported:v1";

function readChatEffort(): string | null {
  try {
    const stored = localStorage.getItem(CHAT_EFFORT_KEY);
    return stored === "low" || stored === "medium" || stored === "high"
      ? stored
      : null;
  } catch {
    return null;
  }
}

/** Models whose route refused a thinking level, learned one refusal at a
 *  time. Nothing the provider publishes says which models take one — the
 *  model list has no capability field, and the platform does not predict it
 *  (Sonnet 5 refuses where Gemini 3 Flash, on the same one, accepts) — so the
 *  first failed turn is the only source, and it is worth keeping. */
function readEffortRefused(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(EFFORT_REFUSED_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((m) => typeof m === "string") : [];
  } catch {
    return [];
  }
}

function persistEffortRefused(models: string[]): void {
  try {
    localStorage.setItem(EFFORT_REFUSED_KEY, JSON.stringify(models));
  } catch {
    /* storage unavailable — the model is re-learned next launch */
  }
}

function persistChatEffort(effort: string | null): void {
  try {
    if (effort === null) {
      localStorage.removeItem(CHAT_EFFORT_KEY);
    } else {
      localStorage.setItem(CHAT_EFFORT_KEY, effort);
    }
  } catch {
    /* storage unavailable (private mode) — the choice just won't persist */
  }
}

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

/** The repo store behind the chat: its state and the sentence the panel
 *  shows about what the model can currently read. Answering "why can't it
 *  see my repo?" is the whole job; the lifecycle itself lives in the shared
 *  useRepoStore hook. */
function useChatRepoStore(args: { active: boolean; pr: PullRequest }): {
  note: string | null;
  state: string | undefined;
} {
  const { status } = useRepoStore({
    active: args.active,
    owner: args.pr.owner,
    repo: args.pr.name,
    sha: args.pr.headSha,
  });
  const state = status?.state;

  let contextNote: string | null = null;
  if (state === "cloning" || state === "fetching" || state === "idle") {
    contextNote =
      "Fetching the repository so the chat can read beyond the diff. The diff itself is already available.";
  } else if (state === "failed") {
    const why = status?.detail;
    contextNote = `Reading this pull request's diff only. Repo-wide search and file reads are off.${
      why ? ` The repo fetch failed: ${why}` : ""
    }`;
  }

  return { note: contextNote, state };
}

function emptyHint(loading: boolean): string {
  return loading
    ? "Looking for skills…"
    : "No skill by that name. Send /find-skill and Nod will help you write one.";
}

/** The `/` picker. A leading slash with no space is a skill query; anything
 *  else is prose. Dismissal remembers the exact query it applied to, so
 *  Escape closes the list and the next keystroke opens it again — which is a
 *  derivation rather than an effect to keep in sync. */
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
  const nameChatThread = useAppStore((s) => s.nameChatThread);
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
  const [, setInvokedSkills] = useState<string[]>([]);
  const [slash, setSlash] = useState<string | null>(null);
  const [live, setLive] = useState<LiveTurn | null>(null);
  const liveRef = useLatest(live);
  const settledByStop = useRef(new Set<string>());

  const { note: contextNote, state: storeState } = useChatRepoStore(args);

  const skills = useQuery({
    enabled: args.active,
    queryFn: () =>
      api.listChatSkills(args.pr.owner, args.pr.name, args.pr.headSha),
    queryKey: ["chatSkills", keyValue, args.pr.headSha, storeState ?? ""],
    staleTime: Number.POSITIVE_INFINITY,
  });
  const skillNames = (skills.data ?? []).map((s) => s.name);
  const skillHints = Object.fromEntries(
    (skills.data ?? []).map((s) => [s.name, s.description])
  );

  const [modelOverride, setModelOverride] = useState<string | null>(
    readChatModel
  );
  const [effort, setEffortState] = useState<string | null>(readChatEffort);
  const pickEffort = (next: string | null) => {
    setEffortState(next);
    persistChatEffort(next);
  };
  const [effortRefused, setEffortRefused] =
    useState<string[]>(readEffortRefused);
  const effortRefusedRef = useLatest(effortRefused);
  useEffect(() => {
    const stop = listen<{ chatId: string; model: string }>(
      "ai-chat-effort-unsupported",
      (event) => {
        const known = effortRefusedRef.current;
        if (known.includes(event.payload.model)) {
          return;
        }
        const next = [...known, event.payload.model];
        setEffortRefused(next);
        persistEffortRefused(next);
      }
    );
    return () => {
      stop.then((off) => off());
    };
  }, [effortRefusedRef]);
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
  const effortSupported =
    currentModel === null || !effortRefused.includes(currentModel);
  const modelRef = useLatest(currentModel);

  const pickModel = (id: string) => {
    const trimmed = id.trim();
    const next = !trimmed || trimmed === aiConfig.data?.model ? null : trimmed;
    setModelOverride(next);
    persistChatModel(next);
  };

  /** Swaps the `/query` the reviewer typed for a chip in the field — the
   *  same token a code region gets, removable the same ways, and whatever
   *  else they had typed stays put. The count is the slash plus what follows
   *  it: the characters the chip stands in for. */
  const pickSkill = (name: string) => {
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
        turnId: event.payload.turnId,
      });
    });
    return () => {
      unProposal.then((stop) => stop());
    };
  }, []);

  const [queued, setQueued] = useState<{
    parts: ChatPart[];
    skills: string[];
  } | null>(null);
  const queuedRef = useLatest(queued);
  /** Sends the parked message, if there is one. Called when a turn settles
   *  rather than from an effect watching `isPending`: the settle IS the
   *  event, and an effect would fire on unrelated renders too. */
  const flushQueued = () => {
    const parked = queuedRef.current;
    if (parked === null) {
      return;
    }
    setQueued(null);
    dispatchRef.current(parked.parts, parked.skills);
  };

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
      nameThreadOnce(vars.threadId, vars.message, answer);
    },
    onSettled: flushQueued,
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

  /** Asks the model for a thread name, once, off the first exchange.
   *
   *  Fire and forget on purpose: a name is worth one small call but not one
   *  moment of the reviewer's waiting, and a thread that never gets one still
   *  reads fine under the message it opened with. Skipped when the thread is
   *  already named or already has history, so a long conversation is not
   *  renamed out from under the reader. The store is read through getState
   *  rather than the rendered value: this runs from the mutation's success
   *  callback, moments after the same turn was appended, and a rendered
   *  snapshot is one commit behind — which would leave both guards judging
   *  the thread as it was before the turn that just landed. */
  const nameThreadOnce = (
    threadId: string,
    question: string,
    answer: string
  ) => {
    const thread = useAppStore
      .getState()
      .chatHistory[keyValue]?.find((t) => t.id === threadId);
    if (thread === undefined || thread.title !== undefined) {
      return;
    }
    if (thread.turns.filter((t) => t.kind === "user").length > 1) {
      return;
    }
    api
      .aiChatTitle({ answer, model: modelRef.current, question })
      .then((title) => {
        if (title.trim()) {
          nameChatThread(keyValue, threadId, title.trim());
        }
      })
      .catch(() => undefined);
  };

  /** Starts the turn. Callers decide whether a turn may start; by the time
   *  this runs the decision is made, which is why the parked message can
   *  come straight here from the mutation's settle — at that moment
   *  `isPending` is still true and asking again would park it forever. */
  const dispatch = (parts: ChatPart[], invoked: string[]): boolean => {
    const text = partsText(parts);
    const turnId = crypto.randomUUID();
    const threadId = activeThreadId ?? crypto.randomUUID();
    if (activeThreadId === null) {
      setActiveThreadId(threadId);
    }
    const history = historyMessages(turns);
    const regions = partsRegions(parts);
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
      effort: effortSupported ? effort : null,
      model: modelOverride,
      parts,
      regions,
      skills: invoked,
      turnId,
    });
    return true;
  };
  const dispatchRef = useLatest(dispatch);

  /** Sends, or parks the message when a turn is already running. A skill on
   *  its own is a whole request, so an empty message sends when a skill chip
   *  is in the field. */
  const send = (parts: ChatPart[]): boolean => {
    const invoked = args.composerRef.current?.skills() ?? [];
    if (parts.length === 0 && invoked.length === 0) {
      return false;
    }
    if (chat.isPending) {
      setQueued({ parts, skills: invoked });
      return true;
    }
    return dispatch(parts, invoked);
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
        staged: stagedForTurn(stagedByAi, turn.id),
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
            staged: stagedForTurn(stagedByAi, live.turnId),
            startedAt: live.startedAt,
            text: null,
          },
        ]
      : []),
  ];

  /** A new chat exists to be typed into, so it takes the caret with it. */
  const newChat = () => {
    setActiveThreadId(null);
    setInvokedSkills([]);
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
          effort: {
            current: effortSupported ? effort : null,
            onPick: pickEffort,
            supported: effortSupported,
          },
          models: models.data ?? null,
          onPick: pickModel,
        };

  return {
    chips,
    clearChips,
    contextNote,
    model: modelState,
    panelTurns,
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
