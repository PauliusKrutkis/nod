/**
 * User settings, as one persisted blob rather than a key per preference.
 *
 * Everything the app remembered before this lived in its own `nod:*` entry
 * with its own hand-written loader and its own version suffix, which is why
 * there was nowhere to put a setting that had not been invented yet. Adding
 * one here is adding a field to `DEFAULTS`: unknown keys in stored JSON are
 * ignored and missing ones fall back, so an older build reading a newer blob
 * degrades instead of crashing.
 *
 * Notification channels are keyed by the event kind the detectors emit, so a
 * new kind gets a default here and is immediately controllable. The default is
 * `toast` and never `os`: an OS banner needs a permission the user has not
 * been asked for yet, and asking on first launch for something they did not
 * request is the wrong trade.
 */
import { create } from "zustand";
import type { NotificationKind } from "../lib/notification-events.ts";

const SETTINGS_KEY = "nod:settings:v1";

export type NotifyChannel = "off" | "toast" | "os" | "both";

const CHANNELS: readonly NotifyChannel[] = ["off", "toast", "os", "both"];

export interface Settings {
  notify: Record<NotificationKind, NotifyChannel>;
}

const DEFAULTS: Settings = {
  notify: { authorResponded: "toast", reviewRequested: "toast" },
};

function asChannel(v: unknown, fallback: NotifyChannel): NotifyChannel {
  return CHANNELS.includes(v as NotifyChannel)
    ? (v as NotifyChannel)
    : fallback;
}

function loadSettings(): Settings {
  try {
    const v = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null");
    const notify = v?.notify ?? {};
    return {
      notify: {
        authorResponded: asChannel(
          notify.authorResponded,
          DEFAULTS.notify.authorResponded
        ),
        reviewRequested: asChannel(
          notify.reviewRequested,
          DEFAULTS.notify.reviewRequested
        ),
      },
    };
  } catch {
    return DEFAULTS;
  }
}

function saveSettings(settings: Settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* ignore quota / private-mode errors */
  }
}

interface SettingsState extends Settings {
  setNotify: (kind: NotificationKind, channel: NotifyChannel) => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...loadSettings(),
  setNotify: (kind, channel) => {
    const notify = { ...get().notify, [kind]: channel };
    set({ notify });
    saveSettings({ notify });
  },
}));

export function wantsToast(channel: NotifyChannel): boolean {
  return channel === "toast" || channel === "both";
}

export function wantsOsBanner(channel: NotifyChannel): boolean {
  return channel === "os" || channel === "both";
}
