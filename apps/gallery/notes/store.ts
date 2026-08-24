/**
 * Disk side of the note format: one JSON file per component, living beside
 * that component's fixtures in packages/ui/src/<name>/. Colocation is the
 * whole point — an agent fixing one component reads one file, and two people
 * annotating two components never touch the same file.
 *
 * A component with no notes has no file. Writing an empty note set deletes
 * it, so `git status` after a batch fix shows the notes disappearing with the
 * change that answered them, and the tree carries no empty scaffolding.
 * "Empty" is isEmptyNotes' single definition of the word, which counts the
 * hidden flag as content: a hidden component with no notes keeps its file,
 * because deleting it would put the component back in the rail.
 *
 * Only catalogued components have a folder to hold a file. Notes on a pending
 * component are refused at this layer rather than invented somewhere else:
 * the answer to "where does this note go" is the component's own folder, and
 * a component without one has to be catalogued first.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  emptyNotes,
  isEmptyNotes,
  type NotesFile,
  notesFileName,
  parseNotes,
} from "../src/notes.ts";

export interface ComponentNotes {
  component: string;
  file: NotesFile;
}

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const uiSourceRoot = join(repoRoot, "packages/ui/src");
const COMPONENT_NAME = /^[a-z0-9-]+$/;

function componentDir(component: string): string {
  return join(uiSourceRoot, component);
}

function notesPath(component: string): string {
  return join(componentDir(component), notesFileName(component));
}

export function repoRelativeNotesPath(component: string): string {
  return relative(repoRoot, notesPath(component));
}

export function isCatalogued(component: string): boolean {
  return (
    COMPONENT_NAME.test(component) && existsSync(join(uiSourceRoot, component))
  );
}

export function readNotes(component: string): NotesFile {
  const path = notesPath(component);
  if (!existsSync(path)) {
    return emptyNotes();
  }
  try {
    return parseNotes(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return emptyNotes();
  }
}

export function writeNotes(component: string, file: NotesFile): void {
  const path = notesPath(component);
  if (isEmptyNotes(file)) {
    rmSync(path, { force: true });
    return;
  }
  mkdirSync(componentDir(component), { recursive: true });
  writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`, "utf8");
}

/**
 * Every component carrying notes or the hidden flag, in name order, skipping
 * the ones whose file is absent — which is most of them.
 */
export function listNotes(): ComponentNotes[] {
  const components: string[] = [];
  for (const entry of readdirSync(uiSourceRoot, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      components.push(entry.name);
    }
  }
  const notes: ComponentNotes[] = [];
  for (const component of components.sort()) {
    const file = readNotes(component);
    if (!isEmptyNotes(file)) {
      notes.push({ component, file });
    }
  }
  return notes;
}
