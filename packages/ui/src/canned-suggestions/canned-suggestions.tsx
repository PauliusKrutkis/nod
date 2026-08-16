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
  items: string[];
  onPick: (text: string) => void;
  query: string;
  selected: number;
}

/** The smallest prefix worth completing on: one letter matches too much. */
const MIN_QUERY = 2;

/** How many completions the panel will show before it stops offering. */
const MAX_ITEMS = 6;

/**
 * The saved lines that continue `query`, in the order the reviewer keeps
 * them. A line the reviewer has already typed out in full is dropped: there
 * is nothing left to complete, and offering it would put a panel over the
 * text at the exact moment the line is finished. `minQuery` defaults to the
 * composer's two-letter threshold; a driver with its own opening gesture
 * (the chat's `/` skill picker) passes 0 to offer the whole list at once.
 */
export function matchCanned(
  query: string,
  items: string[],
  minQuery: number = MIN_QUERY
): string[] {
  const typed = query.trimStart();
  if (typed.length < minQuery) {
    return [];
  }
  const needle = typed.toLowerCase();
  const hits: string[] = [];
  for (const item of items) {
    const candidate = item.toLowerCase();
    if (candidate.startsWith(needle) && candidate !== needle) {
      hits.push(item);
    }
    if (hits.length === MAX_ITEMS) {
      break;
    }
  }
  return hits;
}

export function CannedSuggestions({
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

function CannedSuggestionRow({
  text,
  indices,
  selected,
  onPick,
}: {
  indices: number[];
  onPick: (text: string) => void;
  selected: boolean;
  text: string;
}) {
  const pick = () => {
    onPick(text);
  };

  // Mousedown, not click: the composer must not lose the caret to a pick.
  const keepFocus = (e: { preventDefault: () => void }) => {
    e.preventDefault();
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
        {selected && (
          <CornerDownLeft aria-hidden className="qcs-enter" size={12} />
        )}
      </button>
    </div>
  );
}
