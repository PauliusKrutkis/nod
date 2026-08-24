/**
 * The dev server's write path for notes: the gallery runs in a browser with
 * no disk access, so the composer posts here and this middleware is what
 * actually edits packages/ui. It is `apply: "serve"` — the gallery is never
 * built or deployed, and nothing in this file should ever reach a bundle.
 *
 * The component name arrives from the client and becomes a path, so
 * isCatalogued() both authorises the write and constrains the name to the
 * catalog's own charset before it is joined onto a directory.
 *
 * Every response is the component's full note file, so the client never
 * reconstructs state the disk already decided.
 *
 * The two-segment paths are told apart by method rather than by shape:
 * `POST /<component>/hidden` sets the rail flag and `DELETE /<component>/<id>`
 * resolves a note. Note ids are generated as n1, n2, … so nothing addressable
 * by the delete route is ever named "hidden".
 */
import type { Plugin } from "vite";
import {
  addNote,
  NOTE_SCOPES,
  type NoteScope,
  resolveNote,
  withHidden,
} from "../src/notes.ts";
import { isCatalogued, listNotes, readNotes, writeNotes } from "./store.ts";

const ROUTE = "/__notes";

interface DraftBody {
  note?: unknown;
  scope?: unknown;
  cell?: unknown;
}

interface HiddenBody {
  hidden?: unknown;
}

const HIDDEN_SEGMENT = "hidden";

export function galleryNotes(): Plugin {
  return {
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(ROUTE, (req, res, next) => {
        const path = (req.url ?? "/").split("?")[0] ?? "/";
        handle(req.method ?? "GET", path, req)
          .then((body) => {
            if (body === null) {
              next();
              return;
            }
            send(res, body.status, body.payload);
          })
          .catch(() => {
            send(res, 500, { error: "The note could not be written." });
          });
      });
    },
    name: "gallery-notes",
  };
}

interface Reply {
  status: number;
  payload: unknown;
}

async function handle(
  method: string,
  path: string,
  req: NodeJS.ReadableStream
): Promise<Reply | null> {
  if (method === "GET" && path === "/") {
    return {
      payload: Object.fromEntries(
        listNotes().map((entry) => [entry.component, entry.file])
      ),
      status: 200,
    };
  }
  const segments = path.split("/").filter(Boolean);
  const component = segments[0] ?? "";
  if (!isCatalogued(component)) {
    return {
      payload: {
        error: `${component || "That component"} is not catalogued yet, so there is no folder to hold the note. Catalogue it first.`,
      },
      status: 400,
    };
  }
  if (method === "POST" && segments.length === 1) {
    return await create(component, req);
  }
  if (
    method === "POST" &&
    segments.length === 2 &&
    segments[1] === HIDDEN_SEGMENT
  ) {
    return await setHidden(component, req);
  }
  if (method === "DELETE" && segments.length === 2) {
    const file = resolveNote(readNotes(component), segments[1] as string);
    writeNotes(component, file);
    return { payload: file, status: 200 };
  }
  return null;
}

async function create(
  component: string,
  req: NodeJS.ReadableStream
): Promise<Reply> {
  const body = (await readBody(req)) as DraftBody;
  const note = typeof body.note === "string" ? body.note.trim() : "";
  if (!note) {
    return { payload: { error: "A note needs some text." }, status: 400 };
  }
  const file = addNote(readNotes(component), {
    added: new Date().toISOString().slice(0, 10),
    cell: typeof body.cell === "string" ? body.cell : "",
    note,
    scope: NOTE_SCOPES.includes(body.scope as NoteScope)
      ? (body.scope as NoteScope)
      : "component",
  });
  writeNotes(component, file);
  return { payload: file, status: 200 };
}

async function setHidden(
  component: string,
  req: NodeJS.ReadableStream
): Promise<Reply> {
  const body = (await readBody(req)) as HiddenBody;
  if (typeof body.hidden !== "boolean") {
    return {
      payload: { error: "Hiding needs hidden: true or hidden: false." },
      status: 400,
    };
  }
  const file = withHidden(readNotes(component), body.hidden);
  writeNotes(component, file);
  return { payload: file, status: 200 };
}

async function readBody(req: NodeJS.ReadableStream): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return {};
  }
}

function send(
  res: {
    setHeader: (k: string, v: string) => void;
    end: (body: string) => void;
    statusCode: number;
  },
  status: number,
  payload: unknown
): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}
