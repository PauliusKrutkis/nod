import { type AnchorRef, parseAnchorRef } from "../anchors/ref.ts";
import type { GitRun } from "../git/exec.ts";
import {
  canonicalFactJson,
  canonicalJson,
  type Fact,
  factId,
  parseFact,
} from "./schema.ts";

/**
 * The append-only fact store: one hash-named blob per fact in a flat tree
 * under the ledger ref. Append-only sets merge as a union, so divergent
 * clones can never conflict semantically (docs/LEDGER.md §5).
 *
 * Two path levels are mandatory: receive-pack rejects single-level refs like
 * `refs/ledger` as "funny refnames", so the doc's spelling cannot be pushed.
 */
export const LEDGER_REF = "refs/ledger/facts";

const FACTS_DIR = "facts/";
const ANCHORS_DIR = "anchors/";
const MAX_ATTEMPTS = 5;
const FILE_MODE = "100644";

const revParse = async (git: GitRun, ref: string): Promise<string | null> => {
  try {
    const out = await git([
      "rev-parse",
      "--verify",
      "--quiet",
      `${ref}^{commit}`,
    ]);
    return out.trim();
  } catch {
    return null;
  }
};

/** path (`<factId>.json`) → blob sha, for the tree at the given commit. */
const listEntries = async (
  git: GitRun,
  commit: string
): Promise<Map<string, string>> => {
  const out = await git(["ls-tree", "-r", "-z", commit]);
  const entries = new Map<string, string>();
  for (const row of out.split("\0")) {
    if (!row) {
      continue;
    }
    const [meta, path] = row.split("\t");
    const blob = meta.split(" ")[2];
    if (path && blob) {
      entries.set(path, blob);
    }
  }
  return entries;
};

interface TreeNode {
  blobs: Map<string, string>;
  dirs: Map<string, TreeNode>;
}

const emptyNode = (): TreeNode => ({ blobs: new Map(), dirs: new Map() });

/** mktree only builds one level, so nested paths become nested mktrees. */
const writeTree = async (
  git: GitRun,
  entries: ReadonlyMap<string, string>
): Promise<string> => {
  const root = emptyNode();
  for (const [path, blob] of entries) {
    const parts = path.split("/");
    let node = root;
    for (const part of parts.slice(0, -1)) {
      const next = node.dirs.get(part) ?? emptyNode();
      node.dirs.set(part, next);
      node = next;
    }
    node.blobs.set(parts.at(-1) ?? path, blob);
  }

  const writeNode = async (node: TreeNode): Promise<string> => {
    const rows: string[] = [];
    for (const [name, blob] of node.blobs) {
      rows.push(`${FILE_MODE} blob ${blob}\t${name}\0`);
    }
    for (const [name, child] of node.dirs) {
      rows.push(`040000 tree ${await writeNode(child)}\t${name}\0`);
    }
    const out = await git(["mktree", "-z"], { input: rows.join("") });
    return out.trim();
  };
  return await writeNode(root);
};

const commitTree = async (
  git: GitRun,
  tree: string,
  parents: readonly string[],
  message: string
): Promise<string> => {
  const out = await git([
    "-c",
    "user.name=ledger",
    "-c",
    "user.email=ledger@invalid",
    "commit-tree",
    tree,
    ...parents.flatMap((p) => ["-p", p]),
    "-m",
    message,
  ]);
  return out.trim();
};

/**
 * Compare-and-swap ref update: fails if another writer moved the ref since
 * `prev` was read. An empty old value asserts the ref does not exist yet.
 */
const casUpdateRef = (
  git: GitRun,
  next: string,
  prev: string | null
): Promise<string> => git(["update-ref", LEDGER_REF, next, prev ?? ""]);

const isAncestor = async (
  git: GitRun,
  ancestor: string,
  descendant: string
): Promise<boolean> => {
  try {
    await git(["merge-base", "--is-ancestor", ancestor, descendant]);
    return true;
  } catch {
    return false;
  }
};

/** path → blob sha for everything under the ledger ref; empty when unborn. */
export const listLedgerEntries = async (
  git: GitRun
): Promise<Map<string, string>> => {
  const head = await revParse(git, LEDGER_REF);
  if (!head) {
    return new Map();
  }
  return await listEntries(git, head);
};

const readObjects = async (git: GitRun, dir: string): Promise<string[]> => {
  const head = await revParse(git, LEDGER_REF);
  if (!head) {
    return [];
  }
  const entries = await listEntries(git, head);
  const objects: string[] = [];
  for (const [path, blob] of entries) {
    if (path.startsWith(dir)) {
      objects.push(await git(["cat-file", "blob", blob]));
    }
  }
  return objects;
};

/**
 * Append content-named objects under the ledger ref. Idempotent: an object
 * whose path already exists is left alone (content-addressed names make the
 * same path always the same content). Safe against concurrent local writers
 * via the CAS retry loop.
 */
export const appendObjects = async (
  git: GitRun,
  contents: ReadonlyMap<string, string>
): Promise<void> => {
  const additions = new Map<string, string>();
  for (const [path, content] of contents) {
    const blob = await git(["hash-object", "-w", "--stdin"], {
      input: content,
    });
    additions.set(path, blob.trim());
  }

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const prev = await revParse(git, LEDGER_REF);
    const entries = prev
      ? await listEntries(git, prev)
      : new Map<string, string>();
    let changed = false;
    for (const [path, blob] of additions) {
      if (!entries.has(path)) {
        entries.set(path, blob);
        changed = true;
      }
    }
    if (!changed) {
      return;
    }
    const tree = await writeTree(git, entries);
    const commit = await commitTree(
      git,
      tree,
      prev ? [prev] : [],
      `ledger: append ${additions.size} object(s)`
    );
    try {
      await casUpdateRef(git, commit, prev);
      return;
    } catch {
      // Another writer moved the ref between read and update; re-read and retry.
    }
  }
  throw new Error(
    `${LEDGER_REF} kept moving during append (${MAX_ATTEMPTS} attempts)`
  );
};

export const readFacts = async (git: GitRun): Promise<Fact[]> =>
  (await readObjects(git, FACTS_DIR)).map(parseFact);

/** id → ref for every anchor the ledger knows. */
export const readAnchorRefs = async (
  git: GitRun
): Promise<Map<string, AnchorRef>> => {
  const refs = (await readObjects(git, ANCHORS_DIR)).map(parseAnchorRef);
  return new Map(refs.map((ref) => [ref.id, ref]));
};

/** Append facts; returns their ids. */
export const appendFacts = async (
  git: GitRun,
  facts: readonly Fact[]
): Promise<string[]> => {
  const contents = new Map<string, string>();
  const ids: string[] = [];
  for (const fact of facts) {
    const id = factId(fact);
    ids.push(id);
    contents.set(`${FACTS_DIR}${id}.json`, canonicalFactJson(fact));
  }
  await appendObjects(git, contents);
  return ids;
};

export const appendAnchorRefs = async (
  git: GitRun,
  refs: readonly AnchorRef[]
): Promise<void> => {
  const contents = new Map(
    refs.map((ref) => [`${ANCHORS_DIR}${ref.id}.json`, canonicalJson(ref)])
  );
  await appendObjects(git, contents);
};

/**
 * Resolve two ledger heads to one. Fast-forwards when one contains the
 * other; otherwise commits the union of both fact sets with two parents.
 * Union is always safe: fact files are content-addressed, so the same path
 * can never hold different content on the two sides.
 */
const merge = async (
  git: GitRun,
  local: string | null,
  remote: string | null
): Promise<string | null> => {
  if (!local) {
    return remote;
  }
  if (!remote || local === remote) {
    return local;
  }
  if (await isAncestor(git, local, remote)) {
    return remote;
  }
  if (await isAncestor(git, remote, local)) {
    return local;
  }
  const union = await listEntries(git, remote);
  for (const [path, blob] of await listEntries(git, local)) {
    union.set(path, blob);
  }
  const tree = await writeTree(git, union);
  return commitTree(git, tree, [local, remote], "ledger: merge");
};

/**
 * Exchange facts with a remote: fetch, union-merge, push. Retries the whole
 * cycle when the remote moves between fetch and push (the concurrent-push
 * papercut from docs/LEDGER.md §5).
 */
export const sync = async (git: GitRun, remote = "origin"): Promise<void> => {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const listing = await git(["ls-remote", remote, LEDGER_REF]);
    const advertised = listing.split("\t")[0]?.trim() || null;
    if (advertised) {
      await git([
        "fetch",
        "--quiet",
        remote,
        `+${LEDGER_REF}:refs/ledger/remotes/${remote}`,
      ]);
    }

    const local = await revParse(git, LEDGER_REF);
    const target = await merge(git, local, advertised);
    if (!target) {
      return;
    }
    if (target !== local) {
      try {
        await casUpdateRef(git, target, local);
      } catch {
        // A local append raced the merge; start the cycle over.
        continue;
      }
    }
    if (target === advertised) {
      return;
    }
    try {
      await git(["push", "--quiet", remote, `${LEDGER_REF}:${LEDGER_REF}`]);
      return;
    } catch {
      // The remote moved between fetch and push; fetch again and retry.
    }
  }
  throw new Error(
    `could not sync ${LEDGER_REF} with ${remote} (${MAX_ATTEMPTS} attempts)`
  );
};
