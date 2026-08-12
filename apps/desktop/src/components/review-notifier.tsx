import { ReviewToast } from "@nod/ui/review-toast";
import { useEffect, useRef, useState } from "react";
import { useInbox } from "../hooks/use-inbox.ts";
import { useHotkeys } from "../keyboard/use-hotkeys.ts";
import { useAppStore } from "../store/app-store.ts";
import { type PullRequest, prKey } from "../types.ts";

/**
 * In-app "new review requested" notification (backlog: stronger than link
 * interception). Piggybacks on the existing 60s inbox poll — when a PR newly
 * appears in the Review-requests bucket, a keyboard-dismissable toast pops:
 * Enter opens it, Esc dismisses. No webhooks, no desktop-notification perms.
 *
 * Everything here is the decision of WHICH request to announce and for how
 * long: the seen-key ledger in localStorage, the diff against the poll, the
 * 12s expiry and the enter/esc scope. The card itself is review-toast in
 * @nod/ui.
 */

const KNOWN_KEY = "nod:knownReviewRequested:v1";
const LEGACY_KNOWN_KEY = "nod:knownReviewRequested";
const AUTO_DISMISS_MS = 12_000;

function loadKnown(): Set<string> | null {
  let raw = localStorage.getItem(KNOWN_KEY);
  if (raw === null) {
    raw = localStorage.getItem(LEGACY_KNOWN_KEY);
    if (raw !== null) {
      try {
        localStorage.setItem(KNOWN_KEY, raw);
        localStorage.removeItem(LEGACY_KNOWN_KEY);
      } catch {
        /* ignore quota / private-mode errors */
      }
    }
  }
  if (raw === null) {
    return null; // null = never seeded (first ever run)
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

function saveKnown(keys: string[]) {
  try {
    localStorage.setItem(KNOWN_KEY, JSON.stringify(keys));
  } catch {
    /* ignore quota / private-mode errors */
  }
}

const keyOf = (item: PullRequest) =>
  prKey({ name: item.name, number: item.number, owner: item.owner });

export function ReviewNotifier() {
  const { data } = useInbox();
  const [toast, setToast] = useState<{ pr: PullRequest; extra: number } | null>(
    null
  );

  /* Loaded lazily in the effect so render stays pure: `undefined` = not
     loaded yet, `null` = first ever run (seed silently, no toast). */
  const stored = useRef<Set<string> | null | undefined>(undefined);

  useEffect(() => {
    if (!data) {
      return;
    }
    const { prs } = data.reviewRequested;
    const current = prs.map(keyOf);

    const known = stored.current === undefined ? loadKnown() : stored.current;
    stored.current = new Set(current);
    saveKnown(current);

    if (known === null) {
      return;
    }
    const fresh = prs.filter((item) => !known.has(keyOf(item)));
    if (fresh.length === 0) {
      return;
    }

    const { route } = useAppStore.getState();
    const candidates = fresh.filter(
      (item) =>
        !(
          route.name === "review" &&
          route.owner === item.owner &&
          route.repo === item.name &&
          route.number === item.number
        )
    );
    if (candidates.length === 0) {
      return;
    }
    const latest = candidates.at(-1);
    if (!latest) {
      return;
    }
    setToast({
      extra: candidates.length - 1,
      pr: latest,
    });
  }, [data]);

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
      onDismiss={dismiss}
      onOpen={open}
      request={toast.pr}
    />
  );
}
