/**
 * One comment inside an inline code thread: a head (avatar, author, time and
 * the own-comment tool strip) above the body. The drawer's conversation row
 * lays its head out differently — avatar outside the column, a verdict chip
 * beside the name — so what the two surfaces share is CommentBody, exported
 * beside the row rather than folded into it.
 *
 * `renderMarkdown` is the body's host seam. Every host rewrites comment
 * source before it renders — the desktop strips GitLab's kramdown attribute
 * lists, opens links through Tauri and pulls authenticated uploads through
 * its API — so a host passes its own renderer and the component stays a
 * layout. Omit it and the package's Markdown renders the string, which is
 * what every fixture does. A body that trims to nothing renders nothing: an
 * edit that clears the text must leave the head, not an empty box.
 *
 * `composer` replaces the body while the surface is editing this comment. It
 * is a slot because the composer is a rich text editor the package does not
 * own, and `tools` is how a surface hides the whole strip while any composer
 * is open — the Edit/Delete hotkeys are inert while a text field has focus,
 * so showing them would advertise dead shortcuts.
 *
 * The strip is invisible at rest in the app; the surfaces reveal it on hover
 * and focus-within from their own stylesheet, since the ancestor doing the
 * revealing (a thread, a drawer row) lives there.
 */

import type { ReactNode } from "react";
import { Avatar } from "../avatar/avatar.tsx";
import { cn } from "../cn/cn.ts";
import { CommentTools } from "../comment-tools/comment-tools.tsx";
import { Markdown } from "../markdown/markdown.tsx";
import { formatAbsolute, formatRelativeTime } from "../time/time.ts";
import "./comment-item.css";

export interface CommentBodyProps {
  body: string;
  renderMarkdown?: (body: string) => ReactNode;
}

export function CommentBody({ body, renderMarkdown }: CommentBodyProps) {
  const trimmed = body.trim();
  if (!trimmed) {
    return null;
  }
  return (
    <div className="qf-comment-body">
      {renderMarkdown ? (
        renderMarkdown(trimmed)
      ) : (
        <Markdown>{trimmed}</Markdown>
      )}
    </div>
  );
}

export interface CommentItemProps {
  body: string;
  composer?: ReactNode;
  confirmDelete?: boolean;
  /** Absent on a comment that has not been sent — an unsent draft has no
   *  posted time, and the pending tag stands where the timestamp would. */
  createdAt?: string;
  deleteKbd?: string;
  deleteLabel?: string;
  editKbd?: string;
  /** Marks the draft as written by the chat rather than typed. */
  onDelete?: () => void;
  onPostNow?: () => void;
  onStartEdit?: () => void;
  /** "Pending" or "Suggested" — shown in place of the timestamp. */
  pendingLabel?: string;
  renderMarkdown?: (body: string) => ReactNode;
  reply?: boolean;
  tools?: boolean;
  user: string;
  userAvatarUrl?: string;
}

export function CommentItem({
  body,
  composer,
  confirmDelete,
  createdAt,
  deleteKbd,
  deleteLabel,
  editKbd,
  onDelete,
  onPostNow,
  onStartEdit,
  pendingLabel,
  renderMarkdown,
  reply = false,
  tools = true,
  user,
  userAvatarUrl,
}: CommentItemProps) {
  return (
    <div className={cn("qf-comment", reply && "qf-comment-reply")}>
      <div className="qf-comment-head">
        <Avatar name={user} size={20} url={userAvatarUrl} />
        <span className="qf-comment-author">{user}</span>
        {pendingLabel === undefined ? (
          <span
            className="qf-comment-time"
            title={createdAt ? formatAbsolute(createdAt) : undefined}
          >
            {createdAt ? formatRelativeTime(createdAt) : ""}
          </span>
        ) : (
          <span className="qf-pending-tag">{pendingLabel}</span>
        )}
        {!!tools && (
          <CommentTools
            body={body}
            confirmDelete={confirmDelete}
            deleteKbd={deleteKbd}
            deleteLabel={deleteLabel}
            editKbd={editKbd}
            onDelete={onDelete}
            onPostNow={onPostNow}
            onStartEdit={onStartEdit}
          />
        )}
      </div>
      {composer ?? <CommentBody body={body} renderMarkdown={renderMarkdown} />}
    </div>
  );
}
