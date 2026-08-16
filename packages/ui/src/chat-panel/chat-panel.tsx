/**
 * The review chat surface (docs/AI.md § Second surface), seated in the
 * right dock's Chat tab. A transcript of turns, a row of pending region
 * chips, and a plain-textarea composer — a prompt box, not a document
 * editor, so no TipTap here. Conversation state belongs to the caller: the
 * panel is a pure function of its props, which is what lets the host
 * persist history per PR and lets every state be shot in the gallery.
 *
 * The machine half wears the AI material vocabulary: sparkle glyph and the
 * `local` tag, ink on the page — nothing here can be mistaken for a posted
 * comment. A turn in flight shows its streamed partial as it grows, the
 * current tool activity as a one-line status ("Searching for …"), and a
 * spinner only before the first delta. Send is disabled while a turn is in
 * flight (one at a time per chat); Stop takes its place and is the only
 * button that stays live.
 *
 * `renderMarkdown` is the host's markdown pipeline; the built-in fallback
 * renders answers as literal paragraphs, which is also what guarantees an
 * answer full of markup is read, never executed. `proposals` is the
 * suggested-comments summary slot: how many this conversation has staged in
 * the diff, with accept-all / discard-all — the cards themselves live at
 * their anchors in the diff, not here. `suggestions` renders the composer's
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
  Wrench,
  X,
} from "lucide-react";
import {
  type ClipboardEvent,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import type { AiSetupModel } from "../ai-model-combobox/ai-model-combobox.tsx";
import { CannedSuggestions } from "../canned-suggestions/canned-suggestions.tsx";
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

export interface ChatProposalsSummary {
  count: number;
  onAcceptAll: () => void;
  onDiscardAll: () => void;
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
  chips: readonly ChatRegionChip[];
  composerValue: string;
  contextNote?: string | null;
  focusSeq: number;
  model?: ChatModelState | null;
  onChangeComposer: (value: string) => void;
  onEscape?: () => void;
  onPasteCode?: (code: string) => void;
  onOpenSkills?: () => void;
  onRemoveChip: (index: number) => void;
  /** Reveal a chip's lines in the diff. Absent for pasted code, which has
   *  no place in the diff to point at. */
  onRevealChip?: (index: number) => void;
  onSend: () => void;
  onStop: () => void;
  onRemoveSkill?: () => void;
  /** How many skills are reachable right now — the button says "Add skills"
   *  when there are none, which is the honest empty state. */
  skillCount?: number;
  pending: boolean;
  proposals?: ChatProposalsSummary | null;
  renderMarkdown?: (text: string) => ReactNode;
  skill?: string | null;
  suggestions?: ChatSuggestionsState | null;
  threads?: ChatThreadsState | null;
  turns: readonly ChatPanelTurn[];
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

function UserTurn({ pinned, turn }: { pinned: boolean; turn: ChatUserTurn }) {
  return (
    <div className="qch-turn qch-user">
      <div className="qch-bubble">
        {(turn.regions.length > 0 || turn.skill !== undefined) && (
          <div className="qch-turn-chips">
            {turn.skill !== undefined && (
              <span className="qch-chip qch-skill-chip">/{turn.skill}</span>
            )}
            {turn.regions.map((region, i) => (
              <span className="qch-chip" key={`${chipLabel(region)}-${i}`}>
                {chipLabel(region)}
              </span>
            ))}
          </div>
        )}
        <p className="qch-text">{turn.text}</p>
      </div>
      <div className="qch-turn-foot">
        <TurnTime at={turn.at} pinned={pinned} />
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
  chips,
  composerValue,
  contextNote = null,
  focusSeq,
  model = null,
  onChangeComposer,
  onEscape,
  onOpenSkills,
  onPasteCode,
  onRemoveChip,
  onRemoveSkill,
  onRevealChip,
  onSend,
  onStop,
  pending,
  proposals = null,
  renderMarkdown = plainText,
  skill = null,
  skillCount = 0,
  suggestions = null,
  threads = null,
  turns,
}: ChatPanelProps) {
  const [threadsOpen, setThreadsOpen] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [modelOpen, setModelOpen] = useState(false);

  const pickModel = (id: string) => {
    setModelOpen(false);
    model?.onPick(id);
    inputRef.current?.focus();
  };

  const closeModelPicker = () => {
    setModelOpen(false);
  };

  useEffect(() => {
    if (focusSeq > 0) {
      requestAnimationFrame(() => inputRef.current?.focus());
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
    if (pending || !composerValue.trim()) {
      return;
    }
    onSend();
  };

  const onInputKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggestions && suggestions.items.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        suggestions.onMove(1);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        suggestions.onMove(-1);
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        suggestions.onPick(suggestions.items[suggestions.selected]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        suggestions.onDismiss();
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onEscape?.();
    }
  };

  const onInputPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const text = e.clipboardData.getData("text/plain");
    if (onPasteCode && text.includes("\n") && text.trim()) {
      e.preventDefault();
      onPasteCode(text);
    }
  };

  return (
    <div aria-label="Review chat" className="qch-panel">
      {threads && threads.items.length > 0 && (
        <div className="qch-threads">
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
            <UserTurn
              key={turn.id}
              pinned={i === turns.length - 1}
              turn={turn}
            />
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

      {proposals && proposals.count > 0 && (
        <div className="qch-proposals">
          <span className="qch-proposals-count">
            {proposals.count} suggested{" "}
            {proposals.count === 1 ? "comment" : "comments"} in the diff
          </span>
          <button
            className="qch-proposals-act q-focus"
            onClick={proposals.onAcceptAll}
            type="button"
          >
            Accept all
          </button>
          <button
            className="qch-proposals-act qch-proposals-discard q-focus"
            onClick={proposals.onDiscardAll}
            type="button"
          >
            Discard all
          </button>
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
          {(chips.length > 0 || skill !== null) && (
            <div className="qch-chips">
              {skill !== null && (
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
              )}
              {chips.map((chip, i) => (
                <span className="qch-chip" key={`${chipLabel(chip)}-${i}`}>
                  {chip.filePath && onRevealChip ? (
                    <button
                      className="qch-chip-label qch-chip-go"
                      onClick={() => onRevealChip(i)}
                      title={`Show ${chipLabel(chip)} in the diff`}
                      type="button"
                    >
                      {chipLabel(chip)}
                    </button>
                  ) : (
                    <span className="qch-chip-label">{chipLabel(chip)}</span>
                  )}
                  <button
                    aria-label={`Remove ${chipLabel(chip)}`}
                    className="qch-chip-x"
                    onClick={() => onRemoveChip(i)}
                    type="button"
                  >
                    <X size={11} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="qch-field">
            <textarea
              aria-label="Message"
              className="qch-input"
              onChange={(e) => onChangeComposer(e.target.value)}
              onKeyDown={onInputKeyDown}
              onPaste={onInputPaste}
              placeholder={
                turns.length > 0 ? "Reply…" : "Ask about this pull request…"
              }
              ref={inputRef}
              rows={2}
              spellCheck={true}
              value={composerValue}
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
                disabled={!composerValue.trim()}
                onClick={send}
                type="button"
              >
                <CornerDownLeft aria-hidden size={13} />
              </button>
            )}
          </div>
        </div>
        <div className="qch-footer-row">
          {onOpenSkills && (
            <button
              className="qch-skills-btn q-focus"
              onClick={onOpenSkills}
              title="Skills are SKILL.md files. Opens your skills folder."
              type="button"
            >
              <Wrench aria-hidden size={11} />
              {skillCount === 0 ? "Add skills" : `Skills (${skillCount})`}
            </button>
          )}
          {model && (
            <div className="qch-model-row">
              {modelOpen && (
                <ModelPicker
                  current={model.current}
                  models={model.models}
                  onClose={closeModelPicker}
                  onPick={pickModel}
                />
              )}
              <button
                aria-expanded={modelOpen}
                aria-label={`Model: ${model.current}. Change model`}
                className="qch-model q-focus"
                onClick={() => setModelOpen((open) => !open)}
                type="button"
              >
                <span className="qch-model-id">{model.current}</span>
                <ChevronDown aria-hidden size={11} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
