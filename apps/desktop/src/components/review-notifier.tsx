import { ReviewToast, type ReviewToastKind } from "@nod/ui/review-toast";
import { useEffect, useRef, useState } from "react";
import { useInbox } from "../hooks/use-inbox.ts";
import { useHotkeys } from "../keyboard/use-hotkeys.ts";
import { type Route, useAppStore } from "../store/app-store.ts";
import { type InboxData, type PullRequest, prKey } from "../types.ts";

/**
 * In-app notifications for the two events worth interrupting you (backlog:
 * stronger than link interception). Both piggyback on the existing inbox poll
 * and share one keyboard-dismissable toast: Enter opens, Esc dismisses. No
 * webhooks, no desktop-notification perms.
 *
 * Source 1, a review request: a PR newly appears in the Review-requests
 * bucket. Announced once per PR.
 *
 * Source 2, the author responding: a PR you did not write whose newest
 * comment is from its author. That is the reply to your review, and the inbox
 * payload carries it as `lastComment`. Announced once per comment, keyed on
 * the comment's createdAt, so a second reply on the same PR announces again
 * while a poll that returns the same comment stays quiet. The key is not
 * headSha (list items never carry one) and not updatedAt (labels, CI and your
 * own actions all move it). Your own comment can never trigger this: the
 * comment author has to be the PR author, and PRs you wrote are skipped both
 * by login and by membership of the Created bucket, which still holds before
 * the account finishes loading.
 *
 * Not covered, because the inbox payload cannot express it: a push with no
 * comment, a reply inside a review thread (`lastComment` is the newest
 * conversation comment, review-thread replies are not in it), and anything on
 * GitLab, where the list mapping leaves `lastComment` unset.
 *
 * Everything here is the decision of WHICH event to announce and for how
 * long: the two seen-key ledgers in localStorage, the diff against the poll,
 * the 12s expiry and the enter/esc scope. The card itself is review-toast in
 * @nod/ui.
 */

const KNOWN_KEY = "nod:knownReviewRequested:v1";
const LEGACY_KNOWN_KEY = "nod:knownReviewRequested";
const RESPONDED_KEY = "nod:knownAuthorResponses:v1";
const AUTO_DISMISS_MS = 12_000;

function readKnown(storageKey: string): Set<string> | null {
  const raw = localStorage.getItem(storageKey);
  if (raw === null) {
    return null;
  }
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v)
      ? new Set(v.filter((x) => typeof x === "string"))
      : new Set();
  } catch {
    return new Set();
  }
}

function loadRequested(): Set<string> | null {
  const legacy = localStorage.getItem(LEGACY_KNOWN_KEY);
  if (legacy !== null) {
    try {
      if (localStorage.getItem(KNOWN_KEY) === null) {
        localStorage.setItem(KNOWN_KEY, legacy);
      }
      localStorage.removeItem(LEGACY_KNOWN_KEY);
    } catch {
      /* ignore quota / private-mode errors */
    }
  }
  return readKnown(KNOWN_KEY);
}

function saveKnown(storageKey: string, keys: string[]) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(keys));
  } catch {
    /* ignore quota / private-mode errors */
  }
}

const keyOf = (item: PullRequest) =>
  prKey({ name: item.name, number: item.number, owner: item.owner });

const responseKeyOf = (item: PullRequest) =>
  `${keyOf(item)}@${item.lastComment?.createdAt ?? ""}`;

interface Toast {
  extra: number;
  kind: ReviewToastKind;
  pr: PullRequest;
}

function authorResponses(data: InboxData, viewer: string | null) {
  const buckets = [data.reviewRequested, data.assigned, data.involved];
  const mine = new Set(data.created.prs.map(keyOf));
  const seen = new Set<string>();
  const out: PullRequest[] = [];
  for (const bucket of buckets) {
    for (const item of bucket.prs) {
      const key = responseKeyOf(item);
      const yours = item.author === viewer || mine.has(keyOf(item));
      if (
        !(yours || seen.has(key)) &&
        item.lastComment?.author === item.author
      ) {
        seen.add(key);
        out.push(item);
      }
    }
  }
  return out;
}

function isOpen(route: Route, item: PullRequest) {
  return (
    route.name === "review" &&
    route.owner === item.owner &&
    route.repo === item.name &&
    route.number === item.number
  );
}

function pickToast(
  kind: ReviewToastKind,
  items: PullRequest[],
  known: Set<string> | null,
  route: Route
): Toast | null {
  if (known === null) {
    return null;
  }
  const identify = kind === "request" ? keyOf : responseKeyOf;
  const candidates = items.filter(
    (item) => !(known.has(identify(item)) || isOpen(route, item))
  );
  const pr = kind === "request" ? candidates.at(-1) : candidates.at(0);
  if (!pr) {
    return null;
  }
  return { extra: candidates.length - 1, kind, pr };
}

export function ReviewNotifier() {
  const { data } = useInbox();
  const viewer = useAppStore(
    (s) => s.accounts.find((a) => a.id === s.activeAccountId)?.login ?? null
  );
  const [toast, setToast] = useState<Toast | null>(null);

  /* Loaded lazily in the effect so render stays pure: `undefined` = not
     loaded yet, `null` = first ever run (seed silently, no toast). */
  const storedRequests = useRef<Set<string> | null | undefined>(undefined);
  const storedResponses = useRef<Set<string> | null | undefined>(undefined);

  useEffect(() => {
    if (!data) {
      return;
    }
    const requests = data.reviewRequested.prs;
    const responses = authorResponses(data, viewer);
    const requestKeys = requests.map(keyOf);
    const responseKeys = responses.map(responseKeyOf);

    const knownRequests =
      storedRequests.current === undefined
        ? loadRequested()
        : storedRequests.current;
    const knownResponses =
      storedResponses.current === undefined
        ? readKnown(RESPONDED_KEY)
        : storedResponses.current;
    storedRequests.current = new Set(requestKeys);
    storedResponses.current = new Set(responseKeys);
    saveKnown(KNOWN_KEY, requestKeys);
    saveKnown(RESPONDED_KEY, responseKeys);

    const { route } = useAppStore.getState();
    const next =
      pickToast("request", requests, knownRequests, route) ??
      pickToast("response", responses, knownResponses, route);
    if (next) {
      setToast(next);
    }
  }, [data, viewer]);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const t = setTimeout(() => setToast(null), AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [toast]);

  const dismiss = () => {
    setToast(null);
  };

  const open = () => {
    setToast((current) => {
      if (!current) {
        return null;
      }
      const { pr: reviewPr } = current;
      const store = useAppStore.getState();
      store.openReview(reviewPr.owner, reviewPr.name, reviewPr.number);
      store.markSeen(keyOf(reviewPr), reviewPr.updatedAt);
      return null;
    });
  };

  useHotkeys(
    "review-notifier",
    [
      {
        description: "Open review",
        hidden: true,
        keys: "enter",
        run: open,
      },
      {
        description: "Dismiss",
        hidden: true,
        keys: "esc",
        run: dismiss,
      },
    ],
    { enabled: !!toast }
  );

  if (!toast) {
    return null;
  }

  return (
    <ReviewToast
      extraCount={toast.extra}
      kind={toast.kind}
      onDismiss={dismiss}
      onOpen={open}
      request={toast.pr}
    />
  );
}
