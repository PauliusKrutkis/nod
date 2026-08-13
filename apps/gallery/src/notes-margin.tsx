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
 * The composer submits with the button or mod+Enter, and Escape hands focus
 * back to the gallery so the single-key routing works again. The caller keys
 * this component by component name: a half-written draft belongs to the
 * component it was written against, and carrying it across a j/k press would
 * file it under whatever you landed on.
 */
import { useState } from "react";
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
  onAdd: (draft: { note: string; scope: NoteScope; cell: string }) => void;
  onRemove: (id: string) => void;
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
  onAdd,
  onRemove,
}: NotesMarginProps) {
  const [draft, setDraft] = useState("");
  const [scope, setScope] = useState<NoteScope>("component");

  const submit = () => {
    if (!draft.trim()) {
      return;
    }
    onAdd({ cell, note: draft.trim(), scope });
    setDraft("");
  };

  return (
    <aside className="qg-margin">
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
          submit();
        }}
      >
        <textarea
          aria-label={`Note on ${component}`}
          onChange={(event) => {
            setDraft(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.currentTarget.blur();
            }
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              submit();
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
                  setScope(option);
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
        <p className="qg-compose-hint">{cell}</p>
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
