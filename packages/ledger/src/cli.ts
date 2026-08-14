import process from "node:process";
import {
  type LedgerConfig,
  readLedgerConfig,
  writeLedgerConfig,
} from "./config.ts";
import { approveTopic } from "./derive/approve.ts";
import { deriveSession } from "./derive/session.ts";
import { signRegion } from "./derive/sign.ts";
import { deriveStatus, type LedgerStatus } from "./derive/status.ts";
import type { Actor } from "./facts/schema.ts";
import { sync } from "./facts/store.ts";
import { type GitRun, gitIn } from "./git/exec.ts";

/**
 * The dogfood surface for phase 3 (docs/LEDGER.md §12) and, later, the
 * engine the desktop app ships as a Tauri sidecar. Runs under plain Node
 * (type stripping; hence the .ts import extensions across this package).
 *
 *   ledger init [rev]        adopt: set the epoch (default HEAD)
 *   ledger status            coverage + queue size
 *   ledger queue             unreviewed regions with provenance
 *   ledger session [target]… queued files as unified net-diff patches
 *   ledger review <target>   sign regions; target is path or path:start-end
 *   ledger sync [remote]     exchange facts through the remote
 */

const USAGE = `usage: ledger <command>

  init [rev]        set the epoch to rev (default HEAD) and start the ledger
  status            coverage of post-epoch code on tip
  queue             unreviewed regions, with provenance
  session [target]… queued files as net-diff patches since the last signature
  review <target>…  mark regions reviewed; target: path or path:start-end
  approve <topic>…  stamp a topic at tip; deltas baseline here (--force for
                    a topic id the queue does not currently show)
  sync [remote]     push/pull facts via git (default origin)
`;

const short = (sha: string): string => sha.slice(0, 7);

const pct = (ratio: number): string => `${(100 * ratio).toFixed(1)}%`;

const die = (message: string): never => {
  console.error(message);
  process.exit(1);
};

const getActor = async (git: GitRun): Promise<Actor> => {
  let id = "unknown";
  try {
    id = (await git(["config", "user.name"])).trim() || "unknown";
  } catch {
    // fall through to "unknown"
  }
  return { kind: "human", id };
};

const requireConfig = async (repoRoot: string): Promise<LedgerConfig> => {
  const config = await readLedgerConfig(repoRoot);
  if (!config) {
    return die("no ledger here yet — run `ledger init` to set the epoch");
  }
  return config;
};

const requireStatus = async (
  git: GitRun,
  repoRoot: string
): Promise<LedgerStatus> => {
  const config = await requireConfig(repoRoot);
  return await deriveStatus(git, {
    approvalsRequired: config.approvalsRequired,
    epoch: config.epoch,
  });
};

const describeItem = (item: LedgerStatus["queue"][number]): string => {
  const provenance = item.provenance
    .map((p) => (p.pr ? `#${p.pr}` : short(p.sha)))
    .join(" ");
  const subject = item.provenance[0]?.subject ?? "";
  return `${item.path}:${item.startLine}-${item.endLine} · ${item.newLines} lines · ${provenance} ${subject}`;
};

const TARGET = /^(.+):(\d+)-(\d+)$/;

const runSession = async (
  git: GitRun,
  repoRoot: string,
  targets: readonly string[],
  json: boolean
): Promise<void> => {
  const config = await requireConfig(repoRoot);
  const session = await deriveSession(git, {
    approvalsRequired: config.approvalsRequired,
    epoch: config.epoch,
    targets,
  });
  if (json) {
    console.log(JSON.stringify(session));
    return;
  }
  if (session.sessions.length === 0) {
    die(
      targets.length > 0
        ? "nothing in the queue matches — see `ledger queue`"
        : "queue is empty — everything post-epoch is reviewed"
    );
  }
  for (const file of session.sessions) {
    const base = file.baseline
      ? `since ${short(file.baseline.sha)}`
      : "unsigned";
    console.log(
      `=== ${file.path} · ${base} · ${file.regions.length} region(s)`
    );
    console.log(file.patch);
  }
};

const runApprove = async (
  git: GitRun,
  repoRoot: string,
  topics: readonly string[],
  force: boolean
): Promise<void> => {
  if (topics.length === 0) {
    die("approve needs at least one topic — see `ledger status`");
  }
  const config = await requireConfig(repoRoot);
  const required = config.approvalsRequired ?? 1;
  const before = await deriveStatus(git, {
    approvalsRequired: required,
    epoch: config.epoch,
  });
  const known = new Set(before.topics.map((t) => t.id));
  for (const topic of topics) {
    if (!(known.has(topic) || force)) {
      // Append-only: a typo'd id would be a junk fact forever.
      die(`unknown topic "${topic}" — see \`ledger status\`, or pass --force`);
    }
  }
  const actor = await getActor(git);
  for (const topic of topics) {
    await approveTopic(git, {
      actor,
      atTime: new Date().toISOString(),
      topic,
    });
  }
  const after = await deriveStatus(git, {
    approvalsRequired: required,
    epoch: config.epoch,
  });
  for (const topic of topics) {
    const now = after.topics.find((t) => t.id === topic);
    const was = before.topics.find((t) => t.id === topic);
    if (now?.approvedAt) {
      const covered = now.reviewedLines - (was?.reviewedLines ?? 0);
      const cleared =
        before.queue.filter((i) => i.topic === topic).length -
        after.queue.filter((i) => i.topic === topic).length;
      console.log(
        `approved ${topic} at ${short(after.tip)} — coverage ${pct(before.coverage)} → ${pct(after.coverage)} · ${covered} lines · ${cleared} region(s)`
      );
    } else {
      console.log(
        `recorded approval for ${topic} (${now?.approvals ?? 1} of ${required} required) — no coverage change yet`
      );
    }
  }
};

const runReview = async (
  git: GitRun,
  repoRoot: string,
  targets: readonly string[]
): Promise<void> => {
  if (targets.length === 0) {
    die("review needs at least one target: path or path:start-end");
  }
  const status = await requireStatus(git, repoRoot);
  const actor = await getActor(git);
  const selected = status.queue.filter((item) =>
    targets.some((target) => {
      const range = TARGET.exec(target);
      if (!range) {
        return item.path === target;
      }
      return (
        item.path === range[1] &&
        item.startLine <= Number(range[3]) &&
        item.endLine >= Number(range[2])
      );
    })
  );
  if (selected.length === 0) {
    die("nothing in the queue matches — see `ledger queue`");
  }
  let signedLines = 0;
  for (const item of selected) {
    const factId = await signRegion(
      git,
      status.tip,
      item,
      actor,
      new Date().toISOString()
    );
    if (factId) {
      signedLines += item.newLines;
      console.log(`signed ${item.path}:${item.startLine}-${item.endLine}`);
    }
  }
  const reviewed = status.reviewedLines + signedLines;
  console.log(
    `coverage ${pct(status.totalLines === 0 ? 1 : reviewed / status.totalLines)} · ${reviewed}/${status.totalLines} post-epoch lines`
  );
};

const main = async (): Promise<void> => {
  const argv = process.argv.slice(2);
  const json = argv.includes("--json");
  const force = argv.includes("--force");
  const [command, ...args] = argv.filter(
    (arg) => arg !== "--json" && arg !== "--force"
  );
  const repoRoot = (
    await gitIn(process.cwd())(["rev-parse", "--show-toplevel"])
  ).trim();
  const git = gitIn(repoRoot);

  switch (command) {
    case "init": {
      const epoch = (await git(["rev-parse", args[0] ?? "HEAD"])).trim();
      // Read-merge: re-init moves only the epoch, never drops other settings.
      const existing = await readLedgerConfig(repoRoot).catch(() => null);
      await writeLedgerConfig(repoRoot, { ...existing, version: 1, epoch });
      console.log(
        `ledger initialized · epoch ${short(epoch)} · everything before it is grandfathered`
      );
      return;
    }
    case "status": {
      const status = await requireStatus(git, repoRoot);
      if (json) {
        console.log(JSON.stringify(status));
        return;
      }
      console.log(
        `coverage ${pct(status.coverage)} · ${status.reviewedLines}/${status.totalLines} post-epoch lines reviewed · ${status.queue.length} region(s) queued`
      );
      console.log(`epoch ${short(status.epoch)} → tip ${short(status.tip)}`);
      return;
    }
    case "queue": {
      const status = await requireStatus(git, repoRoot);
      if (json) {
        console.log(JSON.stringify(status));
        return;
      }
      if (status.queue.length === 0) {
        console.log("queue is empty — everything post-epoch is reviewed");
        return;
      }
      for (const [i, item] of status.queue.entries()) {
        console.log(`${String(i + 1).padStart(3)}  ${describeItem(item)}`);
      }
      return;
    }
    case "session": {
      await runSession(git, repoRoot, args, json);
      return;
    }
    case "review": {
      await runReview(git, repoRoot, args);
      return;
    }
    case "approve": {
      await runApprove(git, repoRoot, args, force);
      return;
    }
    case "sync": {
      await sync(git, args[0] ?? "origin");
      console.log("ledger synced");
      return;
    }
    default: {
      console.log(USAGE);
      process.exit(command ? 1 : 0);
    }
  }
};

await main();
