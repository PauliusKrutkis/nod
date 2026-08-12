/**
 * The notification runtime: detectors over each inbox arrival, the log for
 * memory, and the sinks that actually interrupt you.
 *
 * The component-level effect that used to live in the notifier is gone
 * (BACKLOG §"React effects", review-notifier row): what remains here hands the
 * payload to pure detectors and a store, and does no diffing, no key ledger
 * and no persistence of its own. Detection deliberately stays on a commit-
 * phase effect rather than a query-cache subscription — the cache notifies
 * synchronously, and `ingest` writes to a store the notification list is
 * subscribed to, so a cache-driven announce lands a state update on that list
 * in the middle of another component's render. Running twice is harmless
 * anyway, because `ingest` is idempotent.
 *
 * Dismissing the toast does not mark the event read — waving a card off your
 * screen is not the same as dealing with the PR, and the list exists precisely
 * to hold what you waved off. Opening does, because going to the PR is the
 * strongest signal there is. Either way the read write happens outside the
 * state updater, never inside it: an updater runs during render, and this one
 * writes to a store the notification list subscribes to, which would be an
 * update to another component mid-render.
 *
 * Sinks read the same batch `ingest` returned, so the toast and the OS banner
 * can never disagree about what is new. Each is gated by that kind's channel,
 * and the toast additionally skips the PR you are already reading — being told
 * about the screen in front of you is noise, and the log still records it so
 * the list stays complete.
 */
import { useCallback, useEffect, useState } from "react";
import { detectEvents, notificationCopy } from "../lib/notification-events.ts";
import { sendOsNotification } from "../lib/os-notification.ts";
import { type Route, useAppStore } from "../store/app-store.ts";
import {
  type StoredNotification,
  useNotificationStore,
} from "../store/notification-store.ts";
import {
  useSettingsStore,
  wantsOsBanner,
  wantsToast,
} from "../store/settings-store.ts";
import { useInbox } from "./use-inbox.ts";

const AUTO_DISMISS_MS = 12_000;

function isOpenOnScreen(route: Route, event: StoredNotification): boolean {
  return (
    route.name === "review" &&
    route.owner === event.owner &&
    route.repo === event.name &&
    route.number === event.number
  );
}

export function useNotificationFeed() {
  const { data } = useInbox();
  const [toast, setToast] = useState<{
    event: StoredNotification;
    extra: number;
  } | null>(null);

  useEffect(() => {
    if (!data) {
      return;
    }
    const fresh = useNotificationStore.getState().ingest(detectEvents(data));
    if (fresh.length === 0) {
      return;
    }
    const { notify } = useSettingsStore.getState();
    const { route } = useAppStore.getState();

    for (const event of fresh) {
      if (wantsOsBanner(notify[event.kind])) {
        const { body, title } = notificationCopy(event);
        sendOsNotification(title, body).catch(() => undefined);
      }
    }

    const toastable = fresh.filter(
      (event) => wantsToast(notify[event.kind]) && !isOpenOnScreen(route, event)
    );
    const next = toastable.at(0);
    if (next) {
      setToast({ event: next, extra: toastable.length - 1 });
    }
  }, [data]);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const t = window.setTimeout(() => setToast(null), AUTO_DISMISS_MS);
    return () => window.clearTimeout(t);
  }, [toast]);

  const dismiss = useCallback(() => {
    setToast(null);
  }, []);

  const open = useCallback(() => {
    if (!toast) {
      return;
    }
    const { event } = toast;
    setToast(null);
    useNotificationStore.getState().markRead(event.id);
    const store = useAppStore.getState();
    store.markSeen(event.prKey, event.createdAt);
    store.openReview(event.owner, event.name, event.number);
  }, [toast]);

  return { dismiss, open, toast };
}
