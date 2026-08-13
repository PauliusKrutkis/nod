/**
 * Collects every open note in the repo into one batch an agent can work
 * through in a single pass. This is the point of the whole format: notes are
 * captured one at a time while browsing, and spent all at once.
 *
 * The digest prints the note file's path per component because the agent's
 * last step is deleting the notes it answered, in the same commit as the fix.
 * `--json` emits the same content unformatted for programmatic callers.
 */
import { listNotes, repoRelativeNotesPath } from "./store.ts";

const asJson = process.argv.includes("--json");
const groups = listNotes();
const openCount = groups.reduce(
  (total, { file }) => total + file.open.length,
  0
);

if (asJson) {
  process.stdout.write(
    `${JSON.stringify(
      groups.map(({ component, file }) => ({
        component,
        path: repoRelativeNotesPath(component),
        ...file,
      })),
      null,
      2
    )}\n`
  );
} else {
  process.stdout.write(`${render()}\n`);
}

function render(): string {
  if (groups.length === 0) {
    return "No notes. Press c in the gallery to leave one.";
  }
  const withOpen = groups.filter(({ file }) => file.open.length > 0);
  const lines = [countLine(), ""];
  for (const { component, file } of withOpen) {
    lines.push(`${component} · ${repoRelativeNotesPath(component)}`);
    for (const note of file.open) {
      lines.push(`  ${note.id}  ${note.scope.padEnd(9)} ${note.note}`);
      lines.push(
        `      ${"".padEnd(9)}   seen at ${note.cell} · ${note.added}`
      );
    }
    lines.push("");
  }
  return [...lines, ...decidedLines()].join("\n").trimEnd();
}

function countLine(): string {
  const components = groups.filter(({ file }) => file.open.length > 0).length;
  if (openCount === 0) {
    return "No open notes.";
  }
  return `${plural(openCount, "open note")} across ${plural(components, "component")}.`;
}

function decidedLines(): string[] {
  const decided = groups.filter(({ file }) => file.decided.length > 0);
  if (decided.length === 0) {
    return [];
  }
  const lines = ["Decided already, do not re-propose:"];
  for (const { component, file } of decided) {
    for (const entry of file.decided) {
      lines.push(`  ${component}  ${entry.note} — ${entry.why}`);
    }
  }
  return lines;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
