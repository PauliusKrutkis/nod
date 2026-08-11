/**
 * The inline AI note (docs/AI.md): ask-about-code renders under the row it is
 * about — or above the first file for whole-PR questions — instead of in a
 * drawer, so the answer lands in the reader's line of sight next to its
 * subject. The skin is the third comment material: posted threads are solid
 * cards on surface, pending comments are dashed with the accent wash, and the
 * AI note is a dotted hairline with no fill — ink on the page, not paper —
 * so nothing machine-written can be mistaken for something published.
 *
 * Conversation state belongs to the caller, not here: the note renders inside
 * a virtualized list, so scrolling it out of frame unmounts it and an answer
 * must survive that. "Start comment from this" hands the answer to the normal
 * composer as plain editable text: ask is a drafting step inside review, not a
 * chat (onPromote is null on whole-PR asks — no line to comment on).
 *
 * `renderAnswer` is how a host with a markdown renderer supplies one; the
 * built-in fallback renders the answer as literal paragraphs, which is also
 * what guarantees an answer full of markup is read, never executed.
 *
 * Focus follows two signals: focusSeq bumps per `a` press (rAF, because the
 * note mounts a frame after the model rebuild picks its slot up), and the
 * input — disabled while an ask is in flight — takes focus back the moment it
 * re-enables so the follow-up can be typed immediately.
 */

import { CornerDownLeft, Sparkles, X } from "lucide-react";
import { type KeyboardEvent, type ReactNode, useEffect, useRef } from "react";
import { Spinner } from "../spinner/spinner.tsx";
import "./ask-note.css";

export interface AskNoteExchange {
  answer: string | null;
  error: string | null;
  id: number;
  partial: string;
  question: string;
}

export interface AskNoteProps {
  exchanges: readonly AskNoteExchange[];
  focusSeq: number;
  label: string;
  onClose: () => void;
  onPromote: ((text: string) => void) | null;
  onSubmit: (question: string) => void;
  pending: boolean;
  renderAnswer?: (text: string) => ReactNode;
}

function plainAnswer(text: string): ReactNode {
  return <p className="qf-ask-para">{text}</p>;
}

function AskAnswer({
  render,
  text,
}: {
  render: (text: string) => ReactNode;
  text: string;
}) {
  return <div className="qf-ask-a">{render(text)}</div>;
}

function AskActions({
  exchange,
  onPromote,
}: {
  exchange: AskNoteExchange;
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
          className="qf-ask-act q-focus"
          onClick={handlePromote}
          type="button"
        >
          Start comment from this
        </button>
      )}
      <button className="qf-ask-act q-focus" onClick={handleCopy} type="button">
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
  renderAnswer = plainAnswer,
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
          className="qf-ask-close q-focus"
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
            <AskAnswer render={renderAnswer} text={exchange.answer} />
          )}
          {exchange.error !== null && (
            <p className="qf-ask-err" role="alert">
              {exchange.error}
            </p>
          )}
          {exchange.answer === null &&
            exchange.error === null &&
            (exchange.partial ? (
              <AskAnswer render={renderAnswer} text={exchange.partial} />
            ) : (
              <Spinner />
            ))}
          <AskActions exchange={exchange} onPromote={onPromote} />
        </div>
      ))}

      <div className="qf-ask-foot">
        <span className="qf-ask-chip">{label}</span>
        <div className="qf-ask-field">
          <input
            aria-label="Question"
            autoComplete="off"
            className="qf-ask-input"
            disabled={pending}
            onKeyDown={onInputKeyDown}
            placeholder={
              exchanges.length > 0 ? "Ask a follow-up…" : "Ask a question…"
            }
            ref={inputRef}
            spellCheck={true}
          />
          <CornerDownLeft aria-hidden className="qf-ask-enter" size={13} />
        </div>
      </div>
    </aside>
  );
}
