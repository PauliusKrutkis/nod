#!/usr/bin/env node
/**
 * Ledger phase 0 — blame-mining probe (docs/LEDGER.md §12).
 *
 * Answers the backfill go/no-go question: what fraction of the lines on tip
 * resolve cleanly to a merged PR (squash-message parse, gh API fallback), and
 * what fraction of those PRs were approved. Also times the full blame pass,
 * since blame-at-tip cost bounds the anchor engine more than language choice.
 *
 * Usage:
 *   node scripts/probe-ledger-blame.mjs [--json out.json] [--rev HEAD]
 *
 * Read-only. Needs `gh` authed for PR metadata (public-repo reads are fine
 * with either account).
 */

import { execFile } from "node:child_process";
import { writeFileSync } from "node:fs";
import { promisify } from "node:util";

const run = promisify(execFile);
const MAX_BUFFER = 64 * 1024 * 1024;

const args = process.argv.slice(2);
const jsonPath = args.includes("--json")
  ? args[args.indexOf("--json") + 1]
  : null;
const rev = args.includes("--rev") ? args[args.indexOf("--rev") + 1] : "HEAD";

const BINARY_EXT =
  /\.(png|jpe?g|gif|ico|icns|webp|avif|woff2?|ttf|otf|eot|pdf|zip|gz|tar|dmg|mp4|mov|wasm|jar)$/i;
const GENERATED = /(^|\/)(pnpm-lock\.yaml|.*\.lock|.*\.snap)$/;
const PR_REF = /\(#(\d+)\)/g;
// Blame group headers are "<sha> <origline> <finalline> <numlines>"; headers
// without the 4th field continue the previous group and are not counted.
const BLAME_GROUP_HEADER = /^([0-9a-f]{40}) \d+ \d+ (\d+)$/;
const ASSOCIATION_CAP = 500;

async function git(...argv) {
  const { stdout } = await run("git", argv, { maxBuffer: MAX_BUFFER });
  return stdout;
}

async function gh(...argv) {
  const { stdout } = await run("gh", argv, { maxBuffer: MAX_BUFFER });
  return stdout;
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i], i);
      }
    })
  );
  return results;
}

// --- 1. Files on tip ---------------------------------------------------------

const allFiles = (await git("ls-tree", "-r", "--name-only", "-z", rev))
  .split("\0")
  .filter(Boolean);
const binaryFiles = allFiles.filter((f) => BINARY_EXT.test(f));
const blamable = allFiles.filter((f) => !BINARY_EXT.test(f));
console.log(
  `${allFiles.length} files on ${rev} (${binaryFiles.length} binary, skipped)`
);

// --- 2. Blame every line -----------------------------------------------------

const blameStart = performance.now();
// sha → { total, generated } surviving line counts
const linesBySha = new Map();
let blamedLines = 0;
let blameFailures = 0;

await mapLimit(blamable, 8, async (file) => {
  let out;
  try {
    out = await git("blame", "--porcelain", rev, "--", file);
  } catch {
    blameFailures++;
    return;
  }
  const generated = GENERATED.test(file);
  for (const line of out.split("\n")) {
    const m = BLAME_GROUP_HEADER.exec(line);
    if (!m) {
      continue;
    }
    const n = Number(m[2]);
    blamedLines += n;
    const entry = linesBySha.get(m[1]) ?? { total: 0, generated: 0 };
    entry.total += n;
    if (generated) {
      entry.generated += n;
    }
    linesBySha.set(m[1], entry);
  }
});

const blameSeconds = (performance.now() - blameStart) / 1000;
console.log(
  `blamed ${blamedLines} lines across ${blamable.length} files in ${blameSeconds.toFixed(1)}s ` +
    `(${Math.round(blamedLines / blameSeconds)} lines/s, ${blameFailures} failures)`
);

// --- 3. Commit → PR via squash-message parse ----------------------------------

const shas = [...linesBySha.keys()];
const subjects = new Map();
for (let i = 0; i < shas.length; i += 500) {
  const out = await git(
    "show",
    "-s",
    "--format=%H%x09%s",
    ...shas.slice(i, i + 500)
  );
  for (const row of out.split("\n").filter(Boolean)) {
    const [sha, subject] = row.split("\t");
    subjects.set(sha, subject ?? "");
  }
}

const prBySha = new Map();
for (const [sha, subject] of subjects) {
  const refs = [...subject.matchAll(PR_REF)];
  if (refs.length > 0) {
    prBySha.set(sha, Number(refs.at(-1)[1]));
  }
}
console.log(
  `${shas.length} surviving commits; ${prBySha.size} carry a (#N) squash reference`
);

// --- 4. gh API fallback for unreferenced commits -------------------------------

const unreferenced = shas.filter((sha) => !prBySha.has(sha));
const probed = unreferenced.slice(0, ASSOCIATION_CAP);
if (unreferenced.length > ASSOCIATION_CAP) {
  console.log(
    `NOTE: ${unreferenced.length} unreferenced commits, probing only ${ASSOCIATION_CAP} via API`
  );
}
let apiResolved = 0;
await mapLimit(probed, 5, async (sha) => {
  try {
    const out = await gh(
      "api",
      `repos/{owner}/{repo}/commits/${sha}/pulls`,
      "--jq",
      "[.[] | select(.merged_at != null) | .number][0] // empty"
    );
    const number = Number(out.trim());
    if (out.trim() && Number.isFinite(number)) {
      prBySha.set(sha, number);
      apiResolved++;
    }
  } catch {
    // unresolved commits fall through to the direct-commit bucket
  }
});
console.log(
  `API fallback resolved ${apiResolved}/${probed.length} unreferenced commits`
);

// --- 5. PR approval state ------------------------------------------------------

const prList = JSON.parse(
  await gh(
    "pr",
    "list",
    "--state",
    "merged",
    "--limit",
    "1000",
    "--json",
    "number,title,reviewDecision,mergedAt"
  )
);
const prMeta = new Map(prList.map((pr) => [pr.number, pr]));
console.log(`${prList.length} merged PRs fetched for approval state`);

// --- 6. Aggregate --------------------------------------------------------------

const buckets = {
  approvedPr: 0,
  mergedPrUnapproved: 0,
  directCommit: 0,
  generated: 0,
};
const linesByPr = new Map();

for (const [sha, { total, generated }] of linesBySha) {
  const code = total - generated;
  buckets.generated += generated;
  const prNumber = prBySha.get(sha);
  if (prNumber === undefined) {
    buckets.directCommit += code;
    continue;
  }
  const decision = prMeta.get(prNumber)?.reviewDecision;
  if (decision === "APPROVED") {
    buckets.approvedPr += code;
  } else {
    buckets.mergedPrUnapproved += code;
  }
  linesByPr.set(prNumber, (linesByPr.get(prNumber) ?? 0) + code);
}

const codeLines = blamedLines - buckets.generated;
const pct = (n) => `${((100 * n) / codeLines).toFixed(1)}%`;

console.log(`
── Ledger blame probe · ${new Date().toISOString().slice(0, 10)} ──
tip lines               ${blamedLines} (${buckets.generated} generated/lockfile, excluded below)
code lines              ${codeLines}
→ merged PR, approved   ${buckets.approvedPr} (${pct(buckets.approvedPr)})
→ merged PR, unapproved ${buckets.mergedPrUnapproved} (${pct(buckets.mergedPrUnapproved)})
→ direct commit, no PR  ${buckets.directCommit} (${pct(buckets.directCommit)})
resolve-to-PR rate      ${pct(buckets.approvedPr + buckets.mergedPrUnapproved)}
blame pass              ${blameSeconds.toFixed(1)}s
`);

const topPrs = [...linesByPr.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 15);
console.log("top PRs by surviving lines (topic-map seed signal):");
for (const [number, lines] of topPrs) {
  const title = prMeta.get(number)?.title ?? "(title unknown)";
  console.log(`  #${number}  ${String(lines).padStart(6)}  ${title}`);
}

if (jsonPath) {
  writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        date: new Date().toISOString(),
        rev,
        files: allFiles.length,
        blamedLines,
        codeLines,
        buckets,
        blameSeconds,
        commits: shas.length,
        squashResolved: prBySha.size - apiResolved,
        apiResolved,
        unreferencedCommits: unreferenced.length,
        topPrs: topPrs.map(([number, lines]) => ({
          number,
          lines,
          title: prMeta.get(number)?.title,
        })),
      },
      null,
      2
    )
  );
  console.log(`\nJSON written to ${jsonPath}`);
}
