/**
 * The review chat surface (docs/AI.md § Second surface), seated in the
 * right dock's Chat tab. A transcript of turns, a row of pending region
 * chips, and a plain-textarea composer — a prompt box, not a document
 * editor, so no TipTap here. Conversation state belongs to the caller: the
 * panel is a pure function of its props, which is what lets the host
 * persist history per PR and lets every state be shot in the gallery.
 *
 * Two turn shapes and no author labels: what you said sits in a bubble, what
 * the model said is plain text under a "Worked for 4s" header that expands
 * into the tools it ran and the thinking it streamed. Send is disabled while
 * a turn is in flight (one at a time per chat); Stop takes its place and is
 * the only button that stays live.
 *
 * `renderMarkdown` is the host's markdown pipeline; the built-in fallback
 * renders answers as literal paragraphs, which is also what guarantees an
 * answer full of markup is read, never executed. `staged` lists the comments
 * this chat put in your review — each one a way back to its line in the diff,
 * with the comment itself living there as an ordinary pending comment.
 * `suggestions` renders the composer's
 * completion panel (canned mechanism); which items and what happens on a
 * pick belong to the host. Enter sends, Shift+Enter breaks the line, Escape
 * defers to the host (blur back to the diff). `focusSeq` bumps focus the
 * composer the way the ask note's does.
 */

import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  CornerDownLeft,
  Plus,
  X,
} from "lucide-react";
import {
  type KeyboardEvent,
  type ReactNode,
  type Ref,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";
import type { AiSetupModel } from "../ai-model-combobox/ai-model-combobox.tsx";
import { CannedSuggestions } from "../canned-suggestions/canned-suggestions.tsx";
import {
  ChatComposer,
  type ChatComposerHandle,
  type ChatPart,
} from "../chat-composer/chat-composer.tsx";
import { cn } from "../cn/cn.ts";
import { ModelPicker } from "../model-picker/model-picker.tsx";
import { formatAbsolute, formatRelativeTime } from "../time/time.ts";
import "./chat-panel.css";

export interface ChatRegionChip {
  code: string;
  filePath: string;
  lineRange: string;
  side: string;
}

export interface ChatUserTurn {
  kind: "user";
  at?: string;
  id: string;
  /** The message as written: prose and code in the order they were put
   *  there. Older turns carry only `regions` + `text`. */
  parts?: readonly ChatPart[];
  regions: readonly ChatRegionChip[];
  skill?: string;
  text: string;
}

export interface ChatAssistantTurn {
  kind: "assistant";
  /** Tool activity, oldest first — the trail behind "Worked for 4s". */
  activity: readonly string[];
  at?: string;
  error: string | null;
  id: string;
  partial: string;
  /** The model's streamed thinking, when it sends any. */
  reasoning: string;
  /** Epoch ms the turn began; null once it has settled. */
  startedAt?: number | null;
  text: string | null;
  workedMs?: number;
}

export type ChatPanelTurn = ChatUserTurn | ChatAssistantTurn;

export interface ChatStagedComment {
  body: string;
  id: string;
  label: string;
}

export interface ChatStagedState {
  items: readonly ChatStagedComment[];
  onDiscard: (id: string) => void;
  onReveal: (id: string) => void;
}

export interface ChatThreadsState {
  active: string | null;
  items: { id: string; title: string }[];
  onNew: () => void;
  onPick: (id: string) => void;
  onRemove: (id: string) => void;
}

export interface ChatModelState {
  current: string;
  models: readonly AiSetupModel[] | null;
  onPick: (id: string) => void;
}

export interface ChatSuggestionsState {
  /** Shown in place of the list when nothing matches, so an opening `/`
   *  always answers with something. */
  emptyHint?: string | null;
  items: string[];
  onDismiss: () => void;
  onMove: (delta: 1 | -1) => void;
  onPick: (text: string) => void;
  query: string;
  selected: number;
}

export interface ChatPanelProps {
  composerRef?: Ref<ChatComposerHandle>;
  contextNote?: string | null;
  focusSeq: number;
  model?: ChatModelState | null;
  onComposerChange?: (text: string) => void;
  onEscape?: () => void;
  /** Reveal an inline chip's lines in the diff. Pasted code has no lines to
   *  point at, so the composer only calls this for a region chip. */
  onRevealRegion?: (region: ChatRegionChip) => void;
  onSend: () => void;
  onStop: () => void;
  onRemoveSkill?: () => void;
  /** How many skills are reachable right now — the button says "Add skills"
   *  when there are none, which is the honest empty state. */
  pending: boolean;
  staged?: ChatStagedState | null;
  renderMarkdown?: (text: string) => ReactNode;
  skill?: string | null;
  suggestions?: ChatSuggestionsState | null;
  threads?: ChatThreadsState | null;
  turns: readonly ChatPanelTurn[];
}

/** The panel focuses the field itself and the host drives it too, so both
 *  refs have to reach the same handle. */
function mergeComposerRefs(
  local: RefObject<ChatComposerHandle | null>,
  external: Ref<ChatComposerHandle> | undefined
) {
  return (handle: ChatComposerHandle | null) => {
    local.current = handle;
    if (typeof external === "function") {
      external(handle);
    } else if (external) {
      (external as { current: ChatComposerHandle | null }).current = handle;
    }
  };
}

function plainText(text: string): ReactNode {
  return <p className="qch-para">{text}</p>;
}

function chipLabel(chip: ChatRegionChip): string {
  if (!chip.filePath) {
    const lines = chip.code.split("\n").length;
    return `pasted code (${lines} ${lines === 1 ? "line" : "lines"})`;
  }
  return chip.lineRange ? `${chip.filePath}:${chip.lineRange}` : chip.filePath;
}

function elapsedLabel(ms: number): string {
  const seconds = Math.max(Math.round(ms / 1000), 1);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function TurnTime({ at, pinned }: { at: string | undefined; pinned: boolean }) {
  if (at === undefined) {
    return null;
  }
  return (
    <span
      className={cn("qch-time", pinned && "qch-time-on")}
      title={formatAbsolute(at)}
    >
      {formatRelativeTime(at)}
    </span>
  );
}

function UserTurn({ turn }: { turn: ChatUserTurn }) {
  return (
    <div className="qch-turn qch-user">
      <div className="qch-bubble">
        {turn.skill !== undefined && (
          <div className="qch-turn-chips">
            <span className="qch-chip qch-skill-chip">/{turn.skill}</span>
          </div>
        )}
        {turn.parts && turn.parts.length > 0 ? (
          <p className="qch-text">
            {turn.parts.map((part, i) =>
              part.kind === "text" ? (
                // biome-ignore lint/suspicious/noArrayIndexKey: parts are positional and may repeat verbatim
                <span key={i}>{part.text}</span>
              ) : (
                // biome-ignore lint/suspicious/noArrayIndexKey: parts are positional and may repeat verbatim
                <span className="qch-chip" key={i}>
                  {chipLabel(part.region)}
                </span>
              )
            )}
          </p>
        ) : (
          <>
            {turn.regions.length > 0 && (
              <div className="qch-turn-chips">
                {turn.regions.map((region, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: a settled turn's chips are positional and may repeat verbatim
                  <span className="qch-chip" key={i}>
                    {chipLabel(region)}
                  </span>
                ))}
              </div>
            )}
            <p className="qch-text">{turn.text}</p>
          </>
        )}
      </div>
    </div>
  );
}

/** "Worked for 4s", expandable into what the model actually did: the tools it
 *  ran and the thinking it streamed. Collapsed by default — the answer is the
 *  point, the working is there when you doubt it. */
function ActivityTrail({
  elapsedMs,
  turn,
}: {
  elapsedMs: number | null;
  turn: ChatAssistantTurn;
}) {
  const [open, setOpen] = useState(false);
  const running = elapsedMs !== null;
  const ms = elapsedMs ?? turn.workedMs ?? 0;
  const hasTrail = turn.activity.length > 0 || turn.reasoning.length > 0;
  const label = running
    ? `Working… ${elapsedLabel(ms)}`
    : `Worked for ${elapsedLabel(ms)}`;

  if (!(hasTrail || running || turn.workedMs !== undefined)) {
    return null;
  }
  return (
    <div className="qch-trail">
      <button
        aria-expanded={open}
        className={cn("qch-trail-head", running && "qch-trail-running")}
        disabled={!hasTrail}
        onClick={() => setOpen((was) => !was)}
        type="button"
      >
        {hasTrail &&
          (open ? (
            <ChevronDown aria-hidden size={11} />
          ) : (
            <ChevronRight aria-hidden size={11} />
          ))}
        {label}
        {running && turn.activity.length > 0 && (
          <span className="qch-trail-now">{turn.activity.at(-1)}</span>
        )}
      </button>
      {open && hasTrail && (
        <div className="qch-trail-body">
          {turn.activity.map((line, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: the trail is append-only and two steps can read identically
            <p className="qch-trail-step" key={`${line}-${i}`}>
              {line}
            </p>
          ))}
          {turn.reasoning && (
            <p className="qch-trail-think">{turn.reasoning}</p>
          )}
        </div>
      )}
    </div>
  );
}

function CopyAnswer({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };
  return (
    <button
      aria-label="Copy answer"
      className="qch-act"
      onClick={copy}
      type="button"
    >
      {copied ? (
        <Check aria-hidden size={12} />
      ) : (
        <Copy aria-hidden size={12} />
      )}
    </button>
  );
}

function AssistantTurn({
  elapsedMs,
  pinned,
  render,
  turn,
}: {
  elapsedMs: number | null;
  pinned: boolean;
  render: (text: string) => ReactNode;
  turn: ChatAssistantTurn;
}) {
  const inFlight = turn.text === null && turn.error === null;
  const body = turn.text ?? (inFlight ? turn.partial : "");
  return (
    <div className="qch-turn qch-ai">
      <ActivityTrail elapsedMs={elapsedMs} turn={turn} />
      {body && <div className="qch-answer">{render(body)}</div>}
      {turn.error !== null && (
        <p className="qch-err" role="alert">
          {turn.error}
        </p>
      )}
      {!inFlight && (
        <div className="qch-turn-foot">
          {turn.text && <CopyAnswer text={turn.text} />}
          <TurnTime at={turn.at} pinned={pinned} />
        </div>
      )}
    </div>
  );
}

export function ChatPanel({
  composerRef,
  contextNote = null,
  onComposerChange,
  focusSeq,
  model = null,
  onEscape,
  onRemoveSkill,
  onRevealRegion,
  onSend,
  onStop,
  pending,
  staged = null,
  renderMarkdown = plainText,
  skill = null,
  suggestions = null,
  threads = null,
  turns,
}: ChatPanelProps) {
  const [threadsOpen, setThreadsOpen] = useState(false);
  const threadsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!threadsOpen) {
      return;
    }
    const onDown = (e: PointerEvent) => {
      if (!threadsRef.current?.contains(e.target as Node)) {
        setThreadsOpen(false);
      }
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [threadsOpen]);
  const localComposer = useRef<ChatComposerHandle>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [modelOpen, setModelOpen] = useState(false);

  const pickModel = (id: string) => {
    setModelOpen(false);
    model?.onPick(id);
    localComposer.current?.focus();
  };

  const closeModelPicker = () => {
    setModelOpen(false);
  };

  /* The popover's field blurs on mousedown, which would close it a beat before
     the click toggled it back open. So the trigger decides on mousedown and
     the click that follows is swallowed; a keyboard activation has no
     mousedown and falls through to the click. */
  const toggledByPointer = useRef(false);
  const onModelPointerDown = (e: React.MouseEvent) => {
    e.preventDefault();
    toggledByPointer.current = true;
    setModelOpen((open) => !open);
  };
  const onModelClick = () => {
    if (toggledByPointer.current) {
      toggledByPointer.current = false;
      return;
    }
    setModelOpen((open) => !open);
  };

  useEffect(() => {
    if (focusSeq > 0) {
      requestAnimationFrame(() => localComposer.current?.focus());
    }
  }, [focusSeq]);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!pending) {
      return;
    }
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [pending]);

  const lastTurn = turns.at(-1);
  const streamLength =
    lastTurn?.kind === "assistant" ? lastTurn.partial.length : 0;

  // biome-ignore lint/correctness/useExhaustiveDependencies: turn count and stream growth are exactly the moments the transcript should follow its tail
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [turns.length, streamLength]);

  const send = () => {
    if (pending) {
      return;
    }
    onSend();
  };

  /** Returns true when the suggestion list swallowed the key. */
  const onComposerKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!suggestions || suggestions.items.length === 0) {
      return false;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      suggestions.onMove(1);
      return true;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      suggestions.onMove(-1);
      return true;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      suggestions.onPick(suggestions.items[suggestions.selected]);
      return true;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      suggestions.onDismiss();
      return true;
    }
    return false;
  };

  return (
    <section aria-label="Review chat" className="qch-panel">
      {threads && threads.items.length > 0 && (
        <div className="qch-threads" ref={threadsRef}>
          <button
            aria-expanded={threadsOpen}
            className="qch-thread-current q-focus"
            onClick={() => setThreadsOpen((open) => !open)}
            type="button"
          >
            <span className="qch-thread-title">
              {threads.items.find((t) => t.id === threads.active)?.title ??
                "New chat"}
            </span>
            <ChevronDown aria-hidden size={11} />
          </button>
          <button
            className="qch-thread-new q-focus"
            onClick={() => {
              setThreadsOpen(false);
              threads.onNew();
            }}
            type="button"
          >
            <Plus aria-hidden size={12} /> New chat
          </button>
          {threadsOpen && (
            <div className="qch-thread-list">
              {threads.items.map((item) => (
                <div
                  className="qch-thread-row"
                  data-active={item.id === threads.active}
                  key={item.id}
                >
                  <button
                    className="qch-thread-pick"
                    onClick={() => {
                      setThreadsOpen(false);
                      threads.onPick(item.id);
                    }}
                    type="button"
                  >
                    {item.title}
                  </button>
                  <button
                    aria-label={`Delete chat ${item.title}`}
                    className="qch-chip-x"
                    onClick={() => threads.onRemove(item.id)}
                    type="button"
                  >
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="qch-scroll" ref={scrollRef}>
        {turns.length === 0 && (
          <p className="qch-hint">
            Chat about this pull request or its codebase. Add code with the
            cursor or a selection, ask for a review pass, and answers come from
            your configured provider and stay on this machine.
          </p>
        )}
        {turns.map((turn, i) =>
          turn.kind === "user" ? (
            <UserTurn key={turn.id} turn={turn} />
          ) : (
            <AssistantTurn
              elapsedMs={
                turn.startedAt ? Math.max(now - turn.startedAt, 0) : null
              }
              key={turn.id}
              pinned={i === turns.length - 1}
              render={renderMarkdown}
              turn={turn}
            />
          )
        )}
      </div>

      {staged && staged.items.length > 0 && (
        <div className="qch-staged">
          <p className="qch-staged-head">
            {staged.items.length} comment
            {staged.items.length === 1 ? "" : "s"} waiting in your review
          </p>
          {staged.items.map((item) => (
            <div className="qch-staged-row" key={item.id}>
              <button
                className="qch-staged-go"
                onClick={() => staged.onReveal(item.id)}
                type="button"
              >
                <span className="qch-staged-where">{item.label}</span>
                <span className="qch-staged-body">{item.body}</span>
              </button>
              <button
                aria-label={`Discard the comment on ${item.label}`}
                className="qch-chip-x"
                onClick={() => staged.onDiscard(item.id)}
                type="button"
              >
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="qch-foot">
        {suggestions &&
          (suggestions.items.length > 0 ? (
            <CannedSuggestions
              items={suggestions.items}
              onPick={suggestions.onPick}
              query={suggestions.query}
              selected={suggestions.selected}
            />
          ) : (
            suggestions.emptyHint && (
              <div className="qch-suggest-empty">{suggestions.emptyHint}</div>
            )
          ))}
        {contextNote !== null && <p className="qch-note">{contextNote}</p>}
        <div className="qch-composer">
          {skill !== null && (
            <div className="qch-chips">
              <span className="qch-chip qch-skill-chip">
                <span className="qch-chip-label">/{skill}</span>
                <button
                  aria-label={`Remove skill ${skill}`}
                  className="qch-chip-x"
                  onClick={onRemoveSkill}
                  type="button"
                >
                  <X size={11} />
                </button>
              </span>
            </div>
          )}
          <div className="qch-field">
            <ChatComposer
              onChange={onComposerChange}
              onEscape={onEscape}
              onKeyDown={onComposerKeyDown}
              onRevealRegion={onRevealRegion}
              onSend={send}
              placeholder={
                turns.length > 0 ? "Reply…" : "Ask about this pull request…"
              }
              ref={mergeComposerRefs(localComposer, composerRef)}
            />
            {pending ? (
              <button
                className="qch-stop q-focus"
                onClick={onStop}
                type="button"
              >
                Stop
              </button>
            ) : (
              <button
                aria-label="Send"
                className="qch-send q-focus"
                onClick={send}
                type="button"
              >
                <CornerDownLeft aria-hidden size={13} />
              </button>
            )}
          </div>
        </div>
        {model && modelOpen && (
          <ModelPicker
            anchorSelector=".qch-model"
            current={model.current}
            models={model.models}
            onClose={closeModelPicker}
            onPick={pickModel}
          />
        )}
        <div className="qch-footer-row">
          {model && (
            <button
              aria-expanded={modelOpen}
              aria-label={`Model: ${model.current}. Change model`}
              className="qch-model q-focus"
              onClick={onModelClick}
              onMouseDown={onModelPointerDown}
              type="button"
            >
              <span className="qch-model-id">{model.current}</span>
              <ChevronDown aria-hidden size={11} />
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
