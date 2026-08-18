/**
 * The canned-comment completions offered under a composer: the saved lines
 * whose opening the reviewer has already typed. It renders the list and
 * nothing else — which line is highlighted, what was typed and what happens
 * on a pick all belong to the composer driving it, so this stays a pure
 * function of its props and can be shot at every state without an editor.
 *
 * The panel anchors to the composer's surface rather than to the caret. A
 * canned comment is a whole sentence, so a caret-anchored popup would spend
 * most of its life clipped against the right edge of a narrow diff column;
 * anchoring to the surface gives every row the full width it needs and keeps
 * the geometry independent of where in the line the caret sits.
 *
 * The panel is not a focus stop and carries no role: focus never leaves the
 * editor, so there is no element for aria-activedescendant to point at from
 * here, and a listbox would promise a keyboard contract the rows cannot
 * honour. Each row is a button carrying its own text, which is the whole
 * accessible name it needs — driven by ↑↓ from the caret for everyone else.
 *
 * `query` is the text already typed, not a separate search term: it is always
 * a prefix of every item (matchCanned guarantees it), so highlighting the
 * first `query.length` characters marks exactly the part the reviewer does
 * not have to type again.
 */
import { CornerDownLeft } from "lucide-react";
import { HighlightIndices } from "../highlight-indices/highlight-indices.tsx";
import "./canned-suggestions.css";

export interface CannedSuggestionsProps {
  /** One line about each item, keyed by the item itself. A skill's
   *  description says what it does; a canned comment is its own description
   *  and passes none. */
  hints?: Record<string, string>;
  items: string[];
  onPick: (text: string) => void;
  query: string;
  selected: number;
}

export function CannedSuggestions({
  hints,
  items,
  selected,
  query,
  onPick,
}: CannedSuggestionsProps) {
  if (items.length === 0) {
    return null;
  }
  const typed = query.trimStart().length;
  const indices = Array.from({ length: typed }, (_, i) => i);

  return (
    <div className="qcs-panel">
      {items.map((text, i) => (
        <CannedSuggestionRow
          hint={hints?.[text]}
          indices={indices}
          key={text}
          onPick={onPick}
          selected={i === selected}
          text={text}
        />
      ))}
    </div>
  );
}

/** Mousedown, not click: the composer must not lose the caret to a pick. */
function keepFocus(e: { preventDefault: () => void }) {
  e.preventDefault();
}

function CannedSuggestionRow({
  hint,
  text,
  indices,
  selected,
  onPick,
}: {
  hint?: string;
  indices: number[];
  onPick: (text: string) => void;
  selected: boolean;
  text: string;
}) {
  const pick = () => {
    onPick(text);
  };

  return (
    <div className="qcs-row" data-selected={selected}>
      <button
        aria-current={selected}
        className="qcs-pick"
        onClick={pick}
        onMouseDown={keepFocus}
        tabIndex={-1}
        type="button"
      >
        <span className="qcs-text">
          <HighlightIndices indices={indices} text={text} />
        </span>
        {hint !== undefined && hint !== "" && (
          <span className="qcs-hint">{hint}</span>
        )}
        {selected && (
          <CornerDownLeft aria-hidden className="qcs-enter" size={12} />
        )}
      </button>
    </div>
  );
}
