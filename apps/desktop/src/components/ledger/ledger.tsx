/**
 * The review-ledger surface (docs/LEDGER.md §6, phase 3 dogfood): pick a
 * watched repository, land in its queue of unreviewed post-epoch regions,
 * sign what you have read. Three modes — pick (watched repos), path (one-time
 * "where is this cloned?" for a repo without a known working copy), queue —
 * driven by one binding set that branches on mode: j/k/enter walk whichever
 * list is active, r signs only in the queue, escape steps out one level
 * (queue → picker → inbox).
 *
 * Local clone locations live in nod:repoPaths:v1, a repo-key → absolute-path
 * map that is deliberately not ledger-private: go-to-definition and
 * whole-repo AI need the same mapping, so the ledger only reads and seeds
 * it. The last opened repo (nod:ledgerLastRepo:v1) short-circuits straight
 * to its queue on return visits. Status derivation runs the repo's own
 * ledger CLI through Rust — a full blame pass, so a cold load takes seconds
 * and the spinner says what it is waiting on. Selection clamps after every
 * refetch because signing shrinks the queue under the cursor.
 */
import { InboxZero } from "@nod/ui/inbox-zero";
import { Kbd } from "@nod/ui/kbd";
import { Spinner } from "@nod/ui/spinner";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, CornerUpLeft, PenLine } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useHotkeys } from "../../keyboard/use-hotkeys.ts";
import { api } from "../../lib/api.ts";
import { cn } from "../../lib/cn.ts";
import { queryKeys } from "../../lib/query-client.ts";
import { useAppStore } from "../../store/app-store.ts";
import type { LedgerQueueItem } from "../../types.ts";

const PATHS_KEY = "nod:repoPaths:v1";
const LAST_REPO_KEY = "nod:ledgerLastRepo:v1";

function loadRepoPaths(): Record<string, string> {
  try {
    const v = JSON.parse(localStorage.getItem(PATHS_KEY) ?? "{}");
    if (typeof v !== "object" || v === null || Array.isArray(v)) {
      return {};
    }
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(v)) {
      if (typeof value === "string") {
        out[key] = value;
      }
    }
    return out;
  } catch {
    return {};
  }
}

function savedRepoPaths(paths: Record<string, string>) {
  try {
    localStorage.setItem(PATHS_KEY, JSON.stringify(paths));
  } catch {
    /* ignore quota / private-mode errors */
  }
}

function loadLastRepo(): string {
  try {
    return localStorage.getItem(LAST_REPO_KEY) ?? "";
  } catch {
    return "";
  }
}

function saveLastRepo(repoKey: string) {
  try {
    localStorage.setItem(LAST_REPO_KEY, repoKey);
  } catch {
    /* ignore quota / private-mode errors */
  }
}

function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

function targetOf(item: LedgerQueueItem): string {
  return `${item.path}:${item.startLine}-${item.endLine}`;
}

type LedgerView =
  | { kind: "pick" }
  | { kind: "path"; repoKey: string }
  | { kind: "queue"; repoKey: string; path: string };

function initialView(): LedgerView {
  const last = loadLastRepo();
  const path = last ? loadRepoPaths()[last] : undefined;
  if (last && path) {
    return { kind: "queue", path, repoKey: last };
  }
  return { kind: "pick" };
}

export function Ledger() {
  const goInbox = useAppStore((s) => s.goInbox);
  const setToast = useAppStore((s) => s.setToast);
  const [view, setView] = useState<LedgerView>(initialView);
  const [paths, setPaths] = useState(loadRepoPaths);
  const [selected, setSelected] = useState(0);
  const [signing, setSigning] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const watched = useQuery({
    queryFn: () => api.getWatchedRepos(),
    queryKey: queryKeys.watchedRepos,
  });
  const repos = watched.data ?? [];

  const status = useQuery({
    enabled: view.kind === "queue",
    queryFn: () => api.ledgerStatus(view.kind === "queue" ? view.path : ""),
    queryKey: ["ledger", view.kind === "queue" ? view.path : ""],
  });
  const queue = status.data?.queue ?? [];

  const activeCount = view.kind === "queue" ? queue.length : repos.length;

  useEffect(() => {
    setSelected((s) => Math.max(0, Math.min(s, activeCount - 1)));
  }, [activeCount]);

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${selected}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const openRepo = (repoKey: string) => {
    saveLastRepo(repoKey);
    setSelected(0);
    const path = paths[repoKey];
    setView(
      path ? { kind: "queue", path, repoKey } : { kind: "path", repoKey }
    );
  };

  const savePathFor = (repoKey: string, form: FormData) => {
    const path = String(form.get("path") ?? "").trim();
    if (!path) {
      return;
    }
    const next = { ...paths, [repoKey]: path };
    setPaths(next);
    savedRepoPaths(next);
    setView({ kind: "queue", path, repoKey });
  };

  const stepOut = () => {
    if (view.kind === "pick") {
      goInbox();
    } else {
      setSelected(0);
      setView({ kind: "pick" });
    }
  };

  const sign = async () => {
    const item = queue[selected];
    if (view.kind !== "queue" || !item || signing) {
      return;
    }
    setSigning(true);
    try {
      await api.ledgerReview(view.path, targetOf(item));
      await status.refetch();
      setToast({ message: targetOf(item), title: "Region signed" });
    } catch (e) {
      setToast({ message: String(e), title: "Signing failed" });
    } finally {
      setSigning(false);
    }
  };

  useHotkeys("ledger", [
    {
      description: "Next",
      group: "Queue",
      icon: ArrowDown,
      keys: ["j", "down"],
      run: () => setSelected((s) => Math.min(s + 1, activeCount - 1)),
    },
    {
      description: "Previous",
      group: "Queue",
      icon: ArrowUp,
      keys: ["k", "up"],
      run: () => setSelected((s) => Math.max(s - 1, 0)),
    },
    {
      description: "Open repository",
      group: "Queue",
      hidden: view.kind !== "pick",
      keys: "enter",
      run: () => {
        if (view.kind === "pick" && repos[selected]) {
          openRepo(repos[selected]);
        }
      },
    },
    {
      description: "Mark region reviewed",
      group: "Queue",
      icon: PenLine,
      keys: "r",
      run: sign,
    },
    {
      description: "Back",
      group: "Queue",
      icon: CornerUpLeft,
      keys: "esc",
      run: stepOut,
    },
  ]);

  if (view.kind === "pick") {
    return (
      <RepoPicker
        listRef={listRef}
        onOpen={openRepo}
        paths={paths}
        repos={repos}
        selected={selected}
      />
    );
  }

  if (view.kind === "path") {
    return (
      <ClonePathForm
        onBack={stepOut}
        onSubmit={(form) => savePathFor(view.repoKey, form)}
        repoKey={view.repoKey}
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-baseline gap-4 border-line border-b px-6 py-3">
        <button
          className="font-medium text-fg hover:text-muted"
          onClick={stepOut}
          title="Choose another repository"
          type="button"
        >
          {view.repoKey}
        </button>
        {status.data && (
          <>
            <span className="font-semibold text-fg text-xl tabular-nums">
              {(status.data.coverage * 100).toFixed(1)}%
            </span>
            <span className="text-muted text-sm">
              {status.data.reviewedLines}/{status.data.totalLines} post-epoch
              lines · {queue.length} regions
            </span>
            <span className="text-faint text-xs">
              epoch {shortSha(status.data.epoch)} → tip{" "}
              {shortSha(status.data.tip)}
            </span>
          </>
        )}
        <span className="ml-auto max-w-64 truncate text-faint text-xs">
          {view.path}
        </span>
      </header>

      <QueueBody
        error={status.error}
        listRef={listRef}
        onSelect={setSelected}
        pending={status.isPending}
        queue={queue}
        selected={selected}
      />

      <footer className="flex items-center gap-5 border-line border-t px-6 py-2 text-faint text-xs">
        <span>
          <Kbd combo="j" /> / <Kbd combo="k" /> navigate
        </span>
        <span>
          <Kbd combo="r" /> mark reviewed
        </span>
        <span>
          <Kbd combo="esc" /> back
        </span>
      </footer>
    </div>
  );
}

function RepoPicker({
  listRef,
  onOpen,
  paths,
  repos,
  selected,
}: {
  listRef: React.RefObject<HTMLDivElement | null>;
  onOpen: (repoKey: string) => void;
  paths: Record<string, string>;
  repos: string[];
  selected: number;
}) {
  if (repos.length === 0) {
    return (
      <InboxZero
        hint="Watch a repository first — press w on the inbox."
        title="Nothing to ledger yet"
      />
    );
  }
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-baseline gap-4 border-line border-b px-6 py-3">
        <span className="font-medium text-fg">Ledger</span>
        <span className="text-muted text-sm">
          coverage of what's on main, per repository
        </span>
      </header>
      <div
        aria-label="Watched repositories"
        className="min-h-0 flex-1 overflow-y-auto py-2"
        ref={listRef}
        role="listbox"
      >
        {repos.map((repoKey, i) => (
          <PickerRow
            index={i}
            key={repoKey}
            onOpen={onOpen}
            path={paths[repoKey]}
            repoKey={repoKey}
            selected={i === selected}
          />
        ))}
      </div>
      <footer className="flex items-center gap-5 border-line border-t px-6 py-2 text-faint text-xs">
        <span>
          <Kbd combo="j" /> / <Kbd combo="k" /> navigate
        </span>
        <span>
          <Kbd combo="↵" /> open
        </span>
        <span>
          <Kbd combo="esc" /> inbox
        </span>
      </footer>
    </div>
  );
}

function PickerRow({
  index,
  onOpen,
  path,
  repoKey,
  selected,
}: {
  index: number;
  onOpen: (repoKey: string) => void;
  path: string | undefined;
  repoKey: string;
  selected: boolean;
}) {
  const handleClick = () => {
    onOpen(repoKey);
  };
  return (
    <div
      aria-selected={selected}
      className={cn(
        "flex cursor-default items-baseline gap-3 px-6 py-1.5",
        selected && "bg-surface-2"
      )}
      data-index={index}
      onClick={handleClick}
      role="option"
      tabIndex={-1}
    >
      <span className="shrink-0 font-medium text-fg text-sm">{repoKey}</span>
      <span className="truncate font-mono text-faint text-xs">
        {path ?? "no local clone yet — enter sets one"}
      </span>
    </div>
  );
}

function QueueBody({
  error,
  listRef,
  onSelect,
  pending,
  queue,
  selected,
}: {
  error: unknown;
  listRef: React.RefObject<HTMLDivElement | null>;
  onSelect: (index: number) => void;
  pending: boolean;
  queue: LedgerQueueItem[];
  selected: number;
}) {
  if (pending) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <Spinner label="Deriving status from git…" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center px-8">
        <p className="max-w-lg text-danger text-sm">{String(error)}</p>
      </div>
    );
  }
  if (queue.length === 0) {
    return (
      <div className="min-h-0 flex-1">
        <InboxZero
          hint="Every post-epoch line on tip carries a review."
          title="Queue is empty"
        />
      </div>
    );
  }
  return (
    <div
      aria-label="Unreviewed regions"
      className="min-h-0 flex-1 overflow-y-auto py-2"
      ref={listRef}
      role="listbox"
    >
      {queue.map((item, i) => (
        <QueueRow
          index={i}
          item={item}
          key={targetOf(item)}
          onSelect={onSelect}
          selected={i === selected}
        />
      ))}
    </div>
  );
}

function QueueRow({
  index,
  item,
  onSelect,
  selected,
}: {
  index: number;
  item: LedgerQueueItem;
  onSelect: (index: number) => void;
  selected: boolean;
}) {
  const handleClick = () => {
    onSelect(index);
  };
  return (
    <div
      aria-selected={selected}
      className={cn(
        "flex cursor-default items-center gap-3 px-6 py-1.5",
        selected && "bg-surface-2"
      )}
      data-index={index}
      onClick={handleClick}
      role="option"
      tabIndex={-1}
    >
      <span className="shrink-0 font-mono text-[13px] text-fg">
        {targetOf(item)}
      </span>
      <span className="shrink-0 text-faint text-xs tabular-nums">
        {item.newLines} lines
      </span>
      {item.provenance.map((p) => (
        <span className="shrink-0 text-accent text-xs" key={p.sha}>
          {p.pr === null ? shortSha(p.sha) : `#${p.pr}`}
        </span>
      ))}
      <span className="truncate text-muted text-xs">
        {item.provenance[0]?.subject}
      </span>
    </div>
  );
}

function ClonePathForm({
  onBack,
  onSubmit,
  repoKey,
}: {
  onBack: () => void;
  onSubmit: (form: FormData) => void;
  repoKey: string;
}) {
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onSubmit(new FormData(e.currentTarget));
  };
  return (
    <div className="flex h-full items-center justify-center">
      <form
        className="flex w-full max-w-md flex-col gap-3"
        onSubmit={handleSubmit}
      >
        <h2 className="font-medium text-fg">Where is {repoKey} cloned?</h2>
        <p className="text-muted text-sm">
          Absolute path to your local working copy. Set once — go-to-definition
          and repo-wide AI will use the same location.
        </p>
        <input
          aria-label="Repository path"
          autoFocus
          className="rounded border border-line bg-surface px-3 py-2 font-mono text-fg text-sm"
          name="path"
          placeholder="/path/to/clone"
          spellCheck={false}
        />
        <div className="flex gap-2">
          <button
            className="rounded border border-line bg-surface-2 px-4 py-1.5 text-fg text-sm hover:bg-elevated"
            type="submit"
          >
            Save
          </button>
          <button
            className="rounded px-4 py-1.5 text-muted text-sm hover:text-fg"
            onClick={onBack}
            type="button"
          >
            Back
          </button>
        </div>
      </form>
    </div>
  );
}
