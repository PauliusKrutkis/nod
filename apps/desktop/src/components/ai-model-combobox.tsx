/**
 * The model picker for the ask-about-code setup dialog. A provider's model
 * list is not a short list — OpenRouter alone returns hundreds, in the
 * provider's own order — so this filters as you type rather than making you
 * scroll a native select. It also accepts an id the endpoint never enumerated:
 * the backend stores `model` as a plain string, so a model missing from
 * `/v1/models` is still reachable instead of being unpickable.
 *
 * The input keeps DOM focus for the whole dialog, which is what lets the
 * parent's Tab-armed ring work — `onKeyDown` runs the list's own keys first
 * and hands everything else, Tab included, to the parent. Escape closes the
 * list when it is open and is otherwise left alone, so the second Escape
 * closes the dialog.
 *
 * Committing is deliberately explicit (Enter, or a click). Typing alone never
 * saves, because every keystroke would otherwise be a write to the provider
 * config and a half-typed id would be persisted on the way to a real one.
 *
 * The input is never disabled, not even while the model list loads. A disabled
 * input cannot take focus, and the dialog places focus here on open, so
 * disabling it would drop focus on the floor and leave the parent's Tab ring
 * dead until something else claimed it.
 *
 * The list opens on typing or on an arrow key, never merely on focus. Focus
 * lands here the moment the dialog opens, so opening with it would drop a
 * panel over the footer unasked and, worse, swallow every Enter — the parent
 * reads Enter to run whichever action Tab has armed, and a list that is always
 * open would answer it first.
 */
import { ChevronDown } from "lucide-react";
import { type KeyboardEvent, useId, useState } from "react";
import { cn } from "../lib/cn.ts";
import type { AiModel } from "../types.ts";

interface ModelRow {
  id: string;
  contextLength: number | null;
  freeText: boolean;
}

function contextChip(contextLength: number | null): string {
  if (!contextLength) {
    return "";
  }
  return `${Math.round(contextLength / 1000)}k`;
}

function buildRows(models: AiModel[], query: string): ModelRow[] {
  const trimmed = query.trim();
  const needle = trimmed.toLowerCase();
  const matches = models
    .filter((m) => m.id.toLowerCase().includes(needle))
    .map((m) => ({
      contextLength: m.contextLength,
      freeText: false,
      id: m.id,
    }));
  if (!trimmed || models.some((m) => m.id === trimmed)) {
    return matches;
  }
  return [...matches, { contextLength: null, freeText: true, id: trimmed }];
}

export function AiModelCombobox({
  loading,
  models,
  onCommit,
  onKeyDownFallthrough,
  ref,
  value,
}: {
  loading: boolean;
  models: AiModel[];
  onCommit: (id: string) => void;
  onKeyDownFallthrough: (e: KeyboardEvent<HTMLElement>) => void;
  ref: React.Ref<HTMLInputElement>;
  value: string | null;
}) {
  const listId = useId();
  const optionIdPrefix = useId();
  const [query, setQuery] = useState(value ?? "");
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(0);

  const rows = open ? buildRows(models, query) : [];
  const active = rows[Math.min(sel, rows.length - 1)];

  const commit = (row: ModelRow | undefined) => {
    if (!row) {
      return;
    }
    setQuery(row.id);
    setOpen(false);
    setSel(0);
    onCommit(row.id);
  };

  const moveSelection = (delta: number) => {
    setOpen(true);
    setSel((current) => {
      const count = buildRows(models, query).length;
      if (count === 0) {
        return 0;
      }
      return (current + delta + count) % count;
    });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveSelection(1);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      moveSelection(-1);
      return;
    }
    if (e.key === "Enter" && open) {
      e.preventDefault();
      commit(active);
      return;
    }
    if (e.key === "Escape" && open) {
      e.preventDefault();
      e.stopPropagation();
      setQuery(value ?? "");
      setOpen(false);
      return;
    }
    onKeyDownFallthrough(e);
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="relative">
        <input
          aria-activedescendant={
            active ? `${optionIdPrefix}-${active.id}` : undefined
          }
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={open}
          aria-label="Model"
          autoComplete="off"
          className="q-input pr-8 font-mono"
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setSel(0);
          }}
          onKeyDown={onKeyDown}
          placeholder={loading ? "Loading models…" : "Search or paste a model"}
          ref={ref}
          role="combobox"
          spellCheck={false}
          value={query}
        />
        <ChevronDown
          aria-hidden
          className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-faint"
          size={13}
        />
      </div>

      {open && rows.length > 0 && (
        <div
          className="flex max-h-56 flex-col gap-0.5 overflow-y-auto rounded-lg border border-line-strong bg-elevated p-1"
          id={listId}
          role="listbox"
        >
          {rows.map((row, i) => (
            <button
              aria-selected={row === active}
              className={cn(
                "flex w-full items-baseline gap-2 rounded-md px-2.5 py-1.5 text-left font-mono text-xs",
                row === active ? "bg-accent/15 text-fg" : "text-muted",
                row.freeText && "text-accent"
              )}
              id={`${optionIdPrefix}-${row.id}`}
              key={row.id}
              onClick={() => commit(row)}
              onMouseMove={() => setSel(i)}
              role="option"
              type="button"
            >
              <span className="min-w-0 truncate">
                {row.freeText ? `Use "${row.id}" as typed` : row.id}
              </span>
              <span className="ml-auto shrink-0 text-[10.5px] text-faint">
                {row.freeText ? "not listed" : contextChip(row.contextLength)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
