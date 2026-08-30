/**
 * Ledger mutations — OPTIMISTIC by the same design principle the PR
 * surface's useCommentMutations follows ("no loading states"): the fact's
 * effect lands in the cached session and status the moment you act, the
 * sidecar reconciles in the background, and a failure rolls both caches
 * back and surfaces a toast instead of ever blocking the UI.
 *
 * The ledger is local (sidecar over a store clone), so there is no offline
 * queue here — a failure is a real failure, not a connectivity state.
 *
 * Synthesized facts need ids the numeric-id bridge (ledger-session.ts) can
 * parse, so temp ids are hex: a descending fff… prefix keeps them unique
 * within a session and visibly fake in a debugger. Signing writes the
 * narrowed session (the caller drops the target from view state, which
 * changes the query key) so the next render paints from cache instead of
 * flashing the pending shell; a failed sign therefore invalidates every
 * session key for the repo on top of the rollback, because the snapshot
 * restore alone cannot reach the narrowed entry the optimism seeded.
 * Every verb returns its settle promise so callers can hold an in-flight
 * guard against key auto-repeat.
 */
import { api } from "../lib/api.ts";
import { queryClient, queryKeys } from "../lib/query-client.ts";
import { useAppStore } from "../store/app-store.ts";
import type { LedgerComment, LedgerSession, LedgerStatus } from "../types.ts";

let tempCounter = 0;

function nextFactId(): string {
  tempCounter += 1;
  return `fff${tempCounter.toString(16).padStart(13, "0")}`;
}

function ownActor(): { id: string; kind: "human" } {
  const s = useAppStore.getState();
  const account = s.accounts.find((a) => a.id === s.activeAccountId);
  return { id: account?.login ?? "you", kind: "human" };
}

interface Snapshot {
  session: LedgerSession | undefined;
  status: LedgerStatus | undefined;
}

export function useLedgerMutations(args: {
  repoKey: string;
  targets: readonly string[];
  tip: string;
}) {
  const { repoKey, targets, tip } = args;
  const setToast = useAppStore((s) => s.setToast);
  const sessionKey = queryKeys.ledgerSession(repoKey, targets);
  const statusKey = queryKeys.ledger(repoKey);

  const snapshot = (): Snapshot => ({
    session: queryClient.getQueryData<LedgerSession>(sessionKey),
    status: queryClient.getQueryData<LedgerStatus>(statusKey),
  });

  const rollback = (before: Snapshot, title: string, e: unknown) => {
    if (before.session) {
      queryClient.setQueryData(sessionKey, before.session);
    }
    if (before.status) {
      queryClient.setQueryData(statusKey, before.status);
    }
    setToast({ message: String(e), title });
  };

  const reconcile = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: statusKey }),
      queryClient.invalidateQueries({ queryKey: ["ledger-session", repoKey] }),
    ]);

  const insertComment = (comment: LedgerComment) => {
    queryClient.setQueryData<LedgerSession>(sessionKey, (cur) =>
      cur ? { ...cur, comments: [...cur.comments, comment] } : cur
    );
    queryClient.setQueryData<LedgerStatus>(statusKey, (cur) =>
      cur ? { ...cur, comments: [...cur.comments, comment] } : cur
    );
  };

  const addComment = (c: {
    path: string;
    line: number;
    startLine?: number;
    body: string;
  }) => {
    const before = snapshot();
    const start = c.startLine ?? c.line;
    insertComment({
      actor: ownActor(),
      anchorStatus: "alive",
      atSha: tip,
      atTime: new Date().toISOString(),
      body: c.body,
      endLine: c.line,
      id: nextFactId(),
      parent: null,
      path: c.path,
      resolved: false,
      startLine: start,
    });
    return api
      .ledgerComment(repoKey, `${c.path}:${start}-${c.line}`, c.body)
      .then(reconcile)
      .catch((e) => rollback(before, "Comment failed", e));
  };

  const reply = (parentFactId: string, body: string) => {
    const before = snapshot();
    const root = before.session?.comments.find((c) => c.id === parentFactId);
    insertComment({
      actor: ownActor(),
      anchorStatus: root?.anchorStatus ?? "alive",
      atSha: tip,
      atTime: new Date().toISOString(),
      body,
      endLine: root?.endLine ?? null,
      id: nextFactId(),
      parent: parentFactId,
      path: root?.path ?? "",
      resolved: false,
      startLine: root?.startLine ?? null,
    });
    return api
      .ledgerComment(repoKey, "", body, parentFactId)
      .then(reconcile)
      .catch((e) => rollback(before, "Reply failed", e));
  };

  const resolveThread = (factId: string) => {
    const before = snapshot();
    const mark = (cur: { comments: LedgerComment[] }) => ({
      ...cur,
      comments: cur.comments.map((c) =>
        c.id === factId || c.parent === factId ? { ...c, resolved: true } : c
      ),
    });
    queryClient.setQueryData<LedgerSession>(sessionKey, (cur) =>
      cur ? { ...cur, ...mark(cur) } : cur
    );
    queryClient.setQueryData<LedgerStatus>(statusKey, (cur) =>
      cur ? { ...cur, ...mark(cur) } : cur
    );
    return api
      .ledgerResolve(repoKey, factId)
      .then(reconcile)
      .catch((e) => rollback(before, "Resolve failed", e));
  };

  const sign = (target: string) => {
    const before = snapshot();
    const narrowed = targets.filter((t) => t !== target);
    if (before.session) {
      const sessions: LedgerSession["sessions"] = [];
      for (const file of before.session.sessions) {
        const regions = file.regions.filter(
          (r) => `${file.path}:${r.startLine}-${r.endLine}` !== target
        );
        if (regions.length > 0) {
          sessions.push({ ...file, regions });
        }
      }
      queryClient.setQueryData<LedgerSession>(
        queryKeys.ledgerSession(repoKey, narrowed),
        { ...before.session, sessions }
      );
    }
    queryClient.setQueryData<LedgerStatus>(statusKey, (cur) => {
      if (!cur) {
        return cur;
      }
      const signed = cur.queue.find(
        (i) => `${i.path}:${i.startLine}-${i.endLine}` === target
      );
      const reviewedLines = cur.reviewedLines + (signed?.newLines ?? 0);
      return {
        ...cur,
        coverage: cur.totalLines > 0 ? reviewedLines / cur.totalLines : 1,
        queue: cur.queue.filter((i) => i !== signed),
        reviewedLines,
      };
    });
    return api
      .ledgerReview(repoKey, target)
      .then(reconcile)
      .catch((e) => {
        rollback(before, "Signing failed", e);
        return queryClient.invalidateQueries({
          queryKey: ["ledger-session", repoKey],
        });
      });
  };

  const approve = (topic: string) => {
    const before = snapshot();
    queryClient.setQueryData<LedgerStatus>(statusKey, (cur) => {
      if (!cur) {
        return cur;
      }
      const dropped = cur.queue.filter((i) => i.topic === topic);
      const reviewedLines =
        cur.reviewedLines + dropped.reduce((n, i) => n + i.newLines, 0);
      return {
        ...cur,
        coverage: cur.totalLines > 0 ? reviewedLines / cur.totalLines : 1,
        queue: cur.queue.filter((i) => i.topic !== topic),
        reviewedLines,
        topics: cur.topics.map((t) =>
          t.id === topic
            ? {
                ...t,
                approvals: t.approvals + 1,
                approvedAt: {
                  actor: ownActor(),
                  atTime: new Date().toISOString(),
                  sha: tip,
                },
              }
            : t
        ),
      };
    });
    return api
      .ledgerApprove(repoKey, topic)
      .then(reconcile)
      .catch((e) => rollback(before, "Approval failed", e));
  };

  return { addComment, approve, reply, resolveThread, sign };
}
