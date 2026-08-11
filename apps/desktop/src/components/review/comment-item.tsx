/**
 * The comment body shared by both comment surfaces — inline threads
 * (comment-thread.tsx) and the drawer conversation (right-panel.tsx) — so the
 * markdown and the edit affordance cannot drift apart. The surfaces keep their
 * own layout; what they share is this body, which swaps into the composer
 * while editing. The tool strip beside it is @nod/ui/comment-tools.
 *
 * This stays app-side because Markdown does: it opens links through Tauri,
 * resolves attachment URLs through the API, and renders with the remark/rehype
 * stack — none of which belongs behind the package boundary.
 */

import { Markdown } from "../markdown-loader.tsx";
import { AddCommentBox } from "./add-comment-box.tsx";

interface CommentBodyProps {
  body: string;
  editing: boolean;
  onCancelEdit: () => void;
  onSubmitEdit: (body: string) => void;
  owner?: string;
  repo?: string;
}

/** Markdown body, or the composer prefilled with it while editing. */
export function CommentBody({
  body,
  editing,
  onCancelEdit,
  onSubmitEdit,
  owner,
  repo,
}: CommentBodyProps) {
  if (editing) {
    return (
      <AddCommentBox
        autoFocus
        initialMarkdown={body}
        onCancel={onCancelEdit}
        onSubmit={onSubmitEdit}
        pending={false}
        placeholder="Edit your comment…"
        submitLabel="Save"
      />
    );
  }
  const trimmed = body.trim();
  if (!trimmed) {
    return null;
  }
  return (
    <div className="qf-comment-body">
      <Markdown owner={owner} repo={repo}>
        {trimmed}
      </Markdown>
    </div>
  );
}
