/**
 * The chat's model popover: a search field over the provider's model list,
 * floated above the button that opened it. The setup dialog's combobox is a
 * field you tab into; this is a menu you summon, so it opens with its list
 * already showing and closes on pick, Escape or blur.
 *
 * A provider can return hundreds of models in its own order, so the search
 * filters on substring rather than prefix — you rarely remember which vendor
 * segment an id starts with, but you always remember a word inside it. An id
 * the endpoint never enumerated is still pickable: when the query matches
 * nothing exactly, the first row offers it as typed, the same escape hatch
 * the setup dialog gives.
 *
 * The input keeps DOM focus for the whole popover and the rows are never
 * focus stops (`tabIndex={-1}`, `aria-activedescendant` naming the active
 * one) — the selection model DESIGN.md asks for, so ↑↓ walk the list while
 * the caret stays where you are typing.
 */

import { Check, Search } from "lucide-react";
import { type KeyboardEvent, useId, useState } from "react";
import type { AiSetupModel } from "../ai-model-combobox/ai-model-combobox.tsx";
import { cn } from "../cn/cn.ts";
import "./model-picker.css";

export interface ModelPickerProps {
  /** Selector for the control that opens this popover. Focus moving there is
   *  a toggle, not a dismissal — closing on that blur would let the click
   *  reopen what it meant to close. */
  anchorSelector?: string;
  current: string;
  models: readonly AiSetupModel[] | null;
  onClose: () => void;
  onPick: (id: string) => void;
}

interface PickerRow {
  contextLength: number | null;
  freeText: boolean;
  id: string;
}

function contextChip(contextLength: number | null): string {
  return contextLength ? `${Math.round(contextLength / 1000)}k` : "";
}

function buildRows(
  models: readonly AiSetupModel[],
  query: string
): PickerRow[] {
  const needle = query.trim().toLowerCase();
  const matches: PickerRow[] = models
    .filter((m) => m.id.toLowerCase().includes(needle))
    .map((m) => ({
      contextLength: m.contextLength,
      freeText: false,
      id: m.id,
    }));
  const exact = models.some((m) => m.id.toLowerCase() === needle);
  if (needle && !exact) {
    matches.unshift({
      contextLength: null,
      freeText: true,
      id: query.trim(),
    });
  }
  return matches;
}

function revealRow(el: HTMLButtonElement | null) {
  el?.scrollIntoView({ block: "nearest" });
}

function preventFocusLoss(e: { preventDefault: () => void }) {
  e.preventDefault();
}

export function ModelPicker({
  anchorSelector,
  current,
  models,
  onClose,
  onPick,
}: ModelPickerProps) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const listId = useId();
  const optionPrefix = useId();

  const rows = buildRows(models ?? [], query);
  const activeIndex = Math.min(selected, Math.max(rows.length - 1, 0));
  const active = rows[activeIndex];

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected(Math.min(activeIndex + 1, rows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected(Math.max(activeIndex - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (active) {
        onPick(active.id);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    }
  };

  return (
    <div className="qmp">
      <div className="qmp-field">
        <Search aria-hidden className="qmp-search" size={12} />
        <input
          aria-activedescendant={
            active ? `${optionPrefix}-${active.id}` : undefined
          }
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded="true"
          aria-label="Search models"
          autoComplete="off"
          autoFocus
          className="qmp-input"
          onBlur={(e) => {
            const next = e.relatedTarget as HTMLElement | null;
            if (anchorSelector && next?.closest(anchorSelector)) {
              return;
            }
            onClose();
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(0);
          }}
          onKeyDown={onKeyDown}
          placeholder={models === null ? "Loading models…" : "Search models"}
          role="combobox"
          spellCheck={false}
          value={query}
        />
      </div>
      <div className="qmp-list" id={listId} role="listbox">
        {rows.length === 0 && (
          <p className="qmp-empty">
            {models === null ? "Loading models…" : "No model matches that."}
          </p>
        )}
        {rows.map((row, i) => (
          <button
            aria-selected={i === activeIndex}
            className={cn("qmp-opt", i === activeIndex && "qmp-opt-on")}
            id={`${optionPrefix}-${row.id}`}
            key={row.id}
            onClick={() => onPick(row.id)}
            onMouseDown={preventFocusLoss}
            onMouseMove={() => setSelected(i)}
            ref={i === activeIndex ? revealRow : undefined}
            role="option"
            tabIndex={-1}
            type="button"
          >
            <span className="qmp-opt-id">
              {row.freeText ? `Use "${row.id}" as typed` : row.id}
            </span>
            {row.id === current && !row.freeText && (
              <Check aria-hidden className="qmp-opt-check" size={12} />
            )}
            <span className="qmp-opt-meta">
              {row.freeText ? "not listed" : contextChip(row.contextLength)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
