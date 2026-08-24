/**
 * The notes margin: a right-hand column mirroring the component rail, opened
 * with `c`. Notes sit in the margin and never over the print — partly because
 * that is how you annotate a mounted photograph, and partly because the
 * capture frame's ancestor chain is untouchable (a positioned wrapper around
 * the slot re-anchors absolutely positioned specimens and shifts ~90
 * baselines). The margin is a sibling of the whole workspace, so it cannot
 * reach into the frame even by accident.
 *
 * The region remaps --accent to --warn, which is the one warm hue in an
 * otherwise cold palette and already means "a person supplied this" on the
 * frame's provenance caption. Violet is the system talking; amber is a human
 * mark. Everything inside — the note rules, the scope control, the focus ring
 * inherited from .q-focus — resolves through that one override rather than
 * hardcoding a second accent.
 *
 * Type carries the same split: gallery metadata is mono because a machine
 * wrote it, and note bodies are the UI face because a person did.
 *
 * The draft and the scope are the caller's state, not this component's: `c`
 * closes and reopens the margin constantly, and a note half-written when you
 * glance at another cell has to survive that. The caller also keeps drafts
 * per component, so a draft can never be filed under whatever you landed on
 * after a j/k press.
 *
 * Keys reach the composer while you are typing in it, which is why the scope
 * toggle is a chord here (mod+S) and a bare `s` outside — a single letter in
 * a textarea belongs to the text. mod+Enter submits, Escape closes.
 */
import { useEdgeResize } from "@nod/ui/use-edge-resize";
import { useRef } from "react";
import {
  NOTE_SCOPES,
  type Note,
  type NoteScope,
  type NotesFile,
} from "./notes.ts";

interface NotesMarginProps {
  component: string;
  cell: string;
  file: NotesFile;
  error: string;
  draft: string;
  scope: NoteScope;
  onDraftChange: (text: string) => void;
  onScopeChange: (scope: NoteScope) => void;
  onSubmit: () => void;
  onClose: () => void;
  onRemove: (id: string) => void;
  onResize: (width: number) => void;
  width: number;
}

const SCOPE_LABELS: Record<NoteScope, string> = {
  cell: "This cell",
  component: "Component",
};

export function NotesMargin({
  component,
  cell,
  file,
  error,
  draft,
  scope,
  onDraftChange,
  onScopeChange,
  onSubmit,
  onClose,
  onRemove,
  onResize,
  width,
}: NotesMarginProps) {
  const otherScope = scope === "component" ? "cell" : "component";
  const panelRef = useRef<HTMLElement>(null);
  // The same drag the review screen's columns use, so the gallery's panels
  // feel like the app's rather than like a second implementation.
  const startResize = useEdgeResize({
    edge: "left",
    maxFraction: 0.5,
    min: 240,
    onResize,
    panelRef,
  });

  return (
    <aside className="qg-margin" ref={panelRef} style={{ width }}>
      <div
        aria-hidden
        className="qg-margin-resize"
        onPointerDown={startResize}
      />
      <div className="qg-margin-head">
        <span className="qg-margin-title">Notes</span>
        <span className="qg-margin-on">{component}</span>
      </div>

      <div className="qg-margin-list">
        {file.open.length === 0 ? (
          <p className="qg-margin-empty">
            Nothing noted here yet. Write what should change — the agent picks
            these up as one batch.
          </p>
        ) : (
          file.open.map((note) => (
            <NoteCard key={note.id} note={note} onRemove={onRemove} />
          ))
        )}

        {file.decided.length > 0 ? (
          <section className="qg-decided">
            <h2>Decided</h2>
            {file.decided.map((entry) => (
              <p key={entry.note}>
                {entry.note}
                <span className="qg-decided-why">{entry.why}</span>
              </p>
            ))}
          </section>
        ) : null}
      </div>

      <form
        className="qg-compose"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <textarea
          aria-label={`Note on ${component}`}
          onChange={(event) => {
            onDraftChange(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              onClose();
              return;
            }
            if (!(event.metaKey || event.ctrlKey)) {
              return;
            }
            if (event.key === "Enter") {
              event.preventDefault();
              onSubmit();
            }
            if (event.key.toLowerCase() === "s") {
              event.preventDefault();
              onScopeChange(otherScope);
            }
          }}
          placeholder="What should change?"
          rows={3}
          value={draft}
        />
        {error ? <p className="qg-compose-error">{error}</p> : null}
        <div className="qg-compose-row">
          <div className="qg-seg">
            {NOTE_SCOPES.map((option) => (
              <button
                className={`q-focus ${option === scope ? "qg-on" : ""}`}
                key={option}
                onClick={() => {
                  onScopeChange(option);
                }}
                type="button"
              >
                {SCOPE_LABELS[option]}
              </button>
            ))}
          </div>
          <button className="qg-compose-save q-focus" type="submit">
            Leave note
          </button>
        </div>
        <div className="qg-compose-hint">
          <span className="qg-compose-cell" title={cell}>
            {cell}
          </span>
        </div>
      </form>
    </aside>
  );
}

function NoteCard({
  note,
  onRemove,
}: {
  note: Note;
  onRemove: (id: string) => void;
}) {
  return (
    <article className={`qg-note-card qg-scope-${note.scope}`}>
      <p className="qg-note-text">{note.note}</p>
      <div className="qg-note-stamp">
        <span className="qg-note-where" title={note.cell}>
          {note.scope === "cell" ? `only ${note.cell}` : note.cell}
        </span>
        <span className="qg-note-date">{note.added}</span>
        <button
          className="qg-note-remove q-focus"
          onClick={() => {
            onRemove(note.id);
          }}
          type="button"
        >
          Remove
        </button>
      </div>
    </article>
  );
}
