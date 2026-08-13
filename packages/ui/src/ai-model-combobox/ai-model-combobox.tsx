/**
 * The model picker for the ask-about-code setup dialog. A provider's model
 * list is not a short list — OpenRouter alone returns hundreds, in the
 * provider's own order — so this filters as you type rather than making you
 * scroll a native select. It also accepts an id the endpoint never enumerated:
 * the backend stores `model` as a plain string, so a model missing from
 * `/v1/models` is still reachable instead of being unpickable.
 *
 * The input keeps DOM focus for the whole dialog, which is what lets the
 * host's Tab-armed ring work — `onKeyDown` runs the list's own keys first and
 * hands everything else, Tab included, to `onKeyDownFallthrough`. Escape
 * closes the list when it is open and is otherwise left alone, so the second
 * Escape reaches the dialog.
 *
 * Committing is deliberately explicit (Enter, or a click). Typing alone never
 * commits, because in the dialog every keystroke would otherwise be a write to
 * the provider config and a half-typed id would be persisted on the way to a
 * real one.
 *
 * The input is never disabled, not even while the model list loads. A disabled
 * input cannot take focus, and the dialog places focus here on open, so
 * disabling it would drop focus on the floor and leave the host's Tab ring
 * dead until something else claimed it.
 *
 * The list opens on typing or on an arrow key, never merely on focus. Focus
 * lands here the moment the dialog opens, so opening with it would drop a
 * panel over the footer unasked and, worse, swallow every Enter — the host
 * reads Enter to run whichever action Tab has armed, and a list that is always
 * open would answer it first. Blur closes it, and the option rows cancel the
 * mousedown that would otherwise move focus, so a click commits without the
 * blur racing it.
 *
 * `initialOpen` and `initialQuery` seed first paint the way command-palette
 * seeds its filter: openness and the query are this component's own state, so
 * the filtered, crowded and free-text states become fixtures that render on
 * first paint instead of interactions a capture has to script. The dialog
 * passes neither — a picker that opened itself is the exact behaviour the
 * paragraph above rules out.
 *
 * Keeping the highlight in view needs no effect: the ref callback is attached
 * only to the active row, so changing which row is active detaches one and
 * attaches the other, and the attach is where the scroll happens.
 */
import { ChevronDown } from "lucide-react";
import { type KeyboardEvent, useId, useState } from "react";
import { cn } from "../cn/cn.ts";
import "./ai-model-combobox.css";

export interface AiSetupModel {
  contextLength: number | null;
  id: string;
}

interface ModelRow {
  id: string;
  contextLength: number | null;
  freeText: boolean;
}

function revealRow(el: HTMLButtonElement | null) {
  el?.scrollIntoView({ block: "nearest" });
}

function preventFocusLoss(e: React.MouseEvent) {
  e.preventDefault();
}

function contextChip(contextLength: number | null): string {
  if (!contextLength) {
    return "";
  }
  return `${Math.round(contextLength / 1000)}k`;
}

function buildRows(models: readonly AiSetupModel[], query: string): ModelRow[] {
  const trimmed = query.trim();
  const needle = trimmed.toLowerCase();
  const matches: ModelRow[] = [];
  for (const m of models) {
    if (m.id.toLowerCase().includes(needle)) {
      matches.push({
        contextLength: m.contextLength,
        freeText: false,
        id: m.id,
      });
    }
  }
  if (!trimmed || models.some((m) => m.id === trimmed)) {
    return matches;
  }
  return [...matches, { contextLength: null, freeText: true, id: trimmed }];
}

export function AiModelCombobox({
  initialOpen = false,
  initialQuery,
  loading,
  models,
  onCommit,
  onKeyDownFallthrough,
  ref,
  value,
}: {
  initialOpen?: boolean;
  initialQuery?: string;
  loading: boolean;
  models: readonly AiSetupModel[];
  onCommit: (id: string) => void;
  onKeyDownFallthrough: (e: KeyboardEvent<HTMLElement>) => void;
  ref?: React.Ref<HTMLInputElement>;
  value: string | null;
}) {
  const listId = useId();
  const optionIdPrefix = useId();
  const [query, setQuery] = useState(initialQuery ?? value ?? "");
  const [open, setOpen] = useState(initialOpen);
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

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    setOpen(true);
    setSel(0);
  };

  const onBlur = () => {
    setOpen(false);
  };

  return (
    <div className="qmc">
      <div className="qmc-field">
        <input
          aria-activedescendant={
            active ? `${optionIdPrefix}-${active.id}` : undefined
          }
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={open}
          aria-label="Model"
          autoComplete="off"
          className="qmc-input"
          onBlur={onBlur}
          onChange={onChange}
          onKeyDown={onKeyDown}
          placeholder={loading ? "Loading models…" : "Search or paste a model"}
          ref={ref}
          role="combobox"
          spellCheck={false}
          value={query}
        />
        <ChevronDown aria-hidden className="qmc-chevron" size={13} />
      </div>

      {open && rows.length > 0 && (
        <div className="qmc-list" id={listId} role="listbox">
          {rows.map((row, i) => (
            <button
              aria-selected={row === active}
              className={cn(
                "qmc-opt",
                row === active && "qmc-opt-on",
                row.freeText && "qmc-opt-free"
              )}
              id={`${optionIdPrefix}-${row.id}`}
              key={row.id}
              onClick={() => commit(row)}
              onMouseDown={preventFocusLoss}
              onMouseMove={() => setSel(i)}
              ref={row === active ? revealRow : undefined}
              role="option"
              tabIndex={-1}
              type="button"
            >
              <span className="qmc-opt-id">
                {row.freeText ? `Use "${row.id}" as typed` : row.id}
              </span>
              <span className="qmc-opt-meta">
                {row.freeText ? "not listed" : contextChip(row.contextLength)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
