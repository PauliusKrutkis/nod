/**
 * The toast slot. Which event is worth interrupting you for, and for how long,
 * is decided by `use-notification-feed`; all that is left here is showing one
 * card and owning the two keys that answer it — Enter opens, Esc dismisses.
 *
 * The hotkey scope is bound to the toast being present, so neither key is
 * claimed while nothing is on screen.
 */
import { ReviewToast } from "@nod/ui/review-toast";
import { useNotificationFeed } from "../hooks/use-notification-feed.ts";
import { useHotkeys } from "../keyboard/use-hotkeys.ts";

export function ReviewNotifier() {
  const { announcement, dismiss, open } = useNotificationFeed();

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
    { enabled: !!announcement }
  );

  if (!announcement) {
    return null;
  }

  return (
    <ReviewToast
      extraCount={announcement.extra}
      kind={
        announcement.event.kind === "authorResponded" ? "response" : "request"
      }
      onDismiss={dismiss}
      onOpen={open}
      request={{
        author: announcement.event.actor,
        authorAvatarUrl: announcement.event.actorAvatarUrl,
        number: announcement.event.number,
        title: announcement.event.title,
      }}
    />
  );
}
