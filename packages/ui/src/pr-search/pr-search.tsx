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
 *
 * Repo scope widens text mode from the diff to the whole revision. The host
 * owns the fetch and hands results back through `repo`, each hit already
 * tagged with the diff anchor it maps to, so an in-PR hit jumps exactly like
 * a diff hit while a repo-only hit peeks inline instead — the pane never
 * navigates away from the review. Enter on a repo-only hit grows the peek
 * into the whole file (repo-file-view) inside the same dialog, fed by the
 * host's `filePreview` — the blob it already fetched for the peek — and esc
 * steps back to the results before it closes anything. The toggle reuses
 * the key that opened code search (`mod+r`): widening is a repeat of the
 * gesture, not a new binding in a nearly full key space. Peek context arrives asynchronously — the pane
 * asks via `onNeedRepoContext` and renders whatever the host attaches on the
 * next pass; the effect that fires the request exists because selection can
 * land on a context-less row without a fresh user gesture (results arriving
 * under an existing selection), which no event handler sees.
 */

import { CornerDownLeft, FileCode, Search } from "lucide-react";
import {
  type KeyboardEvent,
  type MouseEvent,
  type RefObject,
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
import { RepoFileView } from "../repo-file-view/repo-file-view.tsx";
import { useModalDialog } from "../use-modal-dialog/use-modal-dialog.ts";
import "../search-pane/search-pane.css";
import "./pr-search.css";

export type PrSearchMode = "files" | "text";

export type PrSearchScope = "pr" | "repo";

export interface PrSearchSnippetLine {
  hit: boolean;
  num: number | null;
  text: string;
}

export interface RepoSearchHit {
  anchor: string | null;
  context?: readonly PrSearchSnippetLine[] | null;
  fileIndex: number | null;
  line: number;
  path: string;
  text: string;
}

export interface RepoSearchState {
  hits: readonly RepoSearchHit[];
  /** Why the repo scope is unavailable, shown when status is "failed"; the
   *  host passes the backend's own words so a too-large repository and a
   *  dead network read as different problems. */
  reason?: string;
  status: "failed" | "loading" | "preparing" | "ready";
  truncated: boolean;
}

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
interface LineItem {
  anchor: string | null;
  content: string;
  context: PrSearchSnippetLine[];
  fileIndex: number;
  filename: string;
  kind: "line";
  line: number | null;
}
interface RepoItem {
  hit: RepoSearchHit;
  kind: "repo";
}
type Item = FileItem | LineItem | RepoItem;

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
  if (it.kind === "repo") {
    return `repo-${it.hit.path}-${it.hit.line}`;
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

function snippetContext(hunk: PrSearchHunk, ri: number): PrSearchSnippetLine[] {
  const context: PrSearchSnippetLine[] = [];
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

function buildItems(
  mode: PrSearchMode,
  repoScope: boolean,
  q: string,
  files: readonly PrSearchFile[],
  repo?: RepoSearchState
): Item[] {
  if (mode === "files") {
    return buildFileItems(q, files);
  }
  if (repoScope) {
    return (repo?.hits ?? []).map((hit): Item => ({ hit, kind: "repo" }));
  }
  return buildTextItems(q, files);
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
  scope = "pr",
  onScopeChange,
  repo,
  onQueryChange,
  onSelectRepoHit,
  onNeedRepoContext,
  filePreview = null,
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
  scope?: PrSearchScope;
  onScopeChange?: (scope: PrSearchScope) => void;
  repo?: RepoSearchState;
  onQueryChange?: (query: string) => void;
  onSelectRepoHit?: (hit: RepoSearchHit) => void;
  onNeedRepoContext?: (hit: RepoSearchHit) => void;
  /** The peeked file's full lines, for the repo-only file view. Keyed by
   *  path so a stale blob never renders under another hit's name. */
  filePreview?: { path: string; lines: readonly string[] } | null;
}) {
  if (!open) {
    return null;
  }
  return (
    <PrSearchContent
      filePreview={filePreview}
      files={files}
      highlightLine={highlightLine}
      initialQuery={initialQuery}
      inline={inline}
      key={mode}
      mode={mode}
      onNeedRepoContext={onNeedRepoContext}
      onOpenChange={onOpenChange}
      onQueryChange={onQueryChange}
      onScopeChange={onScopeChange}
      onSelectFile={onSelectFile}
      onSelectLine={onSelectLine}
      onSelectRepoHit={onSelectRepoHit}
      repo={repo}
      scope={scope}
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
  scope,
  onScopeChange,
  repo,
  onQueryChange,
  onSelectRepoHit,
  onNeedRepoContext,
  filePreview,
}: {
  mode: PrSearchMode;
  onOpenChange: (v: boolean) => void;
  files: readonly PrSearchFile[];
  onSelectFile: (index: number) => void;
  onSelectLine: (index: number, anchor: string) => void;
  highlightLine: HighlightLine;
  initialQuery: string;
  inline: boolean;
  scope: PrSearchScope;
  onScopeChange?: (scope: PrSearchScope) => void;
  repo?: RepoSearchState;
  onQueryChange?: (query: string) => void;
  onSelectRepoHit?: (hit: RepoSearchHit) => void;
  onNeedRepoContext?: (hit: RepoSearchHit) => void;
  filePreview: { path: string; lines: readonly string[] } | null;
}) {
  const listId = useId();
  const [query, setQuery] = useState(initialQuery);
  const [sel, setSel] = useState(0);
  const [viewing, setViewing] = useState(false);
  // Dismissal is layered like the app's other surfaces: while the file view
  // is up, every close gesture — esc anywhere in the dialog, a backdrop
  // click — steps back to the results; only the next one closes the pane.
  const close = () => {
    if (viewing) {
      closeView();
    } else {
      onOpenChange(false);
    }
  };
  const { dialogRef, onDialogCancel, onDialogClose } = useModalDialog(
    close,
    undefined,
    { modal: !inline }
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);

  const q = query.trim().toLowerCase();
  const repoScope = mode === "text" && scope === "repo" && repo !== undefined;
  const canToggleScope =
    mode === "text" && repo !== undefined && onScopeChange !== undefined;
  const items = buildItems(mode, repoScope, q, files, repo);

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

  useEffect(() => {
    if (!repoScope) {
      return;
    }
    const hit = repo?.hits[sel];
    if (hit && !hit.context) {
      onNeedRepoContext?.(hit);
    }
  }, [repoScope, repo, sel, onNeedRepoContext]);

  const toggleScope = () => {
    if (!(canToggleScope && onScopeChange)) {
      return;
    }
    setSel(0);
    setViewing(false);
    onScopeChange(scope === "repo" ? "pr" : "repo");
  };

  const openView = () => {
    setViewing(true);
    // The view owns the keyboard while it is up: focus makes esc land here
    // first and gives the scroll container native arrow/page keys.
    requestAnimationFrame(() => viewRef.current?.focus());
  };

  const closeView = () => {
    setViewing(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const choose = (it: Item) =>
    chooseItem(it, {
      close,
      onNeedRepoContext,
      onSelectFile,
      onSelectLine,
      onSelectRepoHit,
      openView,
    });

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) =>
    onPaneKeyDown(e, {
      choose,
      close,
      closeView,
      items,
      sel,
      setSel,
      toggleScope,
      viewing,
    });

  const handleViewKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closeView();
    }
  };

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    setSel(0);
    setViewing(false);
    onQueryChange?.(e.target.value);
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

  const displayQ = query.trim();
  const repoStatus = repoScope ? (repo?.status ?? "ready") : "ready";
  const notice = paneNotice({
    displayQ,
    mode,
    noItems: items.length === 0,
    repoReason: repo?.reason,
    repoScope,
    repoStatus,
  });
  let placeholder = "Find a file in this PR…";
  if (mode === "text") {
    placeholder = repoScope
      ? "Search code in the repo…"
      : "Search code in this PR…";
  }
  const selected = items[sel];
  let enterLabel = mode === "files" ? "open file" : "go to line";
  if (selected?.kind === "repo" && selected.hit.anchor === null) {
    enterLabel = "open file";
  }
  const viewingHit = viewing && selected?.kind === "repo" ? selected.hit : null;

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

      {viewingHit ? (
        // biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/noNoninteractiveElementInteractions lint/a11y/noNoninteractiveTabindex: focused programmatically so esc lands here first and the scroll container gets native arrow/page keys; it is never a tab stop.
        <div
          className="qsp-view"
          onKeyDown={handleViewKeyDown}
          ref={viewRef}
          tabIndex={-1}
        >
          <RepoFileView
            filename={viewingHit.path}
            highlightLine={highlightLine}
            line={viewingHit.line}
            lines={
              filePreview?.path === viewingHit.path ? filePreview.lines : null
            }
            query={displayQ}
          />
        </div>
      ) : (
        <ResultList
          displayQ={displayQ}
          highlightLine={highlightLine}
          items={items}
          listId={listId}
          listRef={listRef}
          notice={notice}
          onRowClick={handleRowClick}
          onRowMouseMove={handleRowMouseMove}
          sel={sel}
          showTruncated={Boolean(
            repoScope && repo?.truncated && items.length > 0
          )}
        />
      )}

      <PaneFoot
        canToggleScope={canToggleScope}
        enterLabel={enterLabel}
        mode={mode}
        repoScope={repoScope}
        toggleScope={toggleScope}
        viewing={viewingHit !== null}
      />
    </dialog>
  );
}

function PaneFoot({
  canToggleScope,
  enterLabel,
  mode,
  repoScope,
  toggleScope,
  viewing,
}: {
  canToggleScope: boolean;
  enterLabel: string;
  mode: PrSearchMode;
  repoScope: boolean;
  toggleScope: () => void;
  viewing: boolean;
}) {
  return (
    <div className="qsp-foot">
      {viewing ? (
        <span>
          <Kbd combo="esc" /> back to results
        </span>
      ) : (
        <>
          <span>
            <Kbd combo="up" />
            <Kbd combo="down" /> navigate
          </span>
          <span>
            <CornerDownLeft aria-hidden size={11} /> {enterLabel}
          </span>
        </>
      )}
      {canToggleScope ? (
        <button
          className="qsp-foot-scope qsp-scope-btn"
          onClick={toggleScope}
          type="button"
        >
          {repoScope ? "whole repo" : "code in this PR"}
          <Kbd combo="mod+r" />
        </button>
      ) : (
        <span className="qsp-foot-scope">
          {mode === "files" ? "files in this PR" : "code in this PR"}
        </span>
      )}
    </div>
  );
}

function ResultList({
  displayQ,
  highlightLine,
  items,
  listId,
  listRef,
  notice,
  onRowClick,
  onRowMouseMove,
  sel,
  showTruncated,
}: {
  displayQ: string;
  highlightLine: HighlightLine;
  items: Item[];
  listId: string;
  listRef: RefObject<HTMLDivElement | null>;
  notice: { hint: string; title: string } | null;
  onRowClick: (e: MouseEvent<HTMLButtonElement>) => void;
  onRowMouseMove: (e: MouseEvent<HTMLButtonElement>) => void;
  sel: number;
  showTruncated: boolean;
}) {
  return (
    <div className="qsp-list" id={listId} ref={listRef} role="listbox">
      {notice && (
        <div className="qsp-empty">
          <Search aria-hidden size={20} />
          <p>{notice.title}</p>
          <span>{notice.hint}</span>
        </div>
      )}
      {items.map((it, i) => (
        <button
          aria-selected={i === sel}
          className={cn("qsp-row", i === sel && "qsp-row-on")}
          data-active={i === sel}
          data-index={i}
          key={itemKey(it, i)}
          onClick={onRowClick}
          onMouseMove={onRowMouseMove}
          role="option"
          tabIndex={-1}
          type="button"
        >
          <span aria-hidden className="qsp-rail" />
          <RowBody
            active={i === sel}
            displayQ={displayQ}
            highlightLine={highlightLine}
            it={it}
          />
        </button>
      ))}
      {showTruncated && (
        <div className="qsp-more">
          Only the first matches are shown. Narrow the search.
        </div>
      )}
    </div>
  );
}

function chooseItem(
  it: Item,
  handlers: {
    close: () => void;
    onNeedRepoContext?: (hit: RepoSearchHit) => void;
    onSelectFile: (index: number) => void;
    onSelectLine: (index: number, anchor: string) => void;
    onSelectRepoHit?: (hit: RepoSearchHit) => void;
    openView: () => void;
  }
) {
  if (it.kind === "repo") {
    if (it.hit.anchor !== null && it.hit.fileIndex !== null) {
      handlers.onSelectRepoHit?.(it.hit);
      handlers.close();
    } else {
      // The host is already fetching this blob for the peek; asking again
      // is what guarantees the view has lines coming when the peek request
      // never fired (a click straight onto the row).
      handlers.onNeedRepoContext?.(it.hit);
      handlers.openView();
    }
    return;
  }
  if (it.kind === "line" && it.anchor !== null) {
    handlers.onSelectLine(it.fileIndex, it.anchor);
  } else {
    handlers.onSelectFile(it.fileIndex);
  }
  handlers.close();
}

function onPaneKeyDown(
  e: KeyboardEvent<HTMLInputElement>,
  pane: {
    choose: (it: Item) => void;
    close: () => void;
    closeView: () => void;
    items: Item[];
    sel: number;
    setSel: (update: (s: number) => number) => void;
    toggleScope: () => void;
    viewing: boolean;
  }
) {
  const { choose, close, closeView, items, sel, setSel, toggleScope, viewing } =
    pane;
  // While the file view is up the list is not on screen: selection keys go
  // dead rather than moving an invisible cursor, and esc backs out one
  // level instead of closing the pane.
  if (viewing) {
    if (e.key === "Escape") {
      e.preventDefault();
      closeView();
    } else if (["ArrowDown", "ArrowUp", "Enter", "Tab"].includes(e.key)) {
      e.preventDefault();
    }
    return;
  }
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
  } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "r") {
    e.preventDefault();
    e.stopPropagation();
    toggleScope();
  }
}

function paneNotice(args: {
  displayQ: string;
  mode: PrSearchMode;
  noItems: boolean;
  repoScope: boolean;
  repoReason?: string;
  repoStatus: RepoSearchState["status"];
}): { hint: string; title: string } | null {
  const { displayQ, mode, noItems, repoReason, repoScope, repoStatus } = args;
  if (repoScope && repoStatus === "failed") {
    return {
      hint:
        repoReason ?? "The snapshot for this revision could not be downloaded.",
      title: "Repo search is unavailable.",
    };
  }
  if (!displayQ) {
    if (repoScope) {
      return {
        hint: "Type to match lines across every file at this revision.",
        title: "Search the whole repo",
      };
    }
    if (mode === "text") {
      return {
        hint: "Type to match lines across every changed file.",
        title: "Search the diff text",
      };
    }
    return null;
  }
  if (repoScope && repoStatus === "preparing") {
    return {
      hint: "The first repo search downloads this revision once.",
      title: "Getting the repo ready…",
    };
  }
  if (noItems && repoStatus === "ready") {
    let hint = "Try other code text.";
    if (mode === "files") {
      hint = "Try part of a file name.";
    } else if (repoScope) {
      hint = "Repo matches are literal and case sensitive.";
    }
    return { hint, title: `Nothing matches “${displayQ}”.` };
  }
  return null;
}

function CodeTitle({
  text,
  filename,
  query,
  highlightLine,
}: {
  text: string;
  filename: string;
  query: string;
  highlightLine: HighlightLine;
}) {
  return (
    <span className="qsp-title q-mono">
      {text ? (
        <span className="hljs">
          {highlightHtmlToNodes(highlightLine(text, filename, query))}
        </span>
      ) : (
        <span> </span>
      )}
    </span>
  );
}

function RowBody({
  it,
  active,
  displayQ,
  highlightLine,
}: {
  it: Item;
  active: boolean;
  displayQ: string;
  highlightLine: HighlightLine;
}) {
  if (it.kind === "file") {
    return (
      <>
        <FileCode aria-hidden className="qsp-search-icon" size={14} />
        <span className="qsp-main">
          <span className="qsp-title">
            <span>
              <HighlightIndices indices={it.matched} text={it.filename} />
            </span>
          </span>
        </span>
      </>
    );
  }
  if (it.kind === "repo") {
    return (
      <>
        <span className="qsp-num">L{it.hit.line}</span>
        <span className="qsp-main">
          <CodeTitle
            filename={it.hit.path}
            highlightLine={highlightLine}
            query={displayQ}
            text={it.hit.text.trim()}
          />
          <span className="qsp-meta">
            {base(it.hit.path)}
            {it.hit.anchor !== null && (
              <span className="qsp-chip">in this PR</span>
            )}
          </span>
          {active && !!it.hit.context?.length && (
            <ContextSnippet
              context={it.hit.context}
              filename={it.hit.path}
              highlightLine={highlightLine}
              query={displayQ}
            />
          )}
        </span>
      </>
    );
  }
  return (
    <>
      <span className="qsp-num">L{it.line ?? "?"}</span>
      <span className="qsp-main">
        <CodeTitle
          filename={it.filename}
          highlightLine={highlightLine}
          query={displayQ}
          text={it.content}
        />
        <span className="qsp-meta">{base(it.filename)}</span>
        {active && it.context.length > 1 && (
          <ContextSnippet
            context={it.context}
            filename={it.filename}
            highlightLine={highlightLine}
            query={displayQ}
          />
        )}
      </span>
    </>
  );
}

function ContextSnippet({
  context,
  filename,
  query,
  highlightLine,
}: {
  context: readonly PrSearchSnippetLine[];
  filename: string;
  query: string;
  highlightLine: HighlightLine;
}) {
  return (
    <span aria-hidden className="qsp-snippet">
      {context.map((l) => (
        <span
          className={cn("qsp-snip-line", l.hit && "qsp-snip-line-hit")}
          key={`${l.num ?? "x"}-${l.text}`}
        >
          <span className="qsp-snip-num">{l.num ?? ""}</span>
          <span className="qsp-snip-code hljs">
            {l.text
              ? highlightHtmlToNodes(
                  highlightLine(l.text, filename, l.hit ? query : "")
                )
              : " "}
          </span>
        </span>
      ))}
    </span>
  );
}
