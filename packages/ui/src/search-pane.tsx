import { Clock, CornerDownLeft, GitBranch, Search } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Avatar } from "./avatar.tsx";
import { Badge } from "./badge.tsx";
import { cn } from "./cn.ts";
import { fuzzyMatchFields } from "./fuzzy.ts";
import { HighlightIndices } from "./highlight.tsx";
import { Kbd } from "./kbd.tsx";
import { formatRelativeTime } from "./time.ts";
import { useModalDialog } from "./use-modal-dialog.ts";

export interface SearchablePr {
  number: number;
  title: string;
  author: string;
  authorAvatarUrl?: string | null;
  repo: string;
  headRef?: string | null;
  draft?: boolean;
  merged?: boolean;
  updatedAt: string;
}

interface SearchResult<T extends SearchablePr> {
  hl: Record<string, number[]>;
  pr: T;
}

/**
 * Search pane — the Superhuman move: `/` doesn't drop a filter field into the
 * list, it takes over with a full pane searching every tab by number, title,
 * author, or repo. Empty, it offers the current PRs so reopening is one
 * keystroke away. Arrows walk results, Enter opens, Esc closes.
 */
export function SearchPane<T extends SearchablePr>({
  open,
  onOpenChange,
  prs,
  onOpen,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  prs: T[];
  onOpen: (pr: T) => void;
}) {
  if (!open) {
    return null;
  }
  return (
    <SearchPaneContent onOpen={onOpen} onOpenChange={onOpenChange} prs={prs} />
  );
}

function SearchPaneContent<T extends SearchablePr>({
  onOpenChange,
  prs,
  onOpen,
}: {
  onOpenChange: (v: boolean) => void;
  prs: T[];
  onOpen: (pr: T) => void;
}) {
  const listId = useId();
  const { dialogRef, onDialogCancel, onDialogClose } = useModalDialog(() => {
    onOpenChange(false);
  });
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const q = query.trim();
  const results: SearchResult<T>[] = q
    ? (() => {
        const out: (SearchResult<T> & { score: number })[] = [];
        for (const pr of prs) {
          const m = fuzzyMatchFields(q, {
            author: pr.author,
            headRef: pr.headRef ?? "",
            number: `#${pr.number}`,
            repo: pr.repo,
            title: pr.title,
          });
          if (m) {
            out.push({ hl: m.indices, pr, score: m.score });
          }
        }
        out.sort((a, b) => b.score - a.score);
        return out;
      })()
    : prs.slice(0, 8).map((pr) => ({ hl: {} as Record<string, number[]>, pr }));

  const close = () => {
    onOpenChange(false);
  };

  const openResult = (pr: T) => {
    onOpen(pr);
    onOpenChange(false);
  };

  const onQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    setSel(0);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((s) => Math.min(s + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((s) => Math.max(s - 1, 0));
    } else if (e.key === "Tab") {
      e.preventDefault();
      setSel((s) =>
        e.shiftKey ? Math.max(s - 1, 0) : Math.min(s + 1, results.length - 1)
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      const r = results[sel];
      if (r) {
        openResult(r.pr);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };

  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${sel}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  const empty = q.length > 0 && results.length === 0;

  return (
    <dialog
      aria-label="Search pull requests"
      className="q-dialog q-dialog-top qsp-panel"
      onCancel={onDialogCancel}
      onClose={onDialogClose}
      ref={dialogRef}
    >
      <div className="qsp-search">
        <Search aria-hidden className="qsp-search-icon" size={17} />
        <input
          aria-controls={listId}
          aria-expanded
          aria-label="Search pull requests"
          autoComplete="off"
          className="qsp-input"
          onChange={onQueryChange}
          onKeyDown={onKeyDown}
          placeholder="Search all pull requests…"
          ref={inputRef}
          role="combobox"
          spellCheck={false}
          value={query}
        />
        <Kbd combo="esc" />
      </div>

      <div className="qsp-list" id={listId} ref={listRef} role="listbox">
        {!q && results.length > 0 ? (
          <div className="qsp-section">
            <Clock aria-hidden size={12} /> Pull requests
          </div>
        ) : null}
        {results.map(({ pr, hl }, i) => (
          <SearchResultRow
            hl={hl}
            index={i}
            key={`${pr.repo}#${pr.number}`}
            onOpen={openResult}
            onSelect={setSel}
            pr={pr}
            selected={i === sel}
          />
        ))}
        {empty ? (
          <div className="qsp-empty">
            <Search aria-hidden size={20} />
            <p>No pull requests match “{q}”.</p>
            <span>Try a number, author, or repo.</span>
          </div>
        ) : null}
      </div>

      <div className="qsp-foot">
        <span>
          <Kbd combo="up" />
          <Kbd combo="down" /> navigate
        </span>
        <span>
          <CornerDownLeft aria-hidden size={11} /> open
        </span>
        <span className="qsp-foot-scope">searching all tabs</span>
      </div>
    </dialog>
  );
}

function SearchResultRow<T extends SearchablePr>({
  pr,
  hl,
  index,
  selected,
  onOpen,
  onSelect,
}: {
  pr: T;
  hl: Record<string, number[]>;
  index: number;
  selected: boolean;
  onOpen: (pr: T) => void;
  onSelect: (index: number) => void;
}) {
  const handleClick = () => {
    onOpen(pr);
  };

  const handleMouseMove = () => {
    onSelect(index);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen(pr);
    }
  };

  return (
    <div
      aria-selected={selected}
      className={cn("qsp-row", selected && "qsp-row-on")}
      data-active={selected}
      data-index={index}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onMouseMove={handleMouseMove}
      role="option"
      tabIndex={0}
    >
      <span aria-hidden className="qsp-rail" />
      <span className="qsp-num">
        <HighlightIndices indices={hl.number} text={`#${pr.number}`} />
      </span>
      <span className="qsp-main">
        <span className="qsp-title">
          <span>
            <HighlightIndices indices={hl.title} text={pr.title} />
          </span>
          {pr.draft ? <Badge tone="warning">Draft</Badge> : null}
          {pr.merged ? <Badge tone="accent">Merged</Badge> : null}
        </span>
        <span className="qsp-meta">
          <Avatar name={pr.author} size={14} url={pr.authorAvatarUrl} />
          <span>
            <HighlightIndices indices={hl.author} text={pr.author} />
          </span>
          <span className="q-dot">·</span>
          <span>
            <HighlightIndices indices={hl.repo} text={pr.repo} />
          </span>
          {pr.headRef ? (
            <>
              <span className="q-dot">·</span>
              <span className="qsp-branch q-mono">
                <GitBranch aria-hidden size={11} />
                <HighlightIndices indices={hl.headRef} text={pr.headRef} />
              </span>
            </>
          ) : null}
        </span>
      </span>
      <span className="qsp-time q-mono">
        {formatRelativeTime(pr.updatedAt)}
      </span>
    </div>
  );
}
