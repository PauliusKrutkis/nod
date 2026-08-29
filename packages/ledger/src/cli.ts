import { writeFileSync } from "node:fs";
import process from "node:process";
import { type CliArgs, parseCliArgs, resolveRepoRoot } from "./cli-args.ts";
import {
  type LedgerConfig,
  readCommittedConfig,
  readLedgerConfig,
  readLocalConfig,
  writeLedgerConfig,
  writeLocalConfig,
} from "./config.ts";
import { approveTopic } from "./derive/approve.ts";
import {
  commentOnRegion,
  replyToComment,
  resolveComment,
} from "./derive/comment.ts";
import { deriveSession } from "./derive/session.ts";
import { signRegion } from "./derive/sign.ts";
import {
  type DeriveProgress,
  deriveStatus,
  type LedgerStatus,
} from "./derive/status.ts";
import { syncJournal } from "./facts/journal.ts";
import type { Actor, Fact } from "./facts/schema.ts";
import { appendFacts, readFacts, sync } from "./facts/store.ts";
import { type GitRun, gitIn } from "./git/exec.ts";
import { isBucketLabel } from "./topics/assign.ts";
import { nextNumber, numbersFrom } from "./topics/numbers.ts";

/**
 * The dogfood surface for phase 3 (docs/LEDGER.md §12) and the engine the
 * desktop app ships as a Tauri sidecar. Runs under plain Node (type
 * stripping; hence the .ts import extensions across this package).
 *
 *   ledger init [rev]        adopt: set the epoch (default HEAD)
 *   ledger status            coverage + queue size
 *   ledger queue             unreviewed regions with provenance
 *   ledger session [target]… queued files as unified net-diff patches
 *   ledger review <target>   sign regions; target is path or path:start-end
 *   ledger sync [remote]     exchange facts through the remote
 *
 * Global flags make the engine host-drivable: `--repo` frees it from cwd
 * (and accepts a bare store clone), `--tip` frees it from HEAD (a bare
 * clone's branches stop moving after the clone; the host passes the
 * remote-tracking ref), `--actor` frees identity from git config (the
 * desktop app passes the signed-in login).
 */

const USAGE = `usage: ledger [--repo <dir>] [--tip <rev>] [--actor <id>] <command>

  init [rev]        set the epoch to rev (default HEAD) and start the ledger
  status            coverage of post-epoch code on tip
  queue             unreviewed regions, with provenance
  session [target]… queued files as net-diff patches since the last signature
  review <target>…  mark regions reviewed; target: path or path:start-end
  approve <topic>…  stamp a topic at tip; deltas baseline here (--force for
                    a topic id the queue does not currently show)
  assign <sha>=<topic>…  map commits to topics: human corrections, or
                    agent proposals with --agent (the LLM stage)
  number <topic>…   mint display numbers (#N) for topics that lack one
  comment <target> <body>      start a thread on a region (path:line[-end])
  comment --reply <id> <body>  answer the thread rooted at fact id
  resolve <id>      close the thread rooted at fact id
  comments          every thread, positioned on tip
  sync [remote]     push/pull facts via git (default origin)

  --repo <dir>      operate on this repo (worktree or bare) instead of cwd
  --tip <rev>       derive against this rev instead of HEAD
  --actor <id>      record facts as this actor instead of git user.name
  --state-dir <dir> durable fact journal + local config, for hosts whose
                    clone is disposable
  --                end of flags; everything after is positional
`;

const short = (sha: string): string => sha.slice(0, 7);

const pct = (ratio: number): string => `${(100 * ratio).toFixed(1)}%`;

/** JSON payloads go to --out when given: pipes truncate, files do not. */
const emitJson = (out: string | undefined, payload: unknown): void => {
  const text = JSON.stringify(payload);
  if (out) {
    writeFileSync(out, text);
  } else {
    console.log(text);
  }
};

const die = (message: string): never => {
  console.error(message);
  process.exit(1);
};

/** Everything a tip-addressed command needs, resolved once per invocation. */
interface Ctx {
  git: GitRun;
  repoRoot: string;
  /** Tip commit sha (never a symbolic name). */
  tip: string;
  actorOverride?: string;
  stateDir?: string;
  /** NDJSON derivation progress on stderr, or undefined when not asked. */
  onProgress?: (progress: DeriveProgress) => void;
  /** JSON payload destination; stdout when absent. */
  out?: string;
}

/**
 * One JSON line per phase change on stderr, blame counts throttled so a
 * large tree does not turn the pipe into the bottleneck it reports on.
 */
const BLAME_REPORT_EVERY = 25;

const progressReporter = (
  enabled: boolean
): ((progress: DeriveProgress) => void) | undefined => {
  if (!enabled) {
    return undefined;
  }
  let lastDone = 0;
  return (progress) => {
    if (
      progress.stage === "blame" &&
      progress.done !== undefined &&
      progress.total !== undefined
    ) {
      const final = progress.done === progress.total;
      if (!final && progress.done - lastDone < BLAME_REPORT_EVERY) {
        return;
      }
      lastDone = progress.done;
    }
    console.error(JSON.stringify(progress));
  };
};

const getActor = async (ctx: Ctx): Promise<Actor> => {
  if (ctx.actorOverride) {
    return { id: ctx.actorOverride, kind: "human" };
  }
  let id = "unknown";
  try {
    id = (await ctx.git(["config", "user.name"])).trim() || "unknown";
  } catch {
    // fall through to "unknown"
  }
  return { id, kind: "human" };
};

const requireConfig = async (ctx: Ctx): Promise<LedgerConfig> => {
  const config =
    (await readLedgerConfig(ctx.repoRoot)) ??
    (await readCommittedConfig(ctx.git, ctx.tip)) ??
    (ctx.stateDir ? await readLocalConfig(ctx.stateDir) : null);
  if (!config) {
    return die("no ledger here yet — run `ledger init` to set the epoch");
  }
  return config;
};

const requireStatus = async (ctx: Ctx): Promise<LedgerStatus> => {
  const config = await requireConfig(ctx);
  return await deriveStatus(ctx.git, {
    approvalsRequired: config.approvalsRequired,
    epoch: config.epoch,
    onProgress: ctx.onProgress,
    tip: ctx.tip,
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
  ctx: Ctx,
  targets: readonly string[],
  json: boolean
): Promise<void> => {
  const config = await requireConfig(ctx);
  const session = await deriveSession(ctx.git, {
    approvalsRequired: config.approvalsRequired,
    epoch: config.epoch,
    onProgress: ctx.onProgress,
    targets,
    tip: ctx.tip,
  });
  if (json) {
    emitJson(ctx.out, session);
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
  ctx: Ctx,
  topics: readonly string[],
  force: boolean
): Promise<void> => {
  if (topics.length === 0) {
    die("approve needs at least one topic — see `ledger status`");
  }
  const config = await requireConfig(ctx);
  const required = config.approvalsRequired ?? 1;
  const before = await deriveStatus(ctx.git, {
    approvalsRequired: required,
    epoch: config.epoch,
    tip: ctx.tip,
  });
  const known = new Set(before.topics.map((t) => t.id));
  for (const topic of topics) {
    if (!(known.has(topic) || force)) {
      // Append-only: a typo'd id would be a junk fact forever.
      die(`unknown topic "${topic}" — see \`ledger status\`, or pass --force`);
    }
  }
  const actor = await getActor(ctx);
  for (const topic of topics) {
    await approveTopic(ctx.git, {
      actor,
      atTime: new Date().toISOString(),
      tip: ctx.tip,
      topic,
    });
  }
  const after = await deriveStatus(ctx.git, {
    approvalsRequired: required,
    epoch: config.epoch,
    tip: ctx.tip,
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
  ctx: Ctx,
  targets: readonly string[]
): Promise<void> => {
  if (targets.length === 0) {
    die("review needs at least one target: path or path:start-end");
  }
  const status = await requireStatus(ctx);
  const actor = await getActor(ctx);
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
      ctx.git,
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

const ASSIGN_PAIR = /^([0-9a-f]{7,64})=(.+)$/i;

const runAssign = async (
  ctx: Ctx,
  pairs: readonly string[],
  agent: boolean
): Promise<void> => {
  if (pairs.length === 0) {
    die("assign needs at least one <sha>=<topic> pair");
  }
  await requireConfig(ctx);
  const actor: Actor = agent
    ? { id: ctx.actorOverride ?? "agent", kind: "agent" }
    : await getActor(ctx);
  const atTime = new Date().toISOString();
  const facts: Fact[] = [];
  for (const pair of pairs) {
    const match = ASSIGN_PAIR.exec(pair);
    const topic = match?.[2]?.trim();
    if (!(match?.[1] && topic)) {
      return die(`not a <sha>=<topic> pair: ${pair}`);
    }
    // Resolve so a typo'd sha can never become a junk fact forever.
    let full: string;
    try {
      full = (
        await ctx.git([
          "rev-parse",
          "--verify",
          "--quiet",
          `${match[1]}^{commit}`,
        ])
      ).trim();
    } catch {
      return die(`no such commit: ${match[1]}`);
    }
    facts.push({
      actor,
      atSha: ctx.tip,
      atTime,
      body: topic,
      subject: { id: full, kind: "sha" },
      v: 1,
      verdict: agent ? "assigned" : "corrected",
    });
  }
  await appendFacts(ctx.git, facts);
  console.log(
    `${agent ? "proposed" : "corrected"} ${facts.length} assignment(s)`
  );
};

const runNumber = async (
  ctx: Ctx,
  topics: readonly string[]
): Promise<void> => {
  if (topics.length === 0) {
    die("number needs at least one <topic>");
  }
  await requireConfig(ctx);
  const actor = await getActor(ctx);
  const atTime = new Date().toISOString();
  const facts = await readFacts(ctx.git);
  const numbered = numbersFrom(facts);
  let next = nextNumber(facts);
  const additions: Fact[] = [];
  for (const topic of new Set(topics)) {
    if (isBucketLabel(topic)) {
      return die(`a bucket label (#pr, sha) is never numbered: ${topic}`);
    }
    if (numbered.has(topic)) {
      continue;
    }
    additions.push({
      actor,
      atSha: ctx.tip,
      atTime,
      body: String(next),
      subject: { id: topic, kind: "topic" },
      v: 1,
      verdict: "numbered",
    });
    next += 1;
  }
  if (additions.length > 0) {
    await appendFacts(ctx.git, additions);
  }
  console.log(`numbered ${additions.length} topic(s)`);
};

const COMMENT_TARGET = /^(.+):(\d+)(?:-(\d+))?$/;

const runComment = async (ctx: Ctx, args: readonly string[]): Promise<void> => {
  await requireConfig(ctx);
  const actor = await getActor(ctx);
  const atTime = new Date().toISOString();

  if (args[0] === "--reply") {
    const [, parent, body] = args;
    if (!(parent && body)) {
      die("usage: ledger comment --reply <fact-id> <body>");
    }
    const id = await replyToComment(
      ctx.git,
      ctx.tip,
      parent,
      actor,
      atTime,
      body
    );
    if (!id) {
      die(`no comment thread rooted at ${parent} — see \`ledger comments\``);
    }
    console.log(`replied · ${id}`);
    return;
  }

  const [target, body] = args;
  const range = target === undefined ? null : COMMENT_TARGET.exec(target);
  if (!(range && body)) {
    die("usage: ledger comment <path>:<line>[-<end>] <body>");
    return;
  }
  const region = {
    endLine: Number(range[3] ?? range[2]),
    path: range[1],
    startLine: Number(range[2]),
  };
  const id = await commentOnRegion(
    ctx.git,
    ctx.tip,
    region,
    actor,
    atTime,
    body
  );
  if (!id) {
    die(`nothing to anchor to at ${target} — is the region on tip?`);
  }
  console.log(`commented on ${target} · ${id}`);
};

const runComments = async (ctx: Ctx, json: boolean) => {
  const status = await requireStatus(ctx);
  if (json) {
    emitJson(ctx.out, status.comments);
    return;
  }
  if (status.comments.length === 0) {
    console.log("no comment threads yet");
    return;
  }
  for (const comment of status.comments) {
    const where =
      comment.startLine === null
        ? `${comment.path} (content gone)`
        : `${comment.path}:${comment.startLine}-${comment.endLine}`;
    const marks = [
      comment.anchorStatus === "stale" ? "previous version" : null,
      comment.resolved ? "resolved" : null,
    ]
      .filter(Boolean)
      .join(" · ");
    const head = comment.parent === null ? where : "  ↳";
    console.log(
      `${head} ${comment.actor.id}: ${comment.body}${marks ? ` (${marks})` : ""} · ${comment.id.slice(0, 8)}`
    );
  }
};

/** `^{commit}` peels refs and rejects non-commits in one probe. */
const resolveTip = async (git: GitRun, tip?: string): Promise<string> =>
  (await git(["rev-parse", `${tip ?? "HEAD"}^{commit}`])).trim();

const main = async (): Promise<void> => {
  let opts: CliArgs;
  let repoRoot: string;
  try {
    opts = parseCliArgs(process.argv.slice(2));
    repoRoot = await resolveRepoRoot(opts.repo);
  } catch (error) {
    return die(error instanceof Error ? error.message : String(error));
  }
  const [command, ...args] = opts.positional;
  const git = gitIn(repoRoot);
  const ctx = async (): Promise<Ctx> => ({
    actorOverride: opts.actor,
    git,
    onProgress: progressReporter(opts.progress),
    out: opts.out,
    repoRoot,
    stateDir: opts.stateDir,
    tip: await resolveTip(git, opts.tip),
  });
  // Reconcile the durable journal with the ref before any read (a wiped
  // clone gets its facts back) and again after any append (a new fact
  // lands in the journal the moment it exists).
  const journalSync = async (): Promise<void> => {
    if (opts.stateDir && command) {
      await syncJournal(git, opts.stateDir);
    }
  };
  await journalSync();

  switch (command) {
    case "init": {
      const epoch = (await git(["rev-parse", args[0] ?? "HEAD"])).trim();
      if (opts.stateDir) {
        // Zero-commit adoption: the epoch lives in host state, and the
        // repo never learns the ledger exists.
        const existing = await readLocalConfig(opts.stateDir).catch(() => null);
        await writeLocalConfig(opts.stateDir, {
          ...existing,
          epoch,
          version: 1,
        });
      } else {
        // Read-merge: re-init moves only the epoch, never drops other
        // settings.
        const existing = await readLedgerConfig(repoRoot).catch(() => null);
        await writeLedgerConfig(repoRoot, { ...existing, epoch, version: 1 });
      }
      console.log(
        `ledger initialized · epoch ${short(epoch)} · everything before it is grandfathered`
      );
      return;
    }
    case "status": {
      const status = await requireStatus(await ctx());
      if (opts.json) {
        emitJson(opts.out, status);
        return;
      }
      console.log(
        `coverage ${pct(status.coverage)} · ${status.reviewedLines}/${status.totalLines} post-epoch lines reviewed · ${status.queue.length} region(s) queued`
      );
      console.log(`epoch ${short(status.epoch)} → tip ${short(status.tip)}`);
      return;
    }
    case "queue": {
      const status = await requireStatus(await ctx());
      if (opts.json) {
        emitJson(opts.out, status);
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
      await runSession(await ctx(), args, opts.json);
      return;
    }
    case "review": {
      await runReview(await ctx(), args);
      await journalSync();
      return;
    }
    case "approve": {
      await runApprove(await ctx(), args, opts.force);
      await journalSync();
      return;
    }
    case "assign": {
      await runAssign(await ctx(), args, opts.agent);
      await journalSync();
      return;
    }
    case "number": {
      await runNumber(await ctx(), args);
      await journalSync();
      return;
    }
    case "comment": {
      await runComment(await ctx(), args);
      await journalSync();
      return;
    }
    case "comments": {
      await runComments(await ctx(), opts.json);
      return;
    }
    case "resolve": {
      if (!args[0]) {
        die("usage: ledger resolve <fact-id>");
      }
      const resolveCtx = await ctx();
      await requireConfig(resolveCtx);
      const id = await resolveComment(
        git,
        resolveCtx.tip,
        args[0],
        await getActor(resolveCtx),
        new Date().toISOString()
      );
      if (!id) {
        die(`no comment thread rooted at ${args[0]} — see \`ledger comments\``);
      }
      console.log(`resolved · ${id}`);
      await journalSync();
      return;
    }
    case "sync": {
      await sync(git, args[0] ?? "origin");
      console.log("ledger synced");
      await journalSync();
      return;
    }
    default: {
      console.log(USAGE);
      process.exit(command ? 1 : 0);
    }
  }
};

await main();
