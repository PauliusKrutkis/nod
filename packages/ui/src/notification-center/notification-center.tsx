/**
 * The notification list: what the app interrupted you for, newest first, plus
 * the two dials that decide whether it may do so again.
 *
 * Settings sit on top of the list rather than in a separate preferences screen
 * because this is where you are when you form an opinion about them — the
 * moment a banner annoys you is the moment you want the switch, and a channel
 * you cannot find is a channel you turn off by uninstalling.
 *
 * Read state is the host's to keep; this view only reports which rows were
 * unread when it opened. Nothing here removes an item, because forgetting an
 * event is what lets the next poll announce it again — the host's log is
 * bounded history, not a queue that drains.
 *
 * `NotificationItem` is the package's own shape, structurally satisfied by the
 * app's richer stored event. Timestamps render as absolute dates rather than
 * "2h ago" so a capture of this panel is the same picture tomorrow.
 */
import { Bell, CheckCheck, X } from "lucide-react";
import { Avatar } from "../avatar/avatar.tsx";
import { cn } from "../cn/cn.ts";
import { useModalDialog } from "../use-modal-dialog/use-modal-dialog.ts";
import "./notification-center.css";

export type NotificationItemKind = "reviewRequested" | "authorResponded";

export type NotifyChannel = "off" | "toast" | "os" | "both";

export interface NotificationItem {
  actor: string;
  actorAvatarUrl?: string | null;
  createdAt: string;
  id: string;
  kind: NotificationItemKind;
  number: number;
  read: boolean;
  repo: string;
  title: string;
}

const KIND_LABEL: Record<NotificationItemKind, string> = {
  authorResponded: "Author replied",
  reviewRequested: "Review requested",
};

const CHANNELS: readonly { label: string; value: NotifyChannel }[] = [
  { label: "Off", value: "off" },
  { label: "In app", value: "toast" },
  { label: "System", value: "os" },
  { label: "Both", value: "both" },
];

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return "";
  }
  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function NotificationCenter({
  open,
  onOpenChange,
  items,
  channels,
  onChannelChange,
  onOpenItem,
  onMarkAllRead,
  closeArmed = false,
  inline = false,
}: {
  channels: Record<NotificationItemKind, NotifyChannel>;
  closeArmed?: boolean;
  inline?: boolean;
  items: readonly NotificationItem[];
  onChannelChange: (kind: NotificationItemKind, channel: NotifyChannel) => void;
  onMarkAllRead: () => void;
  onOpenChange: (v: boolean) => void;
  onOpenItem: (id: string) => void;
  open: boolean;
}) {
  if (!open) {
    return null;
  }
  return (
    <NotificationCenterContent
      channels={channels}
      closeArmed={closeArmed}
      inline={inline}
      items={items}
      onChannelChange={onChannelChange}
      onMarkAllRead={onMarkAllRead}
      onOpenChange={onOpenChange}
      onOpenItem={onOpenItem}
    />
  );
}

function NotificationCenterContent({
  onOpenChange,
  items,
  channels,
  onChannelChange,
  onOpenItem,
  onMarkAllRead,
  closeArmed,
  inline,
}: {
  channels: Record<NotificationItemKind, NotifyChannel>;
  closeArmed: boolean;
  inline: boolean;
  items: readonly NotificationItem[];
  onChannelChange: (kind: NotificationItemKind, channel: NotifyChannel) => void;
  onMarkAllRead: () => void;
  onOpenChange: (v: boolean) => void;
  onOpenItem: (id: string) => void;
}) {
  const { dialogRef, onDialogCancel, onDialogClose } = useModalDialog(
    () => {
      onOpenChange(false);
    },
    undefined,
    { modal: !inline }
  );
  const unread = items.filter((i) => !i.read).length;

  const close = () => {
    onOpenChange(false);
  };

  return (
    <dialog
      aria-label="Notifications"
      className={cn("q-dialog q-dialog-top qnc-panel", inline && "qnc-inline")}
      onCancel={onDialogCancel}
      onClose={onDialogClose}
      ref={dialogRef}
    >
      <header className="qnc-head">
        <h2 className="qnc-title">
          <Bell aria-hidden size={14} />
          Notifications
          {unread > 0 && <span className="qnc-badge">{unread}</span>}
        </h2>
        <div className="qnc-head-actions">
          <button
            className="qnc-read-all"
            disabled={unread === 0}
            onClick={onMarkAllRead}
            tabIndex={-1}
            type="button"
          >
            <CheckCheck aria-hidden size={13} />
            Mark all read
          </button>
          <button
            aria-label="Close"
            className="qnc-close"
            data-armed={closeArmed}
            onClick={close}
            tabIndex={-1}
            type="button"
          >
            <X aria-hidden size={16} />
          </button>
        </div>
      </header>

      <div className="qnc-settings">
        {(Object.keys(KIND_LABEL) as NotificationItemKind[]).map((kind) => (
          <div className="qnc-setting" key={kind}>
            <span className="qnc-setting-label">{KIND_LABEL[kind]}</span>
            <fieldset className="qnc-choices">
              <legend className="qnc-legend">
                {KIND_LABEL[kind]} notifications
              </legend>
              {CHANNELS.map((choice) => (
                <label className="qnc-choice" key={choice.value}>
                  <input
                    checked={channels[kind] === choice.value}
                    className="qnc-choice-input"
                    name={`notify-${kind}`}
                    onChange={() => onChannelChange(kind, choice.value)}
                    type="radio"
                    value={choice.value}
                  />
                  {choice.label}
                </label>
              ))}
            </fieldset>
          </div>
        ))}
      </div>

      <div className="qnc-list">
        {items.length === 0 ? (
          <p className="qnc-empty">
            Nothing yet. Review requests and replies to your reviews land here.
          </p>
        ) : (
          items.map((item) => (
            <button
              className={cn("qnc-item", !item.read && "qnc-item-unread")}
              key={item.id}
              onClick={() => onOpenItem(item.id)}
              tabIndex={-1}
              type="button"
            >
              <span aria-hidden className="qnc-dot" />
              <Avatar name={item.actor} size={26} url={item.actorAvatarUrl} />
              <span className="qnc-item-body">
                <span className="qnc-item-head">
                  <span className="qnc-kind">{KIND_LABEL[item.kind]}</span>
                  <span className="qnc-when">{formatWhen(item.createdAt)}</span>
                </span>
                <span className="qnc-item-text">
                  <b>{item.actor}</b> ·{" "}
                  <span className="q-mono qnc-num">#{item.number}</span>{" "}
                  {item.title}
                </span>
                <span className="qnc-repo">{item.repo}</span>
              </span>
            </button>
          ))
        )}
      </div>
    </dialog>
  );
}
