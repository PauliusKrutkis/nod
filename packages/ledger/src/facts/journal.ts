import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseAnchorRef } from "../anchors/ref.ts";
import type { GitRun } from "../git/exec.ts";
import {
  canonicalFactJson,
  canonicalJson,
  factId,
  parseFact,
} from "./schema.ts";
import { appendObjects, listLedgerEntries } from "./store.ts";

/**
 * A plain-file mirror of the ledger ref, for hosts whose clone is
 * disposable: the desktop app's store clones live in the OS cache dir and
 * are deleted on unwatch, so the ref cannot be the only copy of a user's
 * review history. The journal directory is the durable one — every object
 * under refs/ledger/facts also exists as `<dir>/facts|anchors/<id>.json` —
 * and syncJournal reconciles the two sets in both directions.
 * Content-addressed names make the union idempotent, so wiping either side
 * loses nothing while the other survives.
 */

const SUFFIX = ".json";
const PARTIAL = ".partial";

const listJournalNames = async (
  dir: string,
  sub: string
): Promise<string[]> => {
  let names: string[];
  try {
    names = await readdir(join(dir, sub));
  } catch {
    return [];
  }
  return names.filter((name) => name.endsWith(SUFFIX));
};

const writeJournalFile = async (
  dir: string,
  path: string,
  content: string
): Promise<void> => {
  const target = join(dir, path);
  await mkdir(join(dir, path.split("/")[0] ?? ""), { recursive: true });
  await writeFile(target + PARTIAL, content);
  await rename(target + PARTIAL, target);
};

/**
 * Journal → ref. Contents are re-parsed and re-addressed on the way in, so
 * a corrupt or hand-renamed file can never poison the ref: invalid files
 * are skipped (and reported on stderr), valid ones land under their
 * computed id regardless of filename.
 */
const importJournal = async (
  git: GitRun,
  dir: string,
  inRef: ReadonlyMap<string, string>
): Promise<void> => {
  const additions = new Map<string, string>();
  for (const name of await listJournalNames(dir, "facts")) {
    try {
      const fact = parseFact(await readFile(join(dir, "facts", name), "utf8"));
      const path = `facts/${factId(fact)}${SUFFIX}`;
      if (!inRef.has(path)) {
        additions.set(path, canonicalFactJson(fact));
      }
    } catch {
      console.error(`skipping invalid journal fact: ${name}`);
    }
  }
  for (const name of await listJournalNames(dir, "anchors")) {
    try {
      const ref = parseAnchorRef(
        await readFile(join(dir, "anchors", name), "utf8")
      );
      const path = `anchors/${ref.id}${SUFFIX}`;
      if (!inRef.has(path)) {
        additions.set(path, canonicalJson(ref));
      }
    } catch {
      console.error(`skipping invalid journal anchor: ${name}`);
    }
  }
  if (additions.size > 0) {
    await appendObjects(git, additions);
  }
};

/** Ref → journal: write out every object the journal does not hold yet. */
const exportJournal = async (
  git: GitRun,
  dir: string,
  inRef: ReadonlyMap<string, string>
): Promise<void> => {
  const held = new Set([
    ...(await listJournalNames(dir, "facts")).map((n) => `facts/${n}`),
    ...(await listJournalNames(dir, "anchors")).map((n) => `anchors/${n}`),
  ]);
  for (const [path, blob] of inRef) {
    if (!held.has(path)) {
      await writeJournalFile(dir, path, await git(["cat-file", "blob", blob]));
    }
  }
};

export const syncJournal = async (git: GitRun, dir: string): Promise<void> => {
  await importJournal(git, dir, await listLedgerEntries(git));
  // Re-list: the import may have moved the ref.
  await exportJournal(git, dir, await listLedgerEntries(git));
};
