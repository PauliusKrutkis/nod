/**
 * The review-ledger surface (docs/LEDGER.md §6): pick a watched
 * repository, land in its queue of review sessions — unreviewed
 * post-epoch regions pooled by feature-ish provenance (conventional-commit
 * scope, PR fallback) — and enter one to read and sign. Three modes —
 * pick (watched repos), queue, session — j/k/enter walk whichever list is
 * active, escape steps out one level (session → queue → picker → inbox).
 * Signing lives only inside the session, where the code is on screen: a
 * queue-level sign would be the rubber-stamp §13 warns about.
 *
 * Repos are addressed as owner/repo keys; Rust resolves everything else —
 * the store's bare clone (cloning on first open), the tip, the actor, the
 * durable fact journal. Nothing is asked of the user and nothing touches
 * the target repo. The last opened repo (nod:ledgerLastRepo:v1)
 * short-circuits straight to its queue on return visits. Status
 * derivation runs the bundled engine through Rust — a full blame pass, so
 * a cold load takes seconds and the spinner says what it is waiting on; a
 * first-ever open also clones. Selection clamps at read rather than in an
 * effect, because signing shrinks the group list under the cursor and a
 * clamping effect would cost a second render on every refetch.
 */
import { InboxZero } from "@nod/ui/inbox-zero";
import { Kbd } from "@nod/ui/kbd";
import { Spinner } from "@nod/ui/spinner";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, CornerUpLeft } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLedgerAssignments } from "../../hooks/use-ledger-assignments.ts";
import { useHotkeys } from "../../keyboard/use-hotkeys.ts";
import { api } from "../../lib/api.ts";
import { cn } from "../../lib/cn.ts";
import {
  groupQueueByProvenance,
  type ProvenanceGroup,
} from "../../lib/ledger-session.ts";
import { queryKeys } from "../../lib/query-client.ts";
import { useAppStore } from "../../store/app-store.ts";
import type {
  LedgerQueueItem,
  LedgerTopicApproval,
  LedgerTopicStatus,
} from "../../types.ts";
import { LedgerSession } from "./ledger-session.tsx";

const LAST_REPO_KEY = "nod:ledgerLastRepo:v1";

/** owner/repo, and nothing that could be an absolute path from the era
 * when this key stored clone locations. */
const REPO_KEY_SHAPE = /^[^/\s]+\/[^/\s]+$/;

function loadLastRepo(): string {
  try {
    const stored = localStorage.getItem(LAST_REPO_KEY) ?? "";
    return REPO_KEY_SHAPE.test(stored) ? stored : "";
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
  | { kind: "queue"; repoKey: string }
  | {
      kind: "session";
      repoKey: string;
      group: { label: string; subject: string };
      targets: string[];
      initialTarget: string;
    };

function initialView(): LedgerView {
  const last = loadLastRepo();
  if (last) {
    return { kind: "queue", repoKey: last };
  }
  return { kind: "pick" };
}

export function Ledger() {
  const goInbox = useAppStore((s) => s.goInbox);
  useLedgerAssignments();
  const [view, setView] = useState<LedgerView>(initialView);
  const [selectedIndex, setSelected] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const watched = useQuery({
    queryFn: () => api.getWatchedRepos(),
    queryKey: queryKeys.watchedRepos,
  });
  const repos = watched.data ?? [];

  const inRepo = view.kind === "queue" || view.kind === "session";
  const status = useQuery({
    enabled: inRepo,
    queryFn: () => api.ledgerStatus(inRepo ? view.repoKey : ""),
    queryKey: queryKeys.ledger(inRepo ? view.repoKey : ""),
  });
  const queue = status.data?.queue ?? [];
  const { groups } = groupQueueByProvenance(queue);
  const topics = status.data?.topics ?? [];
  const openTopics = new Set(groups.map((g) => g.key));
  const finished = topics.filter(
    (t) =>
      !openTopics.has(t.id) &&
      (t.approvedAt !== null ||
        (t.totalLines > 0 && t.reviewedLines >= t.totalLines))
  );
  const approvalOf = new Map(
    topics.filter((t) => t.approvedAt !== null).map((t) => [t.id, t.approvedAt])
  );

  const activeCount = view.kind === "queue" ? groups.length : repos.length;

  // Signing a region shrinks the queue under the cursor, so the stored index
  // can outrun the list. Clamping at read keeps the selection in range without
  // the extra render an effect would cost; the movement keys write back the
  // clamped value, so the raw index never drifts past what was on screen.
  const selected = Math.max(0, Math.min(selectedIndex, activeCount - 1));

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${selected}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const openRepo = (repoKey: string) => {
    saveLastRepo(repoKey);
    setSelected(0);
    setView({ kind: "queue", repoKey });
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
      run: () => setSelected(Math.min(selected + 1, activeCount - 1)),
    },
    {
      description: "Previous",
      group: "Queue",
      icon: ArrowUp,
      keys: ["k", "up"],
      run: () => setSelected(Math.max(selected - 1, 0)),
    },
    {
      description: view.kind === "pick" ? "Open repository" : "Open session",
      group: "Queue",
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
        repos={repos}
        selected={selected}
      />
    );
  }

  if (view.kind === "session") {
    return (
      <LedgerSession
        group={view.group}
        initialTarget={view.initialTarget}
        onExit={() => setView({ kind: "queue", repoKey: view.repoKey })}
        onSigned={(target) =>
          setView((v) =>
            v.kind === "session"
              ? { ...v, targets: v.targets.filter((t) => t !== target) }
              : v
          )
        }
        repoKey={view.repoKey}
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
            {status.data.unassigned.length > 0 && (
              <span className="text-faint text-xs">mapping features…</span>
            )}
          </>
        )}
      </header>

      <QueueBody
        approvalOf={approvalOf}
        error={status.error}
        finished={finished}
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
  repos,
  selected,
}: {
  listRef: React.RefObject<HTMLDivElement | null>;
  onOpen: (repoKey: string) => void;
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
  repoKey,
  selected,
}: {
  index: number;
  onOpen: (repoKey: string) => void;
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
    </button>
  );
}

function QueueBody({
  approvalOf,
  error,
  finished,
  groups,
  listRef,
  onOpen,
  onSelect,
  pending,
  selected,
}: {
  approvalOf: ReadonlyMap<string, LedgerTopicApproval | null>;
  error: unknown;
  finished: LedgerTopicStatus[];
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
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1">
          <InboxZero
            hint="Every post-epoch line on tip carries a review."
            title="Queue is empty"
          />
        </div>
        <FinishedStrip finished={finished} />
      </div>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        aria-label="Review sessions"
        className="min-h-0 flex-1 overflow-y-auto py-2"
        ref={listRef}
        role="listbox"
      >
        {groups.map((group, i) => (
          <GroupRow
            approval={approvalOf.get(group.key) ?? null}
            group={group}
            index={i}
            key={group.key}
            onOpen={onOpen}
            onSelect={onSelect}
            selected={i === selected}
          />
        ))}
      </div>
      <FinishedStrip finished={finished} />
    </div>
  );
}

/**
 * The topics with nothing left to read: approved, or region-signed to 100%.
 * Presence matters more than detail — this is the ratchet made visible, the
 * pile that grows as sessions close and shrinks when new commits reopen one.
 */
function FinishedStrip({ finished }: { finished: LedgerTopicStatus[] }) {
  if (finished.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-line border-t px-6 py-2 text-xs">
      <span className="text-faint">signed off ({finished.length})</span>
      {finished.map((topic) => (
        <span className="text-muted" key={topic.id} title={topicTitle(topic)}>
          {topic.id}
        </span>
      ))}
    </div>
  );
}

function topicTitle(topic: LedgerTopicStatus): string {
  const lines = `${topic.reviewedLines}/${topic.totalLines} lines`;
  return topic.approvedAt
    ? `approved by ${topic.approvedAt.actor.id} at ${shortSha(topic.approvedAt.sha)} · ${lines}`
    : `every region signed · ${lines}`;
}

function GroupRow({
  approval,
  group,
  index,
  onOpen,
  onSelect,
  selected,
}: {
  approval: LedgerTopicApproval | null;
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
      {approval !== null && (
        <span
          className="shrink-0 text-warning text-xs"
          title={`approved by ${approval.actor.id}; these lines changed since`}
        >
          Δ since {shortSha(approval.sha)}
        </span>
      )}
      <span className="shrink-0 text-faint text-xs tabular-nums">
        {group.items.length} region{group.items.length === 1 ? "" : "s"} ·{" "}
        {group.fileCount} file{group.fileCount === 1 ? "" : "s"} ·{" "}
        {group.newLines} lines
      </span>
      {otherChips(group).map((chip) => (
        <span className="shrink-0 text-accent text-xs" key={chip}>
          {chip}
        </span>
      ))}
      <span className="truncate text-muted text-xs">{group.subject}</span>
    </button>
  );
}

/** A group's chips minus the one already shown as its label. */
function otherChips(group: { chips: string[]; label: string }): string[] {
  const rest: string[] = [];
  for (const chip of group.chips) {
    if (chip !== group.label) {
      rest.push(chip);
    }
  }
  return rest;
}
