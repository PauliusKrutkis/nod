/**
 * Manage the watched repositories behind the "Watching" tab. Typing searches
 * the provider live (private repos included, scoped to what the token sees);
 * arrows + Enter watch a result. Pasting an exact `owner/repo` or a repo URL
 * still works when search comes up empty, so the pasted text is cleaned here
 * — the host is handed a repo, never a URL.
 *
 * The query is the host's because the search behind it is: the host debounces
 * it, cancels stale replies, and reports the outcome through `hits`, which
 * carries the whole search in one prop — `null` when there is no answer for
 * the current query yet (so the results box never blinks open empty while a
 * request is in flight), an array (possibly empty) once one arrives.
 * `repos` reads the same way: `undefined` while the list loads, `null` when
 * it could not be read and nothing was cached, an array once resolved. An
 * empty array is "nothing watched", which is a different sentence. Loading
 * shows on the search input — the sweep that a search in flight already draws
 * — rather than as a second spinner inside the list it is loading.
 *
 * Saves are optimistic and coalesced upstream, so `saving` is a status line
 * rather than a blocker: the list already shows the edit, and this only says
 * the write has not landed yet. `error` is the write that never landed.
 *
 * Keyboard: focus stays in the search input the whole time. Arrows walk the
 * search results, Tab arms a watched row (then Done) so Enter stops watching
 * it, and the footer names what Enter would do. Nothing here takes focus off
 * the input, which is why every armed control is tabIndex -1. The highlighted
 * result is clamped against the hits on screen rather than reset by an effect,
 * so a narrower answer can never leave the highlight pointing past the end.
 *
 * `inline` opens with show() instead of showModal() (see useModalDialog) and
 * `.qw-inline` returns the panel to normal flow for embedding hosts.
 */
import { Check, Eye, Search, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "../button/button.tsx";
import { cn } from "../cn/cn.ts";
import { Kbd } from "../kbd/kbd.tsx";
import { Spinner } from "../spinner/spinner.tsx";
import { useArmedRing } from "../use-armed-ring/use-armed-ring.ts";
import { useModalDialog } from "../use-modal-dialog/use-modal-dialog.ts";
import "./watch-repos-dialog.css";

const REPO_URL_PREFIX = /^https?:\/\/[^/]+\//;
const TRAILING_SLASHES = /\/+$/;

export interface RepoHit {
  description: string;
  fullName: string;
}

type Armed = number | "done" | null;

function armedActionLabel(armed: Armed): string {
  if (armed === "done") {
    return "close";
  }
  if (typeof armed === "number") {
    return "stop watching";
  }
  return "watch";
}

function nextArmedAfterRemove(armed: Armed, nextLength: number): Armed {
  if (typeof armed !== "number") {
    return armed;
  }
  if (nextLength === 0) {
    return null;
  }
  return Math.min(armed, nextLength - 1);
}

function cleanRepoName(raw: string): string | null {
  const cleaned = raw
    .trim()
    .replace(REPO_URL_PREFIX, "")
    .replace(TRAILING_SLASHES, "");
  return cleaned.includes("/") ? cleaned : null;
}

function handleWatchDialogKey(
  e: React.KeyboardEvent,
  ctx: {
    armed: Armed;
    cycleArmed: (dir: 1 | -1) => void;
    hits: readonly RepoHit[];
    query: string;
    onClose: () => void;
    repos: readonly string[];
    sel: number;
    setArmed: (value: Armed) => void;
    setSel: (value: number) => void;
    stopWatching: (repo: string) => void;
    watch: (fullName: string) => void;
  }
) {
  if (e.key === "Tab") {
    e.preventDefault();
    ctx.cycleArmed(e.shiftKey ? -1 : 1);
    return;
  }
  if (e.key === "ArrowDown") {
    e.preventDefault();
    ctx.setArmed(null);
    ctx.setSel(Math.min(ctx.sel + 1, ctx.hits.length - 1));
    return;
  }
  if (e.key === "ArrowUp") {
    e.preventDefault();
    ctx.setArmed(null);
    ctx.setSel(Math.max(ctx.sel - 1, 0));
    return;
  }
  if (e.key === "Enter") {
    e.preventDefault();
    if (ctx.armed === "done") {
      ctx.onClose();
      return;
    }
    if (typeof ctx.armed === "number") {
      const repo = ctx.repos[ctx.armed];
      if (repo) {
        ctx.stopWatching(repo);
      }
      return;
    }
    const hit = ctx.hits[ctx.sel];
    ctx.watch(hit ? hit.fullName : ctx.query);
    return;
  }
  if (e.key === "Escape") {
    e.preventDefault();
    ctx.onClose();
  }
}

export interface WatchReposDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  repos: readonly string[] | null | undefined;
  query: string;
  onQueryChange: (query: string) => void;
  hits: readonly RepoHit[] | null;
  onWatch: (fullName: string) => void;
  onStopWatching: (repo: string) => void;
  searching?: boolean;
  saving?: boolean;
  error?: string | null;
  inline?: boolean;
}

export function WatchReposDialog({ open, ...rest }: WatchReposDialogProps) {
  if (!open) {
    return null;
  }
  return <WatchReposDialogContent {...rest} />;
}

function WatchReposDialogContent({
  onOpenChange,
  repos,
  query,
  onQueryChange,
  hits,
  onWatch,
  onStopWatching,
  searching = false,
  saving = false,
  error = null,
  inline = false,
}: Omit<WatchReposDialogProps, "open">) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const { dialogRef, onDialogCancel, onDialogClose } = useModalDialog(
    () => {
      onOpenChange(false);
    },
    inline ? undefined : inputRef,
    { modal: !inline }
  );
  const [selRequest, setSel] = useState(0);

  const watched = repos ?? [];
  const results = hits ?? [];
  // One in-flight affordance for the whole panel, on the input: the search and
  // the first read of the watched list are both "the provider has not answered
  // yet", and the list used to say so a second time with a spinner of its own.
  const busy = searching || repos === undefined;
  const sel = Math.max(0, Math.min(selRequest, results.length - 1));
  const armOrder: Armed[] = [
    null,
    ...watched.map((_, repoIndex) => repoIndex),
    "done",
  ];
  const { armed, cycle, setArmed } = useArmedRing<Armed>(armOrder, null);
  const repoSet = new Set(watched);

  // Both lists have their own scroll window once the panel runs out of room,
  // so walking either one has to bring the row it lands on into view — arrows
  // through the results and Tab through the watched rows alike.
  useEffect(() => {
    resultsRef.current
      ?.querySelectorAll("[role='option']")
      [sel]?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  useEffect(() => {
    if (armed === null) {
      return;
    }
    listRef.current
      ?.querySelector('[data-armed="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [armed]);

  const close = () => {
    onOpenChange(false);
  };

  const stopWatching = (repo: string) => {
    setArmed(nextArmedAfterRemove(armed, watched.length - 1));
    onStopWatching(repo);
    inputRef.current?.focus();
  };

  const watch = (fullName: string) => {
    const cleaned = cleanRepoName(fullName);
    if (cleaned === null) {
      return;
    }
    if (!repoSet.has(cleaned)) {
      onWatch(cleaned);
    }
    onQueryChange("");
    inputRef.current?.focus();
  };

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onQueryChange(e.target.value);
    setArmed(null);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    handleWatchDialogKey(e, {
      armed,
      cycleArmed: cycle,
      hits: results,
      onClose: close,
      query,
      repos: watched,
      sel,
      setArmed,
      setSel,
      stopWatching,
      watch,
    });
  };

  return (
    <dialog
      aria-label="Watched repositories"
      className={cn("q-dialog q-dialog-top qw-panel", inline && "qw-inline")}
      onCancel={onDialogCancel}
      onClose={onDialogClose}
      ref={dialogRef}
    >
      <div className="qw-head">
        <h2 className="qw-title">
          <Eye aria-hidden size={14} />
          Watched repositories
        </h2>
        <p className="qw-sub">
          Every open PR in these repos shows up under Watching, whether or not
          you're involved.
        </p>
      </div>

      <div className="qw-body">
        <div className="qw-search">
          <Search aria-hidden className="qw-search-icon" size={14} />
          <input
            aria-busy={busy}
            aria-controls={listId}
            aria-expanded={results.length > 0}
            aria-label="Search repositories"
            autoComplete="off"
            className="qw-input"
            onChange={onInputChange}
            onKeyDown={onKeyDown}
            placeholder="Search repositories…  (or paste owner/repo)"
            ref={inputRef}
            role="combobox"
            spellCheck={false}
            value={query}
          />
          {busy ? <span aria-hidden className="qw-scan" /> : null}
        </div>

        {hits === null ? null : (
          <div
            className="qw-results"
            id={listId}
            ref={resultsRef}
            role="listbox"
          >
            {results.map((hit, i) => (
              <WatchHitRow
                hit={hit}
                index={i}
                key={hit.fullName}
                onSelect={setSel}
                onWatch={watch}
                selected={i === sel}
                watched={repoSet.has(hit.fullName)}
              />
            ))}
            {results.length === 0 ? (
              <p className="qw-none">
                {query.includes("/")
                  ? `No matches. Enter watches “${query.trim()}” as typed.`
                  : "No matches."}
              </p>
            ) : null}
          </div>
        )}

        <div className="qw-list">
          <div className="qw-list-rows" ref={listRef}>
            <WatchedList
              armed={armed}
              onStopWatching={stopWatching}
              repos={repos}
            />
          </div>
        </div>

        {saving ? (
          <div aria-live="polite" className="qw-saving" role="status">
            <Spinner label="Saving…" />
          </div>
        ) : null}

        {error ? (
          <p className="qw-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <div className="qw-foot">
        <span className="qw-foot-hint">
          <Kbd combo="up" />
          <Kbd combo="down" /> pick · <Kbd combo="enter" />{" "}
          {armedActionLabel(armed)} · <Kbd combo="tab" /> actions ·{" "}
          <Kbd combo="esc" /> done
        </span>
        <Button
          className={cn(armed === "done" && "qw-done-armed")}
          data-armed={armed === "done"}
          onClick={close}
          tabIndex={-1}
        >
          Done
        </Button>
      </div>
    </dialog>
  );
}

function WatchedList({
  armed,
  onStopWatching,
  repos,
}: {
  armed: Armed;
  onStopWatching: (repo: string) => void;
  repos: readonly string[] | null | undefined;
}) {
  // Loading says nothing here — the input is sweeping, and an empty box under
  // it is not mistakable for "nothing watched", which arrives with its own
  // sentence the moment the list resolves.
  if (repos === undefined) {
    return null;
  }
  if (repos === null) {
    return (
      <p className="qw-note">
        Couldn't read the watched list. Check your connection and reopen this
        view.
      </p>
    );
  }
  if (repos.length === 0) {
    return (
      <p className="qw-note">
        Nothing watched yet. Search above to add a repository.
      </p>
    );
  }
  return repos.map((repo, i) => (
    <WatchedRepoRow
      armed={armed === i}
      key={repo}
      onStopWatching={onStopWatching}
      repo={repo}
    />
  ));
}

function WatchHitRow({
  hit,
  index,
  selected,
  watched,
  onWatch,
  onSelect,
}: {
  hit: RepoHit;
  index: number;
  selected: boolean;
  watched: boolean;
  onWatch: (fullName: string) => void;
  onSelect: (index: number) => void;
}) {
  const handleClick = () => {
    if (!watched) {
      onWatch(hit.fullName);
    }
  };

  const handleMouseMove = () => {
    onSelect(index);
  };

  return (
    <button
      aria-selected={selected}
      className={cn("qw-hit", selected && "qw-hit-on")}
      disabled={watched}
      onClick={handleClick}
      onMouseMove={handleMouseMove}
      role="option"
      tabIndex={-1}
      type="button"
    >
      <span className="qw-hit-name">{hit.fullName}</span>
      {hit.description ? (
        <span className="qw-hit-desc">{hit.description}</span>
      ) : null}
      {watched ? (
        <Check
          aria-label="Already watching"
          className="qw-hit-check"
          size={13}
        />
      ) : null}
    </button>
  );
}

function WatchedRepoRow({
  repo,
  armed,
  onStopWatching,
}: {
  repo: string;
  armed: boolean;
  onStopWatching: (repo: string) => void;
}) {
  const handleClick = () => {
    onStopWatching(repo);
  };

  return (
    <div className={cn("qw-row", armed && "qw-row-armed")} data-armed={armed}>
      <span className="qw-name">{repo}</span>
      <button
        aria-label={`Stop watching ${repo}`}
        className="qw-x"
        onClick={handleClick}
        tabIndex={-1}
        type="button"
      >
        <X aria-hidden size={13} />
      </button>
    </div>
  );
}
