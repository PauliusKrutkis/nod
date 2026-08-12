/**
 * Command palette (⌘K) — runs the actions available in the current scope. It
 * renders the `commands` it is handed and never reaches for a keyboard
 * registry or a store: the host flattens its live bindings into commands,
 * which keeps this a props-pure view and lets the gallery mount the palette
 * from a fixture. PR navigation lives in the global "/" search now, so this
 * stays a focused action list. The selected row wears the same iris left-rail
 * as the inbox cursor.
 *
 * `initialQuery` seeds the filter the way issue-tracker-dialog seeds its URL:
 * the query is this component's own state, so the filtered, highlighted and
 * nothing-matched states become fixtures that render on first paint instead of
 * interactions a capture has to script.
 *
 * Running a command closes the palette here rather than in each command's
 * `run`, so a host cannot forget it and the gallery's inert fixtures stay
 * inert. With no commands at all the empty line drops the quoted query — a
 * palette with nothing in it has not failed to match anything.
 *
 * `inline` opens with show() instead of showModal() (see useModalDialog) — no
 * top layer, no tab trap — and `.qc-inline` puts the panel back in normal flow
 * so an embedding host can size and capture it like any other specimen.
 */
import { Search } from "lucide-react";
import {
  type ComponentType,
  type KeyboardEvent,
  type MouseEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { cn } from "../cn/cn.ts";
import { fuzzyMatch } from "../fuzzy/fuzzy.ts";
import { HighlightIndices } from "../highlight-indices/highlight-indices.tsx";
import { Kbd } from "../kbd/kbd.tsx";
import { useModalDialog } from "../use-modal-dialog/use-modal-dialog.ts";
import "./command-palette.css";

export interface PaletteCommand {
  group?: string;
  icon?: ComponentType<{ size?: number | string; className?: string }>;
  keyCombo?: string;
  label: string;
  run: () => void;
}

interface MatchedCommand extends PaletteCommand {
  matched: number[];
}

function commandKey(command: PaletteCommand): string {
  return `${command.label}\0${command.keyCombo ?? ""}\0${command.group ?? ""}`;
}

function filterCommands(
  commands: readonly PaletteCommand[],
  query: string
): MatchedCommand[] {
  if (!query) {
    return commands.map((command) => ({ ...command, matched: [] }));
  }
  const scored: (MatchedCommand & { score: number })[] = [];
  for (const command of commands) {
    const m = fuzzyMatch(query, command.label);
    if (m) {
      scored.push({ ...command, matched: m.indices, score: m.score });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

export function CommandPalette({
  open,
  onOpenChange,
  commands,
  initialQuery = "",
  inline = false,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  commands: readonly PaletteCommand[];
  initialQuery?: string;
  inline?: boolean;
}) {
  if (!open) {
    return null;
  }
  return (
    <CommandPaletteContent
      commands={commands}
      initialQuery={initialQuery}
      inline={inline}
      onOpenChange={onOpenChange}
    />
  );
}

function CommandPaletteContent({
  onOpenChange,
  commands,
  initialQuery,
  inline,
}: {
  onOpenChange: (v: boolean) => void;
  commands: readonly PaletteCommand[];
  initialQuery: string;
  inline?: boolean;
}) {
  const listId = useId();
  const [query, setQuery] = useState(initialQuery);
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { dialogRef, onDialogCancel, onDialogClose } = useModalDialog(
    () => {
      onOpenChange(false);
    },
    inputRef,
    { modal: !inline }
  );

  const q = query.trim();
  const entries = filterCommands(commands, q);
  const activeIndex =
    entries.length === 0 ? 0 : Math.min(index, entries.length - 1);

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const close = () => {
    onOpenChange(false);
  };

  const runAt = (i: number) => {
    const entry = entries[i];
    if (!entry) {
      return;
    }
    entry.run();
    onOpenChange(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndex((i) => (entries.length ? (i + 1) % entries.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndex((i) =>
        entries.length ? (i - 1 + entries.length) % entries.length : 0
      );
    } else if (e.key === "Tab") {
      e.preventDefault();
      const dir = e.shiftKey ? -1 : 1;
      setIndex((i) =>
        entries.length ? (i + dir + entries.length) % entries.length : 0
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      runAt(activeIndex);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };

  const onQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    setIndex(0);
  };

  const onOptionClick = (e: MouseEvent<HTMLButtonElement>) => {
    runAt(Number(e.currentTarget.dataset.index));
  };

  const onOptionMouseMove = (e: MouseEvent<HTMLButtonElement>) => {
    setIndex(Number(e.currentTarget.dataset.index));
  };

  return (
    <dialog
      aria-label="Command palette"
      className={cn("q-dialog q-dialog-top qc-panel", inline && "qc-inline")}
      onCancel={onDialogCancel}
      onClose={onDialogClose}
      ref={dialogRef}
    >
      <div className="qc-search">
        <Search aria-hidden className="qc-search-icon" size={16} />
        <input
          aria-controls={listId}
          aria-expanded
          aria-label="Search commands"
          autoComplete="off"
          className="qc-input"
          onChange={onQueryChange}
          onKeyDown={onKeyDown}
          placeholder="Run a command…"
          ref={inputRef}
          role="combobox"
          spellCheck={false}
          value={query}
        />
        <Kbd combo="esc" />
      </div>

      <div className="qc-list" id={listId} ref={listRef} role="listbox">
        {entries.length === 0 ? (
          <div className="qc-empty">
            {q ? `No commands match “${q}”.` : "No commands here yet."}
          </div>
        ) : (
          <fieldset aria-label="Commands" className="qc-group">
            <legend className="qc-group-label">Commands</legend>
            {entries.map((entry, i) => (
              <CommandOption
                active={i === activeIndex}
                command={entry}
                index={i}
                key={commandKey(entry)}
                onClick={onOptionClick}
                onMouseMove={onOptionMouseMove}
              />
            ))}
          </fieldset>
        )}
      </div>

      <div className="qc-foot">
        <span>
          <Kbd combo="up" />
          <Kbd combo="down" /> navigate
        </span>
        <span>
          <Kbd combo="enter" /> run
        </span>
        <span>
          <Kbd combo="esc" /> close
        </span>
      </div>
    </dialog>
  );
}

function CommandOption({
  command,
  index,
  active,
  onClick,
  onMouseMove,
}: {
  command: MatchedCommand;
  index: number;
  active: boolean;
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
  onMouseMove: (e: MouseEvent<HTMLButtonElement>) => void;
}) {
  const Icon = command.icon;
  return (
    <button
      className={cn("qc-opt q-focus", active && "qc-opt-on")}
      data-active={active}
      data-index={index}
      onClick={onClick}
      onMouseMove={onMouseMove}
      type="button"
    >
      <span aria-hidden className="qc-rail" />
      <span aria-hidden className="qc-opt-icon">
        {Icon ? <Icon size={14} /> : null}
      </span>
      <span className="qc-opt-label">
        <HighlightIndices indices={command.matched} text={command.label} />
      </span>
      {command.group ? (
        <span className="qc-opt-sub">{command.group}</span>
      ) : null}
      {command.keyCombo ? <Kbd combo={command.keyCombo} /> : null}
    </button>
  );
}
