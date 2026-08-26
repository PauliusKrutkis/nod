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
 */
import { InboxDetail, type InboxPullRequest } from "@nod/ui/inbox-detail";
import { InboxZero } from "@nod/ui/inbox-zero";
import { PRListItem, type PullRequestRow } from "@nod/ui/pr-list-item";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, CornerUpLeft } from "lucide-react";
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
  groupQueueByProvenance,
  isBucketTopic,
  type ProvenanceGroup,
} from "../../lib/ledger-session.ts";
import { queryKeys } from "../../lib/query-client.ts";
import { useAppStore } from "../../store/app-store.ts";
import type {
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
    };

/** One queue row: a topic group of one watched repository. */
interface QueueEntry {
  repoKey: string;
  group: ProvenanceGroup;
  approval: LedgerTopicApproval | null;
  status: LedgerStatus;
  /** Sole commit author across the group, when everyone agrees. */
  author?: string;
  /** Newest provenance commit — the group's freshness, PR-row style. */
  updatedAt?: string;
  commentCount: number;
  lastComment?: { author: string; body: string; createdAt: string };
}

/** Author, freshness, and comment presence for one group — the fields the
 *  PR row and pane show, derived from provenance and positioned facts. */
function entryMeta(
  group: ProvenanceGroup,
  status: LedgerStatus
): Pick<QueueEntry, "author" | "updatedAt" | "commentCount" | "lastComment"> {
  const authors = new Set<string>();
  let updatedAt: string | undefined;
  for (const item of group.items) {
    for (const p of item.provenance) {
      if (p.author) {
        authors.add(p.author);
      }
      if (p.at && (updatedAt === undefined || p.at > updatedAt)) {
        updatedAt = p.at;
      }
    }
  }
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
    author: authors.size === 1 ? [...authors][0] : undefined,
    commentCount,
    lastComment: last,
    updatedAt,
  };
}

interface FinishedTopic {
  repoKey: string;
  topic: LedgerTopicStatus;
}

/** Every loaded repo's groups, flattened in watched order, plus the
 *  signed-off pile; repos still deriving contribute nothing yet. */
function assembleQueue(
  repos: readonly string[],
  data: readonly (LedgerStatus | undefined)[]
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
    const open = new Set(groups.map((g) => g.key));
    for (const group of groups) {
      entries.push({
        approval: approvalOf.get(group.key) ?? null,
        group,
        repoKey,
        status,
        ...entryMeta(group, status),
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
    return "Watch a repository first — press w.";
  }
  if (ledgerCount === 0) {
    return "The ledger is off for every watched repository — press w and flip a Ledger toggle.";
  }
  return "Every post-epoch line on tip carries a review.";
}

function seenKey(entry: QueueEntry): string {
  return `ledger:${entry.repoKey}:${entry.group.key}`;
}

export function Ledger({ onLeave }: { onLeave: () => void }) {
  useLedgerAssignments();
  // The inbox's own seen-tracking, namespaced: a group reads unread until
  // its session is opened, and lights again when newer commits join it.
  const isUnread = useAppStore((s) => s.isUnread);
  const markSeen = useAppStore((s) => s.markSeen);
  const [view, setView] = useState<LedgerView>({ kind: "queue" });
  const [selectedIndex, setSelected] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const { ledgerRepos: repos, watchedCount } = useLedgerRepos();

  const statuses = useLedgerStatuses(repos);

  // "mapping features…" only when a model can actually be mapping: keyless
  // configs keep the deterministic labels and the note would never resolve.
  const aiInfo = useQuery({
    queryFn: api.getAiConfig,
    queryKey: queryKeys.aiConfig,
  });
  const aiConfigured = aiInfo.data?.configured === true;

  const { entries, finished } = assembleQueue(
    repos,
    statuses.map((q) => q.data)
  );
  const pendingRepo = repos.find((_, i) => statuses[i]?.isPending);
  const anyData = statuses.some((q) => q.data !== undefined);
  const firstError = statuses.find((q) => q.error)?.error;

  const prep = useLedgerPrep(pendingRepo ?? "");

  const inQueue = view.kind === "queue";
  const activeCount = entries.length;

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

  // Mirror the inbox: once the cursor rests, warm the selected session and
  // its neighbours so Enter opens instantly.
  useEffect(() => {
    const timer = setTimeout(() => {
      for (const offset of [0, 1, -1]) {
        const entry = entries[selected + offset];
        if (entry) {
          prefetchLedgerSession(entry.repoKey, entry.group.items.map(targetOf));
        }
      }
    }, 180);
    return () => clearTimeout(timer);
  }, [selected, entries]);

  const openSession = (index = selected) => {
    const entry = entries[index];
    const first = entry?.group.items[0];
    if (!(entry && first)) {
      return;
    }
    markSeen(seenKey(entry), entry.updatedAt ?? new Date().toISOString());
    setView({
      group: { label: entry.group.label, subject: entry.group.subject },
      initialTarget: targetOf(first),
      kind: "session",
      repoKey: entry.repoKey,
      targets: entry.group.items.map(targetOf),
    });
  };

  useHotkeys("inbox", [
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
      description: "Open session",
      group: "Queue",
      keys: "enter",
      run: () => {
        if (inQueue) {
          openSession();
        }
      },
    },
    {
      description: "Back",
      group: "Queue",
      icon: CornerUpLeft,
      keys: "esc",
      run: () => {
        if (inQueue) {
          onLeave();
        }
      },
    },
  ]);

  if (view.kind === "session") {
    return (
      <LedgerSession
        group={view.group}
        initialTarget={view.initialTarget}
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

  const active = entries[selected];
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="qiv-body">
        <div
          aria-label="Review sessions"
          className="qiv-list"
          ref={listRef}
          role="listbox"
        >
          {entries.map((entry, i) => (
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
              archivable={false}
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

/** A topic group in the PR row's shape. The title answers "what is this
 *  thing?": the feature name when the topic has one, and only for bucket
 *  labels (#123, a bare sha — unmapped or keyless) the leading commit
 *  subject, with the bucket riding the branch chip. A named topic never
 *  repeats itself in the chip. No number — a group can span many PRs, and
 *  the pane lists them all. */
function rowOf(entry: QueueEntry): PullRequestRow {
  const bucket = isBucketTopic(entry.group.label);
  return {
    author: entry.author,
    commentsCount: entry.commentCount,
    draft: false,
    headRef: bucket ? entry.group.label : "",
    merged: false,
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
    body,
    changedFiles: group.fileCount,
    commentsCount: entry.commentCount,
    deletions: 0,
    draft: false,
    lastComment: entry.lastComment,
    merged: false,
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
