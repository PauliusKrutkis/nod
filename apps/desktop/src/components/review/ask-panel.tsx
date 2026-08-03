/**
 * The drawer's Ask mode (docs/AI.md): a question box over the current
 * selection, cursor row, or whole PR, answered by the user's own AI provider
 * via the Rust `ai_ask` command. Answers stream in: Rust emits `ai-ask-delta`
 * events keyed by a per-question askId, the pending exchange accumulates them
 * as `partial` (batched per animation frame so token-rate events don't force
 * token-rate markdown re-parses), and the mutation's resolved value replaces the
 * final text (in a mocked environment with no events, the spinner simply
 * holds until the promise resolves). Exchanges live in component state only —
 * they are review-session scratch, not data worth persisting. The context
 * chip names exactly what will be sent before the user asks; nothing is sent
 * until they do. Mirrors the info drawer's scrim + aside markup so `a` and
 * `i` feel like two faces of the same surface.
 */
import { useMutation } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { CornerDownLeft, Sparkles, X } from "lucide-react";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { api } from "../../lib/api.ts";
import { cn } from "../../lib/cn.ts";
import type { AiAskContext } from "../../types.ts";
import { Markdown } from "../markdown.tsx";
import { Spinner } from "../ui/spinner.tsx";

interface AskExchange {
  answer: string | null;
  askId: string;
  error: string | null;
  id: number;
  partial: string;
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

  useEffect(() => {
    const pending = new Map<string, string>();
    let flushFrame = 0;
    const flushDeltas = () => {
      flushFrame = 0;
      const batch = new Map(pending);
      pending.clear();
      setExchanges((list) =>
        list.map((exchange) => {
          const text = batch.get(exchange.askId);
          return text && exchange.answer === null && exchange.error === null
            ? { ...exchange, partial: exchange.partial + text }
            : exchange;
        })
      );
    };
    const unlisten = listen<{ askId: string; text: string }>(
      "ai-ask-delta",
      (event) => {
        pending.set(
          event.payload.askId,
          (pending.get(event.payload.askId) ?? "") + event.payload.text
        );
        if (!flushFrame) {
          flushFrame = requestAnimationFrame(flushDeltas);
        }
      }
    );
    return () => {
      if (flushFrame) {
        cancelAnimationFrame(flushFrame);
      }
      unlisten.then((stop) => stop());
    };
  }, []);

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

  // react-doctor-disable-next-line query-mutation-missing-invalidation -- an ask is a one-shot completion, not cached server state; there is no query to invalidate
  const ask = useMutation({
    mutationFn: (args: {
      question: string;
      context: AiAskContext;
      askId: string;
    }) => api.aiAsk(args),
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
    const askId = crypto.randomUUID();
    setExchanges((list) => [
      ...list,
      {
        answer: null,
        askId,
        error: null,
        id: nextExchangeId,
        partial: "",
        question,
      },
    ]);
    ask.mutate({ askId, context: buildContext(), question });
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
              {exchange.answer === null &&
                exchange.error === null &&
                (exchange.partial ? (
                  <Markdown className="text-sm">{exchange.partial}</Markdown>
                ) : (
                  <Spinner />
                ))}
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
