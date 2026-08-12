/**
 * Store wiring for the notification list; the view is notification-center,
 * catalogued in @nod/ui.
 *
 * Opening a row is the one place read state is not the reader's explicit
 * choice: going to the PR is the strongest possible signal you have dealt
 * with the notification, so it marks itself read on the way out rather than
 * waiting for a second click on a control nobody looks for.
 *
 * Turning a channel on can be the first time this install has ever wanted an
 * OS banner, so the permission is requested here, on the change, instead of at
 * launch — the prompt then arrives attached to the switch the user just
 * flipped.
 */
import { NotificationCenter } from "@nod/ui/notification-center";
import { useHotkeys } from "../keyboard/use-hotkeys.ts";
import type { NotificationKind } from "../lib/notification-events.ts";
import { ensureOsPermission } from "../lib/os-notification.ts";
import { useAppStore } from "../store/app-store.ts";
import { useNotificationStore } from "../store/notification-store.ts";
import {
  type NotifyChannel,
  useSettingsStore,
  wantsOsBanner,
} from "../store/settings-store.ts";

export function NotificationCenterLoader({
  open,
  onClose,
}: {
  onClose: () => void;
  open: boolean;
}) {
  const events = useNotificationStore((s) => s.events);
  const markAllRead = useNotificationStore((s) => s.markAllRead);
  const markRead = useNotificationStore((s) => s.markRead);
  const notify = useSettingsStore((s) => s.notify);
  const setNotify = useSettingsStore((s) => s.setNotify);

  useHotkeys(
    "notification-center",
    [{ description: "Close", hidden: true, keys: "esc", run: () => onClose() }],
    { enabled: open }
  );

  const onOpenChange = (next: boolean) => {
    if (!next) {
      onClose();
    }
  };

  const onChannelChange = (kind: NotificationKind, channel: NotifyChannel) => {
    setNotify(kind, channel);
    if (wantsOsBanner(channel)) {
      ensureOsPermission().catch(() => undefined);
    }
  };

  const onOpenItem = (id: string) => {
    const event = events.find((e) => e.id === id);
    if (!event) {
      return;
    }
    markRead(id);
    onClose();
    useAppStore.getState().openReview(event.owner, event.name, event.number);
  };

  return (
    <NotificationCenter
      channels={notify}
      items={events.map((e) => ({
        actor: e.actor,
        actorAvatarUrl: e.actorAvatarUrl,
        createdAt: e.createdAt,
        id: e.id,
        kind: e.kind,
        number: e.number,
        read: e.readAt !== null,
        repo: `${e.owner}/${e.name}`,
        title: e.title,
      }))}
      onChannelChange={onChannelChange}
      onMarkAllRead={markAllRead}
      onOpenChange={onOpenChange}
      onOpenItem={onOpenItem}
      open={open}
    />
  );
}
