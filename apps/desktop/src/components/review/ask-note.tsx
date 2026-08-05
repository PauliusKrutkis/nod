/**
 * The inline AI note (docs/AI.md): ask-about-code renders under the row it is
 * about — or above the first file for whole-PR questions — instead of in a
 * drawer, so the answer lands in the reader's line of sight next to its
 * subject. The skin is the third comment material: posted threads are solid
 * cards on surface, pending comments are dashed with the accent wash, and the
 * AI note is a dotted hairline with no fill — ink on the page, not paper —
 * so nothing machine-written can be mistaken for something published. State
 * lives in use-ask-note.ts because this component is virtualized away when
 * scrolled out of frame. "Start comment from this" hands the answer to the
 * normal composer as plain editable text: ask is a drafting step inside
 * review, not a chat. Focus follows two signals: focusSeq bumps per `a`
 * press (rAF, because the note mounts a frame after the model rebuild picks
 * its slot up), and the input — disabled while an ask is in flight — takes
 * focus back the moment it re-enables so the follow-up can be typed
 * immediately.
 */
import { CornerDownLeft, Sparkles, X } from "lucide-react";
import { type KeyboardEvent, useEffect, useRef } from "react";
import type { AskExchange } from "../../hooks/use-ask-note.ts";
import { Markdown } from "../markdown.tsx";
import { Spinner } from "../ui/spinner.tsx";

export interface AskNoteProps {
  exchanges: AskExchange[];
  focusSeq: number;
  label: string;
  onClose: () => void;
  /** null hides the action — a whole-PR answer has no line to comment on. */
  onPromote: ((text: string) => void) | null;
  onSubmit: (question: string) => void;
  pending: boolean;
}

function AskActions({
  exchange,
  onPromote,
}: {
  exchange: AskExchange;
  onPromote: AskNoteProps["onPromote"];
}) {
  const answer = exchange.answer;
  if (answer === null) {
    return null;
  }
  const handlePromote = () => onPromote?.(answer);
  const handleCopy = () => {
    navigator.clipboard?.writeText(answer);
  };
  return (
    <div className="qf-ask-actions">
      {onPromote && (
        <button
          className="qf-ask-act qf-focusable"
          onClick={handlePromote}
          type="button"
        >
          Start comment from this
        </button>
      )}
      <button
        className="qf-ask-act qf-focusable"
        onClick={handleCopy}
        type="button"
      >
        Copy
      </button>
    </div>
  );
}

export function AskNote({
  exchanges,
  focusSeq,
  label,
  onClose,
  onPromote,
  onSubmit,
  pending,
}: AskNoteProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (focusSeq > 0) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [focusSeq]);

  useEffect(() => {
    if (!pending) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [pending]);

  const submit = () => {
    const question = inputRef.current?.value.trim() ?? "";
    if (!question || pending) {
      return;
    }
    if (inputRef.current) {
      inputRef.current.value = "";
    }
    onSubmit(question);
  };

  const onInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <aside aria-label="Ask about code" className="qf-ask">
      <div className="qf-ask-head">
        <Sparkles aria-hidden className="qf-ask-spark" size={13} />
        <span className="qf-ask-title">Ask about code</span>
        <span className="qf-ask-local">you · local</span>
        <button
          aria-label="Close ask"
          className="qf-ask-close qf-focusable"
          onClick={onClose}
          type="button"
        >
          <X size={13} />
        </button>
      </div>

      {exchanges.length === 0 && (
        <p className="qf-ask-hint">
          Ask about the selected lines, the line under the cursor, or the whole
          pull request. Answers come from your configured provider and stay on
          this machine.
        </p>
      )}
      {exchanges.map((exchange) => (
        <div className="qf-ask-x" key={exchange.id}>
          <p className="qf-ask-q">{exchange.question}</p>
          {exchange.answer !== null && (
            <Markdown className="qf-ask-a">{exchange.answer}</Markdown>
          )}
          {exchange.error !== null && (
            <p className="qf-ask-err" role="alert">
              {exchange.error}
            </p>
          )}
          {exchange.answer === null &&
            exchange.error === null &&
            (exchange.partial ? (
              <Markdown className="qf-ask-a">{exchange.partial}</Markdown>
            ) : (
              <Spinner />
            ))}
          <AskActions exchange={exchange} onPromote={onPromote} />
        </div>
      ))}

      <div className="qf-ask-foot">
        <span className="qf-ask-chip">{label}</span>
        <div className="relative">
          <input
            aria-label="Question"
            autoComplete="off"
            className="q-input pr-8"
            disabled={pending}
            onKeyDown={onInputKeyDown}
            placeholder={
              exchanges.length > 0 ? "Ask a follow-up…" : "Ask a question…"
            }
            ref={inputRef}
            spellCheck={true}
          />
          <CornerDownLeft
            aria-hidden
            className="absolute top-1/2 right-2.5 -translate-y-1/2 text-faint"
            size={13}
          />
        </div>
      </div>
    </aside>
  );
}
