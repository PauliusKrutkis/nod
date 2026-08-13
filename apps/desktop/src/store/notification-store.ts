/**
 * The notification log: what has been announced, what you have read, and which
 * one is being announced right now.
 *
 * `ingest` is the only way in and the only place repeats die. Detectors report
 * everything currently true on each poll (see `lib/notification-events.ts`),
 * so the log filters that against the ids it already holds and returns just
 * the newcomers. Sinks fire from that return value, which is why a toast and
 * an OS banner cannot disagree about what is new, and why a restart re-reads
 * the same poll in silence.
 *
 * First run seeds instead of announcing: a fresh install faces a full inbox,
 * and twenty banners is not a welcome. Those events are still recorded, marked
 * read, so the list opens showing where you actually stand rather than empty.
 *
 * The log is capped at `MAX_EVENTS`, and the cap is the one place repeats can
 * leak: an event evicted while its condition is still true would announce a
 * second time. That needs a standing backlog of two hundred unread events to
 * reach, which is a different problem than this one.
 *
 * `announcement` is the live one — which event is currently interrupting you,
 * and how many others arrived with it. It is transient and never persisted:
 * an interruption you were not present for is not owed to you on next launch,
 * and the log already kept the events themselves. It lives here rather than in
 * component state so the notifier stays a view with no state of its own, and
 * because the sinks and the card then read one runtime instead of two.
 *
 * There is no "clear", only "mark all read", and that is a correctness point
 * rather than a missing feature: forgetting an id is exactly what makes the
 * next poll announce it again, so a clear button would fire the whole list
 * back at you seconds after you emptied it. The log is bounded history; read
 * state is what the reader is allowed to change.
 */
import { create } from "zustand";
import type { NotificationEvent } from "../lib/notification-events.ts";

const LOG_KEY = "nod:notifications:v1";
const MAX_EVENTS = 200;

export interface StoredNotification extends NotificationEvent {
  readAt: string | null;
}

interface PersistedLog {
  events: StoredNotification[];
  seeded: boolean;
}

function isStored(v: unknown): v is StoredNotification {
  const e = v as StoredNotification;
  return (
    !!e &&
    typeof e.id === "string" &&
    typeof e.prKey === "string" &&
    typeof e.createdAt === "string"
  );
}

function loadLog(): PersistedLog {
  try {
    const v = JSON.parse(localStorage.getItem(LOG_KEY) ?? "null");
    if (!v || typeof v !== "object" || !Array.isArray(v.events)) {
      return { events: [], seeded: false };
    }
    return { events: v.events.filter(isStored), seeded: v.seeded === true };
  } catch {
    return { events: [], seeded: false };
  }
}

function saveLog(log: PersistedLog) {
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify(log));
  } catch {
    /* ignore quota / private-mode errors */
  }
}

function newestFirst(events: StoredNotification[]): StoredNotification[] {
  return [...events]
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
    .slice(0, MAX_EVENTS);
}

interface Announcement {
  event: StoredNotification;
  extra: number;
}

interface NotificationState {
  announcement: Announcement | null;
  events: StoredNotification[];
  ingest: (detected: NotificationEvent[]) => StoredNotification[];
  markAllRead: () => void;
  markRead: (id: string) => void;
  seeded: boolean;
  setAnnouncement: (announcement: Announcement | null) => void;
  unreadCount: () => number;
}

const initial = loadLog();

export const useNotificationStore = create<NotificationState>((set, get) => ({
  announcement: null,
  events: initial.events,
  ingest: (detected) => {
    const { events, seeded } = get();
    const known = new Set(events.map((e) => e.id));
    const fresh = detected.filter((e) => !known.has(e.id));
    if (fresh.length === 0) {
      if (!seeded) {
        set({ seeded: true });
        saveLog({ events, seeded: true });
      }
      return [];
    }
    const readAt = seeded ? null : new Date().toISOString();
    const stored = fresh.map((e) => ({ ...e, readAt }));
    const next = newestFirst([...stored, ...events]);
    set({ events: next, seeded: true });
    saveLog({ events: next, seeded: true });
    return seeded ? stored : [];
  },
  markAllRead: () => {
    const now = new Date().toISOString();
    const next = get().events.map((e) =>
      e.readAt ? e : { ...e, readAt: now }
    );
    set({ events: next });
    saveLog({ events: next, seeded: get().seeded });
  },
  markRead: (id) => {
    const now = new Date().toISOString();
    const next = get().events.map((e) =>
      e.id === id && !e.readAt ? { ...e, readAt: now } : e
    );
    set({ events: next });
    saveLog({ events: next, seeded: get().seeded });
  },
  seeded: initial.seeded,
  setAnnouncement: (announcement) => set({ announcement }),
  unreadCount: () => get().events.filter((e) => !e.readAt).length,
}));
