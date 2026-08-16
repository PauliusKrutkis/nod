/**
 * A suggested review comment — the machine's draft, staged in the diff at
 * its anchor by the chat's propose_comment tool (docs/AI.md § Second
 * surface). Fourth application of the material rule: dotted hairline, no
 * fill, sparkle instead of an avatar, so it can never be mistaken for a
 * posted thread (solid card) or your own pending draft (dashed accent).
 * Deliberately not a `.qf-thread`: the card carries its whole skin so no
 * app rule has to be out-fought, the ask note's approach.
 *
 * Accept adopts it — the host converts it into an ordinary pending comment
 * and from that moment it is indistinguishable from one you typed, by
 * design. Edit hands the body to the normal composer at the same anchor and
 * discards the suggestion; Discard just drops it. `renderMarkdown` is the
 * host's pipeline; the package fallback keeps markup read, never executed.
 */

import { Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { Markdown } from "../markdown/markdown.tsx";
import "./suggested-comment.css";

export interface SuggestedCommentCardProps {
  body: string;
  line: number;
  onAccept: () => void;
  onDiscard: () => void;
  onEdit: () => void;
  renderMarkdown?: (body: string) => ReactNode;
  startLine?: number;
}

export function SuggestedCommentCard({
  body,
  line,
  onAccept,
  onDiscard,
  onEdit,
  renderMarkdown,
  startLine,
}: SuggestedCommentCardProps) {
  return (
    <div className="qf-suggested">
      <div className="qf-suggested-head">
        <Sparkles aria-hidden className="qf-suggested-spark" size={13} />
        <span className="qf-suggested-title">Suggested comment</span>
        <span className="qf-suggested-local">local</span>
        {startLine !== undefined && (
          <span className="qf-suggested-range">
            Lines {startLine}–{line}
          </span>
        )}
      </div>
      <div className="qf-suggested-body">
        {renderMarkdown?.(body) ?? <Markdown>{body}</Markdown>}
      </div>
      <div className="qf-suggested-actions">
        <button
          className="qf-suggested-accept q-focus"
          onClick={onAccept}
          type="button"
        >
          Accept
        </button>
        <button
          className="qf-suggested-act q-focus"
          onClick={onEdit}
          type="button"
        >
          Edit
        </button>
        <button
          className="qf-suggested-act qf-suggested-discard q-focus"
          onClick={onDiscard}
          type="button"
        >
          Discard
        </button>
      </div>
    </div>
  );
}
