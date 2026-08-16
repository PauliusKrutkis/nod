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

import { CornerDownLeft, Sparkles, X } from "lucide-react";
import {
  type ClipboardEvent,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useRef,
} from "react";
import { CannedSuggestions } from "../canned-suggestions/canned-suggestions.tsx";
import { Spinner } from "../spinner/spinner.tsx";
import "./chat-panel.css";

export interface ChatRegionChip {
  code: string;
  filePath: string;
  lineRange: string;
  side: string;
}

export interface ChatUserTurn {
  kind: "user";
  id: string;
  regions: readonly ChatRegionChip[];
  skill?: string;
  text: string;
}

export interface ChatAssistantTurn {
  kind: "assistant";
  error: string | null;
  id: string;
  partial: string;
  text: string | null;
  toolNote: string | null;
}

export type ChatPanelTurn = ChatUserTurn | ChatAssistantTurn;

export interface ChatProposalsSummary {
  count: number;
  onAcceptAll: () => void;
  onDiscardAll: () => void;
}

export interface ChatSuggestionsState {
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
  onChangeComposer: (value: string) => void;
  onEscape?: () => void;
  onPasteCode?: (code: string) => void;
  onRemoveChip: (index: number) => void;
  onSend: () => void;
  onStop: () => void;
  onRemoveSkill?: () => void;
  pending: boolean;
  proposals?: ChatProposalsSummary | null;
  renderMarkdown?: (text: string) => ReactNode;
  skill?: string | null;
  suggestions?: ChatSuggestionsState | null;
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

function UserTurn({ turn }: { turn: ChatUserTurn }) {
  return (
    <div className="qch-turn qch-user">
      <div className="qch-turn-head">
        <span className="qch-who">you</span>
        {turn.skill !== undefined && (
          <span className="qch-chip">/{turn.skill}</span>
        )}
      </div>
      {turn.regions.length > 0 && (
        <div className="qch-turn-chips">
          {turn.regions.map((region, i) => (
            <span className="qch-chip" key={`${chipLabel(region)}-${i}`}>
              {chipLabel(region)}
            </span>
          ))}
        </div>
      )}
      <p className="qch-text">{turn.text}</p>
    </div>
  );
}

function AssistantTurn({
  render,
  turn,
}: {
  render: (text: string) => ReactNode;
  turn: ChatAssistantTurn;
}) {
  const inFlight = turn.text === null && turn.error === null;
  return (
    <div className="qch-turn qch-ai">
      <div className="qch-turn-head">
        <Sparkles aria-hidden className="qch-spark" size={13} />
        <span className="qch-who">local</span>
      </div>
      {turn.text !== null && (
        <div className="qch-answer">{render(turn.text)}</div>
      )}
      {turn.error !== null && (
        <p className="qch-err" role="alert">
          {turn.error}
        </p>
      )}
      {inFlight && turn.partial && (
        <div className="qch-answer">{render(turn.partial)}</div>
      )}
      {inFlight && turn.toolNote !== null && (
        <p className="qch-tool">{turn.toolNote}</p>
      )}
      {inFlight && !(turn.partial || turn.toolNote !== null) && (
        <span className="qch-thinking">
          <Spinner /> Thinking…
        </span>
      )}
    </div>
  );
}

export function ChatPanel({
  chips,
  composerValue,
  contextNote = null,
  focusSeq,
  onChangeComposer,
  onEscape,
  onPasteCode,
  onRemoveChip,
  onRemoveSkill,
  onSend,
  onStop,
  pending,
  proposals = null,
  renderMarkdown = plainText,
  skill = null,
  suggestions = null,
  turns,
}: ChatPanelProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (focusSeq > 0) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [focusSeq]);

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
      <div className="qch-scroll" ref={scrollRef}>
        {turns.length === 0 && (
          <p className="qch-hint">
            Chat about this pull request or its codebase. Add code with the
            cursor or a selection, ask for a review pass, and answers come from
            your configured provider and stay on this machine.
          </p>
        )}
        {turns.map((turn) =>
          turn.kind === "user" ? (
            <UserTurn key={turn.id} turn={turn} />
          ) : (
            <AssistantTurn key={turn.id} render={renderMarkdown} turn={turn} />
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
        {suggestions && (
          <CannedSuggestions
            items={suggestions.items}
            onPick={suggestions.onPick}
            query={suggestions.query}
            selected={suggestions.selected}
          />
        )}
        {(chips.length > 0 || skill !== null) && (
          <div className="qch-chips">
            {skill !== null && (
              <span className="qch-chip qch-skill-chip">
                /{skill}
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
                {chipLabel(chip)}
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
        {contextNote !== null && <p className="qch-note">{contextNote}</p>}
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
            <button className="qch-stop q-focus" onClick={onStop} type="button">
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
    </div>
  );
}
