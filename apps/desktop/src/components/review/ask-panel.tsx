/**
 * The drawer's Ask mode (docs/AI.md): a question box over the current
 * selection, cursor row, or whole PR, answered by the user's own AI provider
 * via the Rust `ai_ask` command. Exchanges live in component state only — they
 * are review-session scratch, not data worth persisting. The context chip
 * names exactly what will be sent before the user asks; nothing is sent until
 * they do. Mirrors the info drawer's scrim + aside markup so `a` and `i` feel
 * like two faces of the same surface.
 */
import { useMutation } from "@tanstack/react-query";
import { CornerDownLeft, Sparkles, X } from "lucide-react";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { api } from "../../lib/api.ts";
import { cn } from "../../lib/cn.ts";
import type { AiAskContext } from "../../types.ts";
import { Markdown } from "../markdown.tsx";
import { Spinner } from "../ui/spinner.tsx";

interface AskExchange {
  answer: string | null;
  error: string | null;
  id: number;
  question: string;
}

let nextExchangeId = 0;

export function AskPanel({
  buildContext,
  onClose,
  open,
  targetLabel,
  wide,
}: {
  buildContext: () => AiAskContext;
  onClose: () => void;
  open: boolean;
  targetLabel: string;
  wide: boolean;
}) {
  const [exchanges, setExchanges] = useState<AskExchange[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const settleLastExchange = (patch: Partial<AskExchange>) => {
    setExchanges((list) => {
      const last = list.at(-1);
      if (!last || last.answer !== null || last.error !== null) {
        return list;
      }
      return [...list.slice(0, -1), { ...last, ...patch }];
    });
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const ask = useMutation({
    mutationFn: (args: { question: string; context: AiAskContext }) =>
      api.aiAsk(args),
    onError: (error) => settleLastExchange({ error: String(error) }),
    onSuccess: (answer) => {
      settleLastExchange({ answer });
      requestAnimationFrame(() => {
        bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight });
      });
    },
  });

  const submit = () => {
    const question = inputRef.current?.value.trim() ?? "";
    if (!question || ask.isPending) {
      return;
    }
    if (inputRef.current) {
      inputRef.current.value = "";
    }
    nextExchangeId += 1;
    setExchanges((list) => [
      ...list,
      { answer: null, error: null, id: nextExchangeId, question },
    ]);
    ask.mutate({ context: buildContext(), question });
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

  if (!open) {
    return null;
  }

  return (
    <>
      <button
        aria-hidden
        className="qf-drawer-scrim qf-drawer-open"
        onClick={onClose}
        tabIndex={-1}
        type="button"
      />
      <aside
        aria-label="Ask about code"
        className={cn("qf-drawer qf-drawer-open", wide && "qf-drawer-wide")}
      >
        <div className="qf-drawer-head">
          <span className="qf-drawer-title flex items-center gap-2">
            <Sparkles aria-hidden className="text-accent" size={14} />
            Ask about code
          </span>
          <div className="qf-drawer-head-actions">
            <button
              aria-label="Close panel"
              className="qf-drawer-close qf-focusable"
              onClick={onClose}
              type="button"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        <div
          className="qf-drawer-body flex flex-col gap-4 px-4 py-3"
          ref={bodyRef}
        >
          {exchanges.length === 0 && (
            <p className="text-faint text-xs">
              Ask about the selected lines, the line under the cursor, or the
              whole pull request. Answers come from your configured provider.
            </p>
          )}
          {exchanges.map((exchange) => (
            <div className="flex flex-col gap-2" key={exchange.id}>
              <p className="font-medium text-fg text-sm">{exchange.question}</p>
              {exchange.answer !== null && (
                <Markdown className="text-sm">{exchange.answer}</Markdown>
              )}
              {exchange.error !== null && (
                <p className="text-danger text-xs" role="alert">
                  {exchange.error}
                </p>
              )}
              {exchange.answer === null && exchange.error === null && (
                <Spinner />
              )}
            </div>
          ))}
        </div>

        <div className="border-line border-t px-4 py-3">
          <div className="mb-2 flex items-center gap-2">
            <span className="rounded border border-line px-1.5 py-0.5 font-mono text-[11px] text-muted">
              {targetLabel}
            </span>
          </div>
          <div className="relative">
            <input
              aria-label="Question"
              autoComplete="off"
              className="q-input pr-8"
              disabled={ask.isPending}
              onKeyDown={onInputKeyDown}
              placeholder="Ask a question…"
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
    </>
  );
}
