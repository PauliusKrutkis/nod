/**
 * The review-ledger surface (docs/LEDGER.md §6), mounted as the inbox's
 * Ledger tab and deliberately indistinguishable from it: one flat list
 * across every watched repository — like the PR inbox, the repo lives on
 * the row, not in a picker — rendered through the inbox's own components
 * (PRListItem rows, InboxDetail reading pane, the qiv-body arrangement)
 * with topic data instead of PR data. One component, different data; the
 * two lists cannot drift apart. j/k/enter walk the list, escape leaves to
 * the PR tabs via onLeave. Signing lives only inside the session, where
 * the code is on screen: a queue-level sign would be the rubber-stamp §13
 * warns about.
 *
 * Rows map a topic group into the PR row's shape: the leading commit
 * subject is the title, the topic name rides the branch chip, the unread
 * dot lights when a decayed approval left new lines to read. The reading
 * pane carries the repo's coverage and the group's provenance and files as
 * the description. Every watched repo derives in parallel (warm-on-watch
 * usually already paid the cost); repos still deriving simply have not
 * joined the list yet, and the staged prep view shows only when there is
 * nothing to show at all.
 *
 * Bindings register under the inbox scope: this component only mounts on
 * its tab, where the inbox's own list keys stand down, so the tab bar's
 * digits and Tab keep working from inside the ledger.
 *
 * Signing shrinks the queue under the cursor, so the selection index is
 * clamped at read instead of reset by an effect; movement keys write back
 * the clamped value, and the raw index never drifts past the screen.
 * Groups reuse the inbox's own stores under `ledger:{repo}:{topic}` keys:
 * seen-tracking (unread until the session opens, relit by newer commits)
 * and the archive map (e hides until new commits land, z undoes, u browses
 * the pile). Authors come from the forge's own commit-to-account answer,
 * cached forever since shas are immutable; the "mapping features…" note
 * shows only when an AI key is configured, because keyless configs keep
 * the deterministic labels and the note would never resolve. A nod://ledger
 * link is stashed in the store until derivation surfaces the named group —
 * a cold repo may still be deriving when the link lands — then its session
 * opens directly, leaving the archived filter off.
 */
import { InboxDetail, type InboxPullRequest } from "@nod/ui/inbox-detail";
import { InboxZero } from "@nod/ui/inbox-zero";
import { Kbd } from "@nod/ui/kbd";
import { PRListItem, type PullRequestRow } from "@nod/ui/pr-list-item";
import { useQueries, useQuery } from "@tanstack/react-query";
import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  CornerUpLeft,
  Link,
  Undo2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLedgerAssignments } from "../../hooks/use-ledger-assignments.ts";
import { useLedgerPrep } from "../../hooks/use-ledger-prep.ts";
import {
  prefetchLedgerSession,
  useLedgerRepos,
  useLedgerStatuses,
} from "../../hooks/use-ledger-statuses.ts";
import { useHotkeys } from "../../keyboard/use-hotkeys.ts";
import { api } from "../../lib/api.ts";
import {
  forgeIdentity,
  groupQueueByProvenance,
  isBucketTopic,
  newestProvenanceAt,
  type ProvenanceGroup,
} from "../../lib/ledger-session.ts";
import { queryKeys } from "../../lib/query-client.ts";
import { useAppStore } from "../../store/app-store.ts";
import type {
  LedgerCommitAuthors,
  LedgerQueueItem,
  LedgerStatus,
  LedgerTopicApproval,
  LedgerTopicStatus,
} from "../../types.ts";
import { LedgerPrep } from "./ledger-prep.tsx";
import { LedgerSession } from "./ledger-session.tsx";

function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

function targetOf(item: LedgerQueueItem): string {
  return `${item.path}:${item.startLine}-${item.endLine}`;
}

const noop = () => undefined;

type LedgerView =
  | { kind: "queue" }
  | {
      kind: "session";
      repoKey: string;
      group: { label: string; subject: string };
      targets: string[];
      initialTarget: string;
      author?: string;
      authorAvatarUrl?: string;
      approval: LedgerTopicApproval | null;
      number?: number;
      updatedAt?: string;
    };

/** One queue row: a topic group of one watched repository, carrying the
 *  PR-row fields derived for it — the sole author when every provenance
 *  commit agrees, the fact-minted display number, and the newest
 *  provenance commit as its freshness. */
interface QueueEntry {
  repoKey: string;
  group: ProvenanceGroup;
  approval: LedgerTopicApproval | null;
  status: LedgerStatus;
  author?: string;
  authorAvatarUrl?: string;
  number?: number;
  updatedAt?: string;
  commentCount: number;
  lastComment?: { author: string; body: string; createdAt: string };
}

/** The group's sole author as a PR-row identity, when every provenance
 *  commit agrees. The forge's own answer (ledger_commit_authors: the
 *  linked account by verified email — the same face a PR shows) wins;
 *  offline or unlinked commits fall back to the noreply-email heuristic,
 *  then the git name. Unanimity is judged on the displayed identity, so
 *  two spellings of the same person still count as one author. */
function soleIdentity(
  group: ProvenanceGroup,
  resolved: LedgerCommitAuthors
): Pick<QueueEntry, "author" | "authorAvatarUrl"> {
  const authors = new Map<
    string,
    { author?: string; authorAvatarUrl?: string }
  >();
  for (const item of group.items) {
    for (const p of item.provenance) {
      const linked = resolved[p.sha];
      const identity = linked
        ? { author: linked.login, authorAvatarUrl: linked.avatarUrl }
        : forgeIdentity(p.author || undefined, p.authorEmail || undefined);
      if (identity.author) {
        authors.set(identity.author, identity);
      }
    }
  }
  const sole = authors.size === 1 ? [...authors.values()][0] : undefined;
  return sole ?? {};
}

/** Author, freshness, and comment presence for one group — the fields the
 *  PR row and pane show, derived from provenance and positioned facts. */
function entryMeta(
  group: ProvenanceGroup,
  status: LedgerStatus,
  resolved: LedgerCommitAuthors
): Pick<
  QueueEntry,
  "author" | "authorAvatarUrl" | "updatedAt" | "commentCount" | "lastComment"
> {
  const updatedAt = newestProvenanceAt(group);
  const files = new Set(group.items.map((i) => i.path));
  let commentCount = 0;
  let last: QueueEntry["lastComment"];
  let lastAt = "";
  for (const comment of status.comments) {
    if (comment.parent !== null || !files.has(comment.path)) {
      continue;
    }
    commentCount += 1;
    if (comment.atTime > lastAt) {
      lastAt = comment.atTime;
      last = {
        author: comment.actor.id,
        body: comment.body,
        createdAt: comment.atTime,
      };
    }
  }
  return {
    ...soleIdentity(group, resolved),
    commentCount,
    lastComment: last,
    updatedAt,
  };
}

/** Distinct provenance shas of a status, sorted — the resolver's work list
 *  and the stable half of its query key. */
function provenanceShas(status: LedgerStatus): string[] {
  const shas = new Set<string>();
  for (const item of status.queue) {
    for (const p of item.provenance) {
      shas.add(p.sha);
    }
  }
  return [...shas].sort();
}

interface FinishedTopic {
  repoKey: string;
  topic: LedgerTopicStatus;
}

/** Every loaded repo's groups, flattened in watched order, plus the
 *  signed-off pile; repos still deriving contribute nothing yet. */
function assembleQueue(
  repos: readonly string[],
  data: readonly (LedgerStatus | undefined)[],
  authors: readonly LedgerCommitAuthors[]
): { entries: QueueEntry[]; finished: FinishedTopic[] } {
  const entries: QueueEntry[] = [];
  const finished: FinishedTopic[] = [];
  for (const [i, repoKey] of repos.entries()) {
    const status = data[i];
    if (!status) {
      continue;
    }
    const { groups } = groupQueueByProvenance(status.queue);
    const approvalOf = new Map(
      status.topics
        .filter((t) => t.approvedAt !== null)
        .map((t) => [t.id, t.approvedAt])
    );
    const numberOf = new Map(
      status.topics
        .filter((t) => t.number !== null)
        .map((t) => [t.id, t.number])
    );
    const open = new Set(groups.map((g) => g.key));
    for (const group of groups) {
      entries.push({
        approval: approvalOf.get(group.key) ?? null,
        group,
        number: numberOf.get(group.key) ?? undefined,
        repoKey,
        status,
        ...entryMeta(group, status, authors[i] ?? {}),
      });
    }
    for (const topic of status.topics) {
      const done =
        !open.has(topic.id) &&
        (topic.approvedAt !== null ||
          (topic.totalLines > 0 && topic.reviewedLines >= topic.totalLines));
      if (done) {
        finished.push({ repoKey, topic });
      }
    }
  }
  return { entries, finished };
}

function zeroHint(watchedCount: number, ledgerCount: number): string {
  if (watchedCount === 0) {
    return "No repositories watched yet. Press w to add one.";
  }
  if (ledgerCount === 0) {
    return "The ledger is off for every watched repository. Press w and flip a Ledger toggle.";
  }
  return "Every post-epoch line on tip carries a review.";
}

function seenKey(entry: QueueEntry): string {
  return `ledger:${entry.repoKey}:${entry.group.key}`;
}

/** What a toast calls the group — the row's own title rule. */
function groupTitle(entry: QueueEntry): string {
  return isBucketTopic(entry.group.label)
    ? entry.group.subject || entry.group.label
    : entry.group.label;
}

// react-doctor-disable-next-line no-giant-component -- the tab's container: store wiring, the queue/session/zero/prep branching, and archive/link actions over shared state; the assemblers, hotkey map, and row/pane mappers already live outside, and threading a dozen state slices through further extractions would read worse. Same call as review-screen.tsx and ledger-session.tsx; BACKLOG § Tech debt records it
export function Ledger({ onLeave }: { onLeave: () => void }) {
  useLedgerAssignments();
  const isUnread = useAppStore((s) => s.isUnread);
  const markSeen = useAppStore((s) => s.markSeen);
  const dismissed = useAppStore((s) => s.dismissed);
  const dismiss = useAppStore((s) => s.dismiss);
  const clearDismissed = useAppStore((s) => s.clearDismissed);
  const undoDismiss = useAppStore((s) => s.undoDismiss);
  const setToast = useAppStore((s) => s.setToast);
  const linkTarget = useAppStore((s) => s.ledgerLinkTarget);
  const setLedgerLinkTarget = useAppStore((s) => s.setLedgerLinkTarget);
  const [showArchived, setShowArchived] = useState(false);
  const [view, setView] = useState<LedgerView>({ kind: "queue" });
  const [selectedIndex, setSelected] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const { ledgerRepos: repos, watchedCount } = useLedgerRepos();

  const statuses = useLedgerStatuses(repos);

  const aiInfo = useQuery({
    queryFn: api.getAiConfig,
    queryKey: queryKeys.aiConfig,
  });
  const aiConfigured = aiInfo.data?.configured === true;

  const authorQueries = useQueries({
    queries: repos.map((repoKey, i) => {
      const status = statuses[i]?.data;
      const shas = status ? provenanceShas(status) : [];
      return {
        enabled: shas.length > 0,
        queryFn: () => api.ledgerCommitAuthors(repoKey, shas),
        queryKey: ["ledger-authors", repoKey, shas],
        staleTime: Number.POSITIVE_INFINITY,
      };
    }),
  });

  const { entries, finished } = assembleQueue(
    repos,
    statuses.map((q) => q.data),
    authorQueries.map((q) => q.data ?? {})
  );
  const isHidden = (entry: QueueEntry) => {
    const at = dismissed[seenKey(entry)];
    return (
      !!at &&
      entry.updatedAt !== undefined &&
      new Date(entry.updatedAt).getTime() <= new Date(at).getTime()
    );
  };
  const archivedEntries = entries.filter(isHidden);
  const visible = showArchived
    ? archivedEntries
    : entries.filter((entry) => !isHidden(entry));
  const pendingRepo = repos.find((_, i) => statuses[i]?.isPending);
  const anyData = statuses.some((q) => q.data !== undefined);
  const firstError = statuses.find((q) => q.error)?.error;

  const prep = useLedgerPrep(pendingRepo ?? "");

  const inQueue = view.kind === "queue";
  const activeCount = visible.length;
  const selected = Math.max(0, Math.min(selectedIndex, activeCount - 1));

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${selected}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  useEffect(() => {
    const timer = setTimeout(() => {
      for (const offset of [0, 1, -1]) {
        const entry = visible[selected + offset];
        if (entry) {
          prefetchLedgerSession(entry.repoKey, entry.group.items.map(targetOf));
        }
      }
    }, 180);
    return () => clearTimeout(timer);
  }, [selected, visible]);

  const openEntry = (entry: QueueEntry) => {
    const first = entry.group.items[0];
    if (!first) {
      return;
    }
    markSeen(seenKey(entry), entry.updatedAt ?? new Date().toISOString());
    setView({
      approval: entry.approval,
      author: entry.author,
      authorAvatarUrl: entry.authorAvatarUrl,
      group: { label: entry.group.label, subject: entry.group.subject },
      initialTarget: targetOf(first),
      kind: "session",
      number: entry.number,
      repoKey: entry.repoKey,
      targets: entry.group.items.map(targetOf),
      updatedAt: entry.updatedAt,
    });
  };

  const openSession = (index = selected) => {
    const entry = visible[index];
    if (entry) {
      openEntry(entry);
    }
  };

  useEffect(() => {
    if (!linkTarget) {
      return;
    }
    const entry = entries.find(
      (candidate) =>
        candidate.repoKey === linkTarget.repoKey &&
        candidate.group.key === linkTarget.topic
    );
    if (entry) {
      setLedgerLinkTarget(null);
      // react-doctor-disable-next-line react-hooks-js/set-state-in-effect -- resolving a link needs the derived queue, which may only fill in on a later render (a cold repo derives after the link lands), and opening the session is a side effect (markSeen) — it cannot be computed during render; the linkTarget guard clears itself so this runs once per link
      setShowArchived(false);
      setSelected(0);
      openEntry(entry);
    }
  });

  const archiveSelected = () => {
    const entry = visible[selected];
    if (!entry) {
      return;
    }
    if (showArchived) {
      clearDismissed(seenKey(entry));
      setToast({
        message: groupTitle(entry),
        note: "Back in the queue",
        title: "Restored",
      });
      return;
    }
    dismiss(seenKey(entry), entry.updatedAt ?? new Date().toISOString());
    setToast({
      action: undoDismiss,
      actionLabel: "Undo",
      message: groupTitle(entry),
      note: "Back when new commits land",
      title: "Archived",
    });
  };

  const copySelectedLink = () => {
    const entry = visible[selected];
    if (!entry) {
      return;
    }
    const url = `nod://ledger/${entry.repoKey}/${encodeURIComponent(entry.group.key)}`;
    navigator.clipboard?.writeText(url).catch(() => undefined);
    setToast({ message: url, title: "Copied group link" });
  };

  useQueueHotkeys({
    archiveSelected,
    copySelectedLink,
    next: () => setSelected(Math.min(selected + 1, activeCount - 1)),
    onBack: () => {
      if (inQueue) {
        onLeave();
      }
    },
    onOpen: () => {
      if (inQueue) {
        openSession();
      }
    },
    prev: () => setSelected(Math.max(selected - 1, 0)),
    toggleArchived: () => {
      setShowArchived((v) => !v);
      setSelected(0);
    },
    undoArchive: undoDismiss,
  });

  if (view.kind === "session") {
    return (
      <LedgerSession
        approval={view.approval}
        author={view.author}
        authorAvatarUrl={view.authorAvatarUrl}
        group={view.group}
        initialTarget={view.initialTarget}
        number={view.number}
        onExit={() => setView({ kind: "queue" })}
        onSigned={(target) =>
          setView((v) =>
            v.kind === "session"
              ? { ...v, targets: v.targets.filter((t) => t !== target) }
              : v
          )
        }
        repoKey={view.repoKey}
        targets={view.targets}
        updatedAt={view.updatedAt}
      />
    );
  }

  if (entries.length === 0) {
    if (pendingRepo !== undefined) {
      const pendingCount = statuses.filter((q) => q.isPending).length;
      return (
        <LedgerPrep
          others={Math.max(0, pendingCount - 1)}
          repoKey={pendingRepo}
          update={prep}
        />
      );
    }
    if (repos.length > 0 && !anyData && firstError !== undefined) {
      return (
        <div className="flex min-h-0 flex-1 items-center justify-center px-8">
          <p className="max-w-lg text-danger text-sm">{String(firstError)}</p>
        </div>
      );
    }
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex-1">
          <InboxZero
            hint={zeroHint(watchedCount, repos.length)}
            title={repos.length === 0 ? "Nothing to ledger yet" : "All read"}
          />
        </div>
        <FinishedStrip finished={finished} multiRepo={repos.length > 1} />
      </div>
    );
  }

  if (visible.length === 0) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex-1">
          <InboxZero
            hint={
              showArchived
                ? "u returns to the queue."
                : "Everything left is archived. Press u to see it."
            }
            title={showArchived ? "Nothing archived" : "All read"}
          />
        </div>
        <FinishedStrip finished={finished} multiRepo={repos.length > 1} />
      </div>
    );
  }

  const active = visible[selected];
  return (
    <div className="flex h-full min-h-0 flex-col">
      {showArchived && (
        <div className="qiv-banner">
          <ArchiveRestore size={13} />
          <span>
            Archived · <Kbd combo="e" /> restores, <Kbd combo="u" /> returns
          </span>
        </div>
      )}
      <div className="qiv-body">
        <div
          aria-label="Review sessions"
          className="qiv-list"
          ref={listRef}
          role="listbox"
        >
          {visible.map((entry, i) => (
            <div data-index={i} key={`${entry.repoKey}:${entry.group.key}`}>
              <PRListItem
                onHover={() => setSelected(i)}
                onOpen={() => openSession(i)}
                pr={rowOf(entry)}
                selected={i === selected}
                unread={
                  entry.updatedAt
                    ? isUnread(seenKey(entry), entry.updatedAt)
                    : entry.approval !== null
                }
              />
            </div>
          ))}
        </div>
        {active && (
          <div className="qiv-detail">
            <InboxDetail
              archivable={!showArchived}
              onOpenTicket={noop}
              openHint="open session"
              pr={detailOf(active, aiConfigured)}
            />
          </div>
        )}
      </div>
      <FinishedStrip finished={finished} multiRepo={repos.length > 1} />
    </div>
  );
}

/** The queue's key map under the inbox scope — the inbox's own bindings
 *  (useInboxHotkeys) stand down on the ledger tab, and these take the same
 *  keys with the same meanings: j/k/enter walk and open, e/z/u archive,
 *  y copies the group's link, esc leaves to the PR tabs. */
function useQueueHotkeys({
  archiveSelected,
  copySelectedLink,
  next,
  onBack,
  onOpen,
  prev,
  toggleArchived,
  undoArchive,
}: {
  archiveSelected: () => void;
  copySelectedLink: () => void;
  next: () => void;
  onBack: () => void;
  onOpen: () => void;
  prev: () => void;
  toggleArchived: () => void;
  undoArchive: () => void;
}) {
  useHotkeys("inbox", [
    {
      description: "Next",
      group: "Queue",
      icon: ArrowDown,
      keys: ["j", "down"],
      run: next,
    },
    {
      description: "Previous",
      group: "Queue",
      icon: ArrowUp,
      keys: ["k", "up"],
      run: prev,
    },
    {
      description: "Open session",
      group: "Queue",
      keys: "enter",
      run: onOpen,
    },
    {
      description: "Archive until it updates",
      group: "Queue",
      icon: Archive,
      keys: "e",
      run: archiveSelected,
    },
    {
      description: "Undo archive",
      group: "Queue",
      icon: Undo2,
      keys: "z",
      run: undoArchive,
    },
    {
      description: "Show archived / back",
      group: "Queue",
      icon: ArchiveRestore,
      keys: "u",
      run: toggleArchived,
    },
    {
      description: "Copy group link",
      group: "Queue",
      icon: Link,
      keys: "y",
      run: copySelectedLink,
    },
    {
      description: "Back",
      group: "Queue",
      icon: CornerUpLeft,
      keys: "esc",
      run: onBack,
    },
  ]);
}

/** A topic group in the PR row's shape. The title answers "what is this
 *  thing?": the feature name when the topic has one, and only for bucket
 *  labels (#123, a bare sha — unmapped or keyless) the leading commit
 *  subject, with the bucket riding the branch chip. A named topic never
 *  repeats itself in the chip. The number is the ledger's own (#N minted
 *  as a fact) — a group can span many PRs, and the pane lists them all. */
function rowOf(entry: QueueEntry): PullRequestRow {
  const bucket = isBucketTopic(entry.group.label);
  return {
    author: entry.author,
    authorAvatarUrl: entry.authorAvatarUrl,
    commentsCount: entry.commentCount,
    draft: false,
    headRef: bucket ? entry.group.label : "",
    merged: false,
    number: entry.number,
    repo: entry.repoKey,
    title: bucket
      ? entry.group.subject || entry.group.label
      : entry.group.label,
    updatedAt: entry.updatedAt,
  };
}

/** The reading pane's shape: the repo's coverage plus the group's
 *  provenance and files, composed as the description text. */
function detailOf(entry: QueueEntry, aiConfigured: boolean): InboxPullRequest {
  const { group, status } = entry;
  const files = new Map<string, number>();
  const provenance = new Map<string, string>();
  for (const item of group.items) {
    files.set(item.path, (files.get(item.path) ?? 0) + item.newLines);
    for (const p of item.provenance) {
      const label = p.pr ? `#${p.pr}` : shortSha(p.sha);
      if (!provenance.has(label)) {
        provenance.set(label, p.subject);
      }
    }
  }
  const mapping =
    aiConfigured && status.unassigned.length > 0 ? " · mapping features…" : "";
  const body = [
    `Coverage ${(status.coverage * 100).toFixed(1)}% · ${status.reviewedLines}/${status.totalLines} post-epoch lines · epoch ${shortSha(status.epoch)} → tip ${shortSha(status.tip)}${mapping}`,
    "",
    "How it got here:",
    ...[...provenance].map(([label, subject]) => `${label} ${subject}`),
    "",
    "Files:",
    ...[...files].map(([path, lines]) => `${path} (+${lines})`),
  ].join("\n");
  return {
    additions: group.newLines,
    author: entry.author,
    authorAvatarUrl: entry.authorAvatarUrl,
    body,
    changedFiles: group.fileCount,
    commentsCount: entry.commentCount,
    deletions: 0,
    draft: false,
    lastComment: entry.lastComment,
    merged: false,
    number: entry.number,
    repo: entry.repoKey,
    title: isBucketTopic(group.label)
      ? group.subject || group.label
      : group.label,
    updatedAt: entry.updatedAt,
  };
}

/**
 * The topics with nothing left to read: approved, or region-signed to 100%.
 * Presence matters more than detail — this is the ratchet made visible, the
 * pile that grows as sessions close and shrinks when new commits reopen one.
 */
function FinishedStrip({
  finished,
  multiRepo,
}: {
  finished: { repoKey: string; topic: LedgerTopicStatus }[];
  multiRepo: boolean;
}) {
  if (finished.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-line border-t px-6 py-2 text-xs">
      <span className="text-faint">signed off ({finished.length})</span>
      {finished.map(({ repoKey, topic }) => (
        <span
          className="text-muted"
          key={`${repoKey}:${topic.id}`}
          title={topicTitle(topic)}
        >
          {multiRepo ? `${repoKey.split("/")[1] ?? repoKey}: ` : ""}
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
