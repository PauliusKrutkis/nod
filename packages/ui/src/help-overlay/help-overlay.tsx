/**
 * Help overlay (?) — the shortcut cheatsheet. It renders the bindings it is
 * handed and never reaches for a keyboard registry: the host flattens its live
 * registry into `sections`, which keeps this a props-pure view and lets the
 * gallery mount the sheet from a fixture. The shape is deliberately the
 * smallest thing that can be drawn (a scope name, an optional note, and
 * combo/description pairs), so a host with richer binding types satisfies it
 * structurally without converting anything.
 *
 * The sheet opens with its search focused: it exists to answer "what was that
 * key", and typing is the fastest way to ask. Matching and ranking live in
 * help-overlay-search.ts; Escape in the input clears the query first and only
 * closes once it is empty, mirroring the find bar. `initialQuery` exists for
 * fixtures — the filtered states are unreachable from props otherwise.
 *
 * Layout is two columns while browsing: every inactive scope on the left, the
 * scope you are currently in on the right wearing the iris tint, so the keys
 * that apply right now read as one block. A query collapses that split into
 * one ranked column, because relevance ordering and the active/inactive split
 * would fight over the same axis.
 *
 * `inline` opens with show() instead of showModal() (see useModalDialog) — no
 * top layer, no tab trap — and `.qh-inline` puts the panel back in normal flow
 * so an embedding host can size and capture it like any other specimen.
 */
import { Command, Search, X } from "lucide-react";
import { type KeyboardEvent, useRef, useState } from "react";
import { cn } from "../cn/cn.ts";
import { HighlightIndices } from "../highlight-indices/highlight-indices.tsx";
import { Kbd } from "../kbd/kbd.tsx";
import { useModalDialog } from "../use-modal-dialog/use-modal-dialog.ts";
import {
  type HelpSection,
  type MatchedSection,
  searchHelp,
} from "./help-overlay-search.ts";
import "./help-overlay.css";

export type { HelpBinding, HelpSection } from "./help-overlay-search.ts";

export function HelpOverlay({
  open,
  onOpenChange,
  sections,
  inline = false,
  initialQuery = "",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sections: readonly HelpSection[];
  inline?: boolean;
  initialQuery?: string;
}) {
  if (!open) {
    return null;
  }
  return (
    <HelpOverlayContent
      initialQuery={initialQuery}
      inline={inline}
      onOpenChange={onOpenChange}
      sections={sections}
    />
  );
}

function HelpOverlayContent({
  onOpenChange,
  sections,
  inline,
  initialQuery,
}: {
  onOpenChange: (v: boolean) => void;
  sections: readonly HelpSection[];
  inline?: boolean;
  initialQuery: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const inputRef = useRef<HTMLInputElement>(null);
  const { dialogRef, onDialogCancel, onDialogClose } = useModalDialog(
    () => {
      onOpenChange(false);
    },
    inputRef,
    { modal: !inline }
  );

  const close = () => {
    onOpenChange(false);
  };

  const { sections: matched, shown, total } = searchHelp(sections, query);
  const filtering = query.trim().length > 0;

  const onSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Escape") {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    if (query) {
      setQuery("");
    } else {
      close();
    }
  };

  const columns = filtering
    ? [matched]
    : [matched.filter((s) => !s.active), matched.filter((s) => s.active)];

  return (
    <dialog
      aria-label="Keyboard shortcuts"
      className={cn("q-dialog qh-panel", inline && "qh-inline")}
      onCancel={onDialogCancel}
      onClose={onDialogClose}
      ref={dialogRef}
    >
      <header className="qh-head">
        <div className="qh-head-title">
          <Command aria-hidden size={15} />
          <span className="qh-title">Keyboard</span>
        </div>
        <div className="qh-search">
          <Search aria-hidden className="qh-search-icon" size={14} />
          <input
            aria-label="Search shortcuts"
            autoComplete="off"
            className="qh-search-input"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onSearchKeyDown}
            placeholder="Search shortcuts"
            ref={inputRef}
            spellCheck={false}
            type="text"
            value={query}
          />
          {filtering ? (
            <span
              aria-live="polite"
              className={cn("qh-search-count", shown === 0 && "qh-search-none")}
            >
              {shown}/{total}
            </span>
          ) : null}
        </div>
        <button
          aria-label="Close"
          className="qh-close q-focus"
          onClick={close}
          type="button"
        >
          <X aria-hidden size={16} />
        </button>
      </header>

      {filtering && shown === 0 ? (
        <div className="qh-blank">
          <p className="qh-blank-line">No shortcuts match “{query.trim()}”</p>
          <p className="qh-blank-hint">Esc clears the search</p>
        </div>
      ) : (
        <div className={cn("qh-grid", filtering && "qh-grid-filtered")}>
          {columns.map((column, index) => (
            <div className="qh-col" key={index === 0 ? "inactive" : "active"}>
              {column.map((section) => (
                <ScopeCard key={section.scope} section={section} />
              ))}
            </div>
          ))}
        </div>
      )}

      <footer className="qh-foot">
        Scope-aware: only the screen you're on responds. Generated from the live
        bindings, so the legend, the palette, and this sheet can never drift.
      </footer>
    </dialog>
  );
}

function ScopeCard({ section }: { section: MatchedSection }) {
  return (
    <section className={cn("qh-scope", section.active && "qh-scope-active")}>
      <div className="qh-scope-head">
        <span className="qh-scope-name">{section.scope}</span>
        {section.active ? <span className="qh-scope-tag">active</span> : null}
        {section.note ? (
          <span className="qh-scope-note">{section.note}</span>
        ) : null}
      </div>
      <dl className="qh-rows">
        {section.bindings.map((binding) => (
          <div
            className="qh-row"
            key={`${binding.combo}-${binding.description}`}
          >
            <dt className="qh-keys">
              <Kbd combo={binding.combo} />
            </dt>
            <dd className="qh-label">
              <HighlightIndices
                indices={binding.indices}
                text={binding.description}
              />
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
