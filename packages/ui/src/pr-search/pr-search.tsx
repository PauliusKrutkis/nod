/**
 * In-PR search. Two modes over one pull request, in the same pane shape as the
 * global "/" search: `files` fuzzy-matches changed file paths; `text` searches
 * the diff text. Matches are highlighted; the selected text result expands into
 * a small context snippet, and choosing it lands the diff on that exact line.
 *
 * The host hands over rows already parsed and grouped per hunk — patch parsing
 * and syntax highlighting stay app-side (they carry the diff parser and
 * highlight.js), which is what keeps this pane renderable from a fixture. The
 * hunk grouping is load-bearing: a snippet must never bleed across a hunk
 * boundary, because rows either side of one are not adjacent in the file.
 *
 * `highlightLine` returns HTML for a single code line and defaults to escaped
 * text with the query marked — the pane's behavior minus syntax colors, so a
 * fixture needs no highlighter. Whatever it returns is walked into React nodes
 * (highlight-html), never injected, so nothing in a diff line can reach the
 * live DOM as an attribute or handler.
 *
 * `initialQuery` seeds the field on first paint: it is what makes every result
 * state (matches, snippets, nothing found) a fixture rather than a scripted
 * interaction. `inline` opens with show() instead of showModal() (see
 * useModalDialog), leaves the query field unfocused so an embedded specimen
 * does not take over the host's keyboard, and `.qsp-inline` returns the panel
 * to normal flow.
 *
 * The shared `qsp-*` base belongs to search-pane and is imported here rather
 * than assumed present: importing this pane brings its whole look, and the
 * load order (base, then these extras) stops being a property of which panes
 * the host happens to mount.
 */

import { CornerDownLeft, FileCode, Search } from "lucide-react";
import {
  type KeyboardEvent,
  type MouseEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { cn } from "../cn/cn.ts";
import { fuzzyMatch } from "../fuzzy/fuzzy.ts";
import { highlightHtmlToNodes } from "../highlight-html/highlight-html.ts";
import { HighlightIndices } from "../highlight-indices/highlight-indices.tsx";
import { Kbd } from "../kbd/kbd.tsx";
import { useModalDialog } from "../use-modal-dialog/use-modal-dialog.ts";
import "../search-pane/search-pane.css";
import "./pr-search.css";

export type PrSearchMode = "files" | "text";

export interface PrSearchLine {
  anchor: string | null;
  num: number | null;
  text: string;
}

export type PrSearchHunk = readonly PrSearchLine[];

export interface PrSearchFile {
  filename: string;
  hunks?: readonly PrSearchHunk[];
}

export type HighlightLine = (
  code: string,
  filename: string,
  query: string
) => string;

interface FileItem {
  fileIndex: number;
  filename: string;
  kind: "file";
  matched: number[];
}
interface SnippetLine {
  hit: boolean;
  num: number | null;
  text: string;
}
interface LineItem {
  anchor: string | null;
  content: string;
  context: SnippetLine[];
  fileIndex: number;
  filename: string;
  kind: "line";
  line: number | null;
}
type Item = FileItem | LineItem;

const MAX_LINES = 60;
const SNIPPET_RADIUS = 4;

function base(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? path : path.slice(i + 1);
}

function itemKey(it: Item, index: number): string {
  if (it.kind === "file") {
    return `file-${it.fileIndex}-${it.filename}`;
  }
  return `line-${it.fileIndex}-${it.anchor ?? "none"}-${it.line ?? index}`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** The fixture-friendly default: no syntax colors, query occurrences marked. */
function markQuery(code: string, _filename: string, query: string): string {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return escapeHtml(code);
  }
  const hay = code.toLowerCase();
  let out = "";
  let at = 0;
  let hit = hay.indexOf(needle);
  while (hit !== -1) {
    const end = hit + needle.length;
    out += `${escapeHtml(code.slice(at, hit))}<mark class="q-hl">${escapeHtml(code.slice(hit, end))}</mark>`;
    at = end;
    hit = hay.indexOf(needle, at);
  }
  return out + escapeHtml(code.slice(at));
}

function buildFileItems(q: string, files: readonly PrSearchFile[]): Item[] {
  const out: (FileItem & { score: number })[] = [];
  files.forEach((f, i) => {
    const m = fuzzyMatch(q, f.filename);
    if (m !== null) {
      out.push({
        fileIndex: i,
        filename: f.filename,
        kind: "file",
        matched: m.indices,
        score: m.score,
      });
    }
  });
  out.sort((a, b) => b.score - a.score);
  return out;
}

function snippetContext(hunk: PrSearchHunk, ri: number): SnippetLine[] {
  const context: SnippetLine[] = [];
  const start = Math.max(0, ri - SNIPPET_RADIUS);
  const end = Math.min(hunk.length - 1, ri + SNIPPET_RADIUS);
  for (let ci = start; ci <= end; ci += 1) {
    const line = hunk[ci];
    context.push({ hit: ci === ri, num: line.num, text: line.text });
  }
  return context;
}

function pushTextMatch(
  out: Item[],
  hunk: PrSearchHunk,
  ri: number,
  fileIndex: number,
  filename: string,
  q: string
): boolean {
  const line = hunk[ri];
  if (!line.text.toLowerCase().includes(q)) {
    return false;
  }
  out.push({
    anchor: line.anchor,
    content: line.text.trim(),
    context: snippetContext(hunk, ri),
    fileIndex,
    filename,
    kind: "line",
    line: line.num,
  });
  return out.length >= MAX_LINES;
}

function buildTextItems(q: string, files: readonly PrSearchFile[]): Item[] {
  if (!q) {
    return [];
  }
  const out: Item[] = [];
  for (let i = 0; i < files.length && out.length < MAX_LINES; i += 1) {
    const f = files[i];
    for (const hunk of f.hunks ?? []) {
      for (let ri = 0; ri < hunk.length; ri += 1) {
        if (pushTextMatch(out, hunk, ri, i, f.filename, q)) {
          return out;
        }
      }
    }
  }
  return out;
}

export function PrSearch({
  open,
  mode,
  onOpenChange,
  files,
  onSelectFile,
  onSelectLine,
  highlightLine = markQuery,
  initialQuery = "",
  inline = false,
}: {
  open: boolean;
  mode: PrSearchMode;
  onOpenChange: (v: boolean) => void;
  files: readonly PrSearchFile[];
  onSelectFile: (index: number) => void;
  onSelectLine: (index: number, anchor: string) => void;
  highlightLine?: HighlightLine;
  initialQuery?: string;
  inline?: boolean;
}) {
  if (!open) {
    return null;
  }
  return (
    <PrSearchContent
      files={files}
      highlightLine={highlightLine}
      initialQuery={initialQuery}
      inline={inline}
      key={mode}
      mode={mode}
      onOpenChange={onOpenChange}
      onSelectFile={onSelectFile}
      onSelectLine={onSelectLine}
    />
  );
}

function PrSearchContent({
  mode,
  onOpenChange,
  files,
  onSelectFile,
  onSelectLine,
  highlightLine,
  initialQuery,
  inline,
}: {
  mode: PrSearchMode;
  onOpenChange: (v: boolean) => void;
  files: readonly PrSearchFile[];
  onSelectFile: (index: number) => void;
  onSelectLine: (index: number, anchor: string) => void;
  highlightLine: HighlightLine;
  initialQuery: string;
  inline: boolean;
}) {
  const listId = useId();
  const close = () => {
    onOpenChange(false);
  };
  const { dialogRef, onDialogCancel, onDialogClose } = useModalDialog(
    close,
    undefined,
    { modal: !inline }
  );
  const [query, setQuery] = useState(initialQuery);
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const q = query.trim().toLowerCase();
  const items: Item[] =
    mode === "files" ? buildFileItems(q, files) : buildTextItems(q, files);

  useEffect(() => {
    if (inline) {
      return;
    }
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [inline]);

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${sel}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  const choose = (it: Item) => {
    if (it.kind === "line" && it.anchor !== null) {
      onSelectLine(it.fileIndex, it.anchor);
    } else {
      onSelectFile(it.fileIndex);
    }
    close();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((s) => Math.min(s + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((s) => Math.max(s - 1, 0));
    } else if (e.key === "Tab") {
      e.preventDefault();
      setSel((s) =>
        e.shiftKey ? Math.max(s - 1, 0) : Math.min(s + 1, items.length - 1)
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      const it = items[sel];
      if (it) {
        choose(it);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    setSel(0);
  };

  const handleRowClick = (e: MouseEvent<HTMLButtonElement>) => {
    const index = Number(e.currentTarget.dataset.index);
    const it = items[index];
    if (it) {
      choose(it);
    }
  };

  const handleRowMouseMove = (e: MouseEvent<HTMLButtonElement>) => {
    const index = Number(e.currentTarget.dataset.index);
    setSel(index);
  };

  const handleRowKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleRowClick(e as unknown as MouseEvent<HTMLButtonElement>);
    }
  };

  const displayQ = query.trim();
  const empty = displayQ.length > 0 && items.length === 0;
  const placeholder =
    mode === "files" ? "Find a file in this PR…" : "Search code in this PR…";

  return (
    <dialog
      aria-label={mode === "files" ? "Find a file" : "Search code"}
      className={cn(
        "q-dialog q-dialog-top qsp-panel",
        mode === "text" && "qsp-panel-code",
        inline && "qsp-inline"
      )}
      onCancel={onDialogCancel}
      onClose={onDialogClose}
      ref={dialogRef}
    >
      <div className="qsp-search">
        <Search aria-hidden className="qsp-search-icon" size={17} />
        <input
          aria-controls={listId}
          aria-expanded
          aria-label={placeholder}
          autoComplete="off"
          className="qsp-input"
          onChange={handleQueryChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          ref={inputRef}
          role="combobox"
          spellCheck={false}
          value={query}
        />
        <Kbd combo="esc" />
      </div>

      <div className="qsp-list" id={listId} ref={listRef} role="listbox">
        {mode === "text" && !displayQ && (
          <div className="qsp-empty">
            <Search aria-hidden size={20} />
            <p>Search the diff text</p>
            <span>Type to match lines across every changed file.</span>
          </div>
        )}
        {items.map((it, i) => (
          <button
            aria-selected={i === sel}
            className={cn("qsp-row", i === sel && "qsp-row-on")}
            data-active={i === sel}
            data-index={i}
            key={itemKey(it, i)}
            onClick={handleRowClick}
            onKeyDown={handleRowKeyDown}
            onMouseMove={handleRowMouseMove}
            role="option"
            type="button"
          >
            <span aria-hidden className="qsp-rail" />
            {it.kind === "file" ? (
              <>
                <FileCode aria-hidden className="qsp-search-icon" size={14} />
                <span className="qsp-main">
                  <span className="qsp-title">
                    <span>
                      <HighlightIndices
                        indices={it.matched}
                        text={it.filename}
                      />
                    </span>
                  </span>
                </span>
              </>
            ) : (
              <>
                <span className="qsp-num">L{it.line ?? "?"}</span>
                <span className="qsp-main">
                  <span className="qsp-title q-mono">
                    {it.content ? (
                      <span className="hljs">
                        {highlightHtmlToNodes(
                          highlightLine(it.content, it.filename, displayQ)
                        )}
                      </span>
                    ) : (
                      <span> </span>
                    )}
                  </span>
                  <span className="qsp-meta">{base(it.filename)}</span>
                  {i === sel && it.context.length > 1 && (
                    <span aria-hidden className="qsp-snippet">
                      {it.context.map((l) => (
                        <span
                          className={cn(
                            "qsp-snip-line",
                            l.hit && "qsp-snip-line-hit"
                          )}
                          key={`${l.num ?? "x"}-${l.text}`}
                        >
                          <span className="qsp-snip-num">{l.num ?? ""}</span>
                          <span className="qsp-snip-code hljs">
                            {l.text
                              ? highlightHtmlToNodes(
                                  highlightLine(
                                    l.text,
                                    it.filename,
                                    l.hit ? displayQ : ""
                                  )
                                )
                              : " "}
                          </span>
                        </span>
                      ))}
                    </span>
                  )}
                </span>
              </>
            )}
          </button>
        ))}
        {!!empty && (
          <div className="qsp-empty">
            <Search aria-hidden size={20} />
            <p>Nothing matches “{displayQ}”.</p>
            <span>
              {mode === "files"
                ? "Try part of a file name."
                : "Try other code text."}
            </span>
          </div>
        )}
      </div>

      <div className="qsp-foot">
        <span>
          <Kbd combo="up" />
          <Kbd combo="down" /> navigate
        </span>
        <span>
          <CornerDownLeft aria-hidden size={11} />{" "}
          {mode === "files" ? "open file" : "go to line"}
        </span>
        <span className="qsp-foot-scope">
          {mode === "files" ? "files in this PR" : "code in this PR"}
        </span>
      </div>
    </dialog>
  );
}
