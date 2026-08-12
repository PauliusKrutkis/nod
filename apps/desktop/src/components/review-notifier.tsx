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
  const { dismiss, open, toast } = useNotificationFeed();

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
      kind={toast.event.kind === "authorResponded" ? "response" : "request"}
      onDismiss={dismiss}
      onOpen={open}
      request={{
        author: toast.event.actor,
        authorAvatarUrl: toast.event.actorAvatarUrl,
        number: toast.event.number,
        title: toast.event.title,
      }}
    />
  );
}
