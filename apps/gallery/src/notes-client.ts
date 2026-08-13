/**
 * Browser side of the note store. The gallery has no disk access, so every
 * read and write goes through the dev server's /__notes middleware
 * (notes/plugin.ts) and the response is always the component's whole note
 * file — the client never reconstructs what disk already decided.
 *
 * A failed request returns its message rather than throwing: the composer
 * shows it in place, because the two realistic failures (the component is not
 * catalogued, the note is empty) are both things the author can fix by
 * reading the message.
 */
import {
  emptyNotes,
  type NoteScope,
  type NotesFile,
  parseNotes,
} from "./notes.ts";

export type NotesByComponent = Record<string, NotesFile>;

export interface NotesResult {
  file: NotesFile;
  error: string;
}

const ROUTE = "/__notes";

export async function fetchAllNotes(): Promise<NotesByComponent> {
  try {
    const res = await fetch(ROUTE);
    if (!res.ok) {
      return {};
    }
    const raw = (await res.json()) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(raw).map(([component, file]) => [
        component,
        parseNotes(file),
      ])
    );
  } catch {
    return {};
  }
}

export async function postNote(
  component: string,
  draft: { note: string; scope: NoteScope; cell: string }
): Promise<NotesResult> {
  return await send(`${ROUTE}/${component}`, {
    body: JSON.stringify(draft),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
}

export async function removeNote(
  component: string,
  id: string
): Promise<NotesResult> {
  return await send(`${ROUTE}/${component}/${id}`, { method: "DELETE" });
}

async function send(url: string, init: RequestInit): Promise<NotesResult> {
  try {
    const res = await fetch(url, init);
    const raw = (await res.json()) as { error?: string };
    if (!res.ok) {
      return {
        error: raw.error ?? "The note could not be saved.",
        file: emptyNotes(),
      };
    }
    return { error: "", file: parseNotes(raw) };
  } catch {
    return {
      error: "The gallery dev server is not answering. Is it still running?",
      file: emptyNotes(),
    };
  }
}
