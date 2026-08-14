/**
 * The review-ledger surface (docs/LEDGER.md §6, phase 3 dogfood): pick a
 * watched repository, land in its queue of review sessions — unreviewed
 * post-epoch regions pooled by feature-ish provenance (conventional-commit
 * scope, PR fallback) — and enter one to read and sign. Four modes — pick
 * (watched repos), path (one-time "where is this cloned?" for a repo
 * without a known working copy), queue, session — j/k/enter walk whichever
 * list is active, escape steps out one level (session → queue → picker →
 * inbox). Signing lives only inside the session, where the code is on
 * screen: a queue-level sign would be the rubber-stamp §13 warns about.
 *
 * Local clone locations live in nod:repoPaths:v1, a repo-key → absolute-path
 * map that is deliberately not ledger-private: go-to-definition and
 * whole-repo AI need the same mapping, so the ledger only reads and seeds
 * it. The last opened repo (nod:ledgerLastRepo:v1) short-circuits straight
 * to its queue on return visits. Status derivation runs the repo's own
 * ledger CLI through Rust — a full blame pass, so a cold load takes seconds
 * and the spinner says what it is waiting on. Selection clamps after every
 * refetch because signing shrinks the group list under the cursor.
 */
import { InboxZero } from "@nod/ui/inbox-zero";
import { Kbd } from "@nod/ui/kbd";
import { Spinner } from "@nod/ui/spinner";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, CornerUpLeft } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useHotkeys } from "../../keyboard/use-hotkeys.ts";
import { api } from "../../lib/api.ts";
import { cn } from "../../lib/cn.ts";
import {
  groupQueueByProvenance,
  type ProvenanceGroup,
} from "../../lib/ledger-session.ts";
import { queryKeys } from "../../lib/query-client.ts";
import { useAppStore } from "../../store/app-store.ts";
import type { LedgerQueueItem } from "../../types.ts";
import { LedgerSession } from "./ledger-session.tsx";

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
  | { kind: "queue"; repoKey: string; path: string }
  | {
      kind: "session";
      repoKey: string;
      path: string;
      group: { label: string; subject: string };
      targets: string[];
      initialTarget: string;
    };

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
  const [view, setView] = useState<LedgerView>(initialView);
  const [paths, setPaths] = useState(loadRepoPaths);
  const [selected, setSelected] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const watched = useQuery({
    queryFn: () => api.getWatchedRepos(),
    queryKey: queryKeys.watchedRepos,
  });
  const repos = watched.data ?? [];

  const inRepo = view.kind === "queue" || view.kind === "session";
  const status = useQuery({
    enabled: inRepo,
    queryFn: () => api.ledgerStatus(inRepo ? view.path : ""),
    queryKey: queryKeys.ledger(inRepo ? view.path : ""),
  });
  const queue = status.data?.queue ?? [];
  const { groups } = groupQueueByProvenance(queue);

  const activeCount = view.kind === "queue" ? groups.length : repos.length;

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

  const openSession = (index = selected) => {
    if (view.kind !== "queue") {
      return;
    }
    const group = groups[index];
    const first = group?.items[0];
    if (!(group && first)) {
      return;
    }
    setView({
      group: { label: group.label, subject: group.subject },
      initialTarget: targetOf(first),
      kind: "session",
      path: view.path,
      repoKey: view.repoKey,
      targets: group.items.map(targetOf),
    });
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
      description: view.kind === "pick" ? "Open repository" : "Open session",
      group: "Queue",
      hidden: view.kind === "path",
      keys: "enter",
      run: () => {
        if (view.kind === "pick" && repos[selected]) {
          openRepo(repos[selected]);
        } else if (view.kind === "queue") {
          openSession();
        }
      },
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

  if (view.kind === "session") {
    return (
      <LedgerSession
        group={view.group}
        initialTarget={view.initialTarget}
        onExit={() =>
          setView({ kind: "queue", path: view.path, repoKey: view.repoKey })
        }
        onSigned={(target) =>
          setView((v) =>
            v.kind === "session"
              ? { ...v, targets: v.targets.filter((t) => t !== target) }
              : v
          )
        }
        repoPath={view.path}
        targets={view.targets}
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
        groups={groups}
        listRef={listRef}
        onOpen={openSession}
        onSelect={setSelected}
        pending={status.isPending}
        selected={selected}
      />

      <footer className="flex items-center gap-5 border-line border-t px-6 py-2 text-faint text-xs">
        <span>
          <Kbd combo="j" /> / <Kbd combo="k" /> navigate
        </span>
        <span>
          <Kbd combo="↵" /> open session
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
    <button
      aria-selected={selected}
      className={cn(
        "flex w-full cursor-default items-baseline gap-3 px-6 py-1.5 text-left",
        selected && "bg-surface-2"
      )}
      data-index={index}
      onClick={handleClick}
      role="option"
      tabIndex={-1}
      type="button"
    >
      <span className="shrink-0 font-medium text-fg text-sm">{repoKey}</span>
      <span className="truncate font-mono text-faint text-xs">
        {path ?? "no local clone yet — enter sets one"}
      </span>
    </button>
  );
}

function QueueBody({
  error,
  groups,
  listRef,
  onOpen,
  onSelect,
  pending,
  selected,
}: {
  error: unknown;
  groups: ProvenanceGroup[];
  listRef: React.RefObject<HTMLDivElement | null>;
  onOpen: (index: number) => void;
  onSelect: (index: number) => void;
  pending: boolean;
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
  if (groups.length === 0) {
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
      aria-label="Review sessions"
      className="min-h-0 flex-1 overflow-y-auto py-2"
      ref={listRef}
      role="listbox"
    >
      {groups.map((group, i) => (
        <GroupRow
          group={group}
          index={i}
          key={group.key}
          onOpen={onOpen}
          onSelect={onSelect}
          selected={i === selected}
        />
      ))}
    </div>
  );
}

function GroupRow({
  group,
  index,
  onOpen,
  onSelect,
  selected,
}: {
  group: ProvenanceGroup;
  index: number;
  onOpen: (index: number) => void;
  onSelect: (index: number) => void;
  selected: boolean;
}) {
  const handleClick = () => {
    onSelect(index);
  };
  const handleDoubleClick = () => {
    onOpen(index);
  };
  return (
    <button
      aria-selected={selected}
      className={cn(
        "flex w-full cursor-default items-center gap-3 px-6 py-1.5 text-left",
        selected && "bg-surface-2"
      )}
      data-index={index}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      role="option"
      tabIndex={-1}
      type="button"
    >
      <span className="shrink-0 font-medium text-fg">{group.label}</span>
      <span className="shrink-0 text-faint text-xs tabular-nums">
        {group.items.length} region{group.items.length === 1 ? "" : "s"} ·{" "}
        {group.fileCount} file{group.fileCount === 1 ? "" : "s"} ·{" "}
        {group.newLines} lines
      </span>
      {group.chips
        .filter((chip) => chip !== group.label)
        .map((chip) => (
          <span className="shrink-0 text-accent text-xs" key={chip}>
            {chip}
          </span>
        ))}
      <span className="truncate text-muted text-xs">{group.subject}</span>
    </button>
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
