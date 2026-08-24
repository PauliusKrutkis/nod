/**
 * The note file format, pure and platform-free: the browser composer, the
 * dev-server middleware and the digest CLI all reshape notes through these
 * functions, so the on-disk shape has exactly one definition.
 *
 * A note anchors to the gallery route it was written from rather than to a
 * DOM node in the component's source. The route is already the catalog's
 * canonical address (route.ts), it survives any rewrite that keeps the
 * component and fixture named the same, and it keeps annotation metadata out
 * of the published component source — where a marker would sit inside the
 * very file the fix rewrites.
 *
 * `scope` is the field that earns the route anchor: `component` means the
 * note applies wherever the component renders and `cell` pins it to the one
 * capture. `cell` records where the author was standing either way, so a
 * component-scoped note still names a place to look.
 *
 * `decided` is the standing record — choices already made and not to be
 * re-proposed. Resolved notes are deleted rather than flagged: git holds the
 * history, and a resolved pile would cost the agent context on every read.
 *
 * `hidden` parks a component out of the gallery rail — deprecated, superseded,
 * or just noise someone does not want to scroll past. It rides in the note
 * file because it is the same kind of judgement: durable, per-component, and
 * reviewable in the diff that made it. Its safety comes from how narrow it is:
 * hiding changes what the rail lists and nothing else. The catalog still
 * counts the component, the screenshot suite still captures it, and the
 * coverage ratchet still measures it, so nothing can be quietly dropped from
 * the checks by hiding it. Absent means visible, and only the literal `true`
 * hides — a hand-typed `"false"` reads as visible rather than flipping to its
 * opposite.
 *
 * parseNotes is deliberately forgiving because these files are meant to be
 * hand-editable: anything unreadable degrades to an empty file instead of
 * throwing, so one malformed note cannot take the gallery down.
 */
export const NOTE_SCOPES = ["component", "cell"] as const;

const ID_PREFIX = /^n/;

export type NoteScope = (typeof NOTE_SCOPES)[number];

export interface Note {
  id: string;
  note: string;
  scope: NoteScope;
  cell: string;
  added: string;
}

interface Decision {
  note: string;
  why: string;
}

export interface NotesFile {
  open: Note[];
  decided: Decision[];
  hidden?: boolean;
}

export interface NoteDraft {
  note: string;
  scope: NoteScope;
  cell: string;
  added: string;
}

export function notesFileName(component: string): string {
  return `${component}.notes.json`;
}

export function emptyNotes(): NotesFile {
  return { decided: [], open: [] };
}

export function nextNoteId(file: NotesFile): string {
  const used = file.open.map((note) => Number(note.id.replace(ID_PREFIX, "")));
  const highest = used.reduce(
    (top, value) => (Number.isFinite(value) && value > top ? value : top),
    0
  );
  return `n${highest + 1}`;
}

export function addNote(file: NotesFile, draft: NoteDraft): NotesFile {
  const note: Note = {
    added: draft.added,
    cell: draft.cell,
    id: nextNoteId(file),
    note: draft.note,
    scope: draft.scope,
  };
  return { ...file, open: [...file.open, note] };
}

export function resolveNote(file: NotesFile, id: string): NotesFile {
  return { ...file, open: file.open.filter((note) => note.id !== id) };
}

export function isHidden(file: NotesFile | undefined): boolean {
  return file?.hidden === true;
}

/**
 * Hiding is stored as the flag's presence, so a visible component's file never
 * carries a line saying so and unhiding leaves nothing behind.
 */
export function withHidden(file: NotesFile, hidden: boolean): NotesFile {
  if (hidden) {
    return { ...file, hidden: true };
  }
  const { hidden: _visible, ...rest } = file;
  return rest;
}

/**
 * Empty means the file has nothing worth keeping on disk. A hidden component
 * counts as content even with no notes: the flag is the file's whole reason to
 * exist, and deleting it would unhide the component on the next write.
 */
export function isEmptyNotes(file: NotesFile): boolean {
  return file.open.length === 0 && file.decided.length === 0 && !isHidden(file);
}

/**
 * The route as a note anchor: the capture cell without the view mode, which
 * changes what you are looking through rather than what you are looking at.
 */
export function cellAnchor(route: {
  component: string;
  fixture: string;
  theme: string;
  width: number;
}): string {
  const width = route.width === 0 ? "fluid" : String(route.width);
  return `${route.component}/${route.fixture}/${route.theme}/${width}`;
}

export function parseNotes(raw: unknown): NotesFile {
  if (typeof raw !== "object" || raw === null) {
    return emptyNotes();
  }
  const source = raw as Partial<Record<keyof NotesFile, unknown>>;
  return withHidden(
    {
      decided: asArray(source.decided).flatMap(parseDecision),
      open: asArray(source.open).flatMap(parseNote),
    },
    source.hidden === true
  );
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseNote(raw: unknown, index: number): Note[] {
  if (typeof raw !== "object" || raw === null) {
    return [];
  }
  const source = raw as Record<string, unknown>;
  const note = asText(source.note);
  if (!note) {
    return [];
  }
  const scope = source.scope;
  return [
    {
      added: asText(source.added),
      cell: asText(source.cell),
      id: asText(source.id) || `n${index + 1}`,
      note,
      scope: isScope(scope) ? scope : "component",
    },
  ];
}

function parseDecision(raw: unknown): Decision[] {
  if (typeof raw !== "object" || raw === null) {
    return [];
  }
  const source = raw as Record<string, unknown>;
  const note = asText(source.note);
  return note ? [{ note, why: asText(source.why) }] : [];
}

function isScope(value: unknown): value is NoteScope {
  return NOTE_SCOPES.includes(value as NoteScope);
}
