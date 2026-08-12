#!/usr/bin/env node
/**
 * Classify a red gallery-shots run from Playwright's JSON report — never by
 * grepping the interleaved log. When a baseline is missing, Playwright writes
 * the actual during the failing attempt and the retry then compares against
 * that fresh file, so the log reproducibly carries "Screenshot comparison
 * failed" lines even when every real failure is a missing -linux.png. A
 * substring grep over the log therefore misclassifies migration PRs that only
 * add cells as visual changes and never publishes the baselines artifact the
 * bootstrap flow documents. The JSON report keeps every attempt separate per
 * test, so each test is judged by its FINAL attempt alone: a final-attempt
 * error carrying the missing-snapshot signature counts as MISSING, any other
 * final-attempt failure counts as CHANGED, and mid-retry noise never touches
 * the verdict.
 *
 * Usage: node classify-shots.mjs <playwright-json-report>
 *
 * Stdout is $GITHUB_OUTPUT material — exactly two lines, missing=<bool> and
 * changed=<bool>. missing=true asks the workflow to generate and publish the
 * absent baselines, even alongside real diffs, so a mixed run still unblocks
 * bootstrap; changed=true selects the review-the-diffs failure message.
 * Stderr gets a per-test summary for the job log. Exits non-zero only when
 * the report itself is missing or unparseable.
 */
import { readFileSync } from "node:fs";

const MISSING_SIGNATURE = /snapshot doesn't exist|is missing in snapshots/;

function collectSpecs(suite, out) {
  for (const child of suite.suites ?? []) {
    collectSpecs(child, out);
  }
  for (const spec of suite.specs ?? []) {
    out.push(spec);
  }
  return out;
}

function finalAttemptErrorText(attempt) {
  const errors = attempt.errors?.length
    ? attempt.errors
    : [attempt.error].filter(Boolean);
  return errors.map((error) => error?.message ?? "").join("\n");
}

const reportPath = process.argv[2];
if (!reportPath) {
  console.error("usage: node classify-shots.mjs <playwright-json-report>");
  process.exit(1);
}

const report = JSON.parse(readFileSync(reportPath, "utf8"));

const specs = [];
for (const suite of report.suites ?? []) {
  collectSpecs(suite, specs);
}

const missing = [];
const changed = [];
for (const spec of specs) {
  for (const test of spec.tests ?? []) {
    const last = test.results?.at(-1);
    if (!last || last.status === "passed" || last.status === "skipped") {
      continue;
    }
    if (MISSING_SIGNATURE.test(finalAttemptErrorText(last))) {
      missing.push(spec.title);
    } else {
      changed.push(spec.title);
    }
  }
}

console.error(
  `classified ${missing.length + changed.length} failing test(s): ` +
    `${missing.length} missing baseline(s), ${changed.length} changed`
);
for (const title of missing) {
  console.error(`  MISSING  ${title}`);
}
for (const title of changed) {
  console.error(`  CHANGED  ${title}`);
}

process.stdout.write(
  `missing=${missing.length > 0}\nchanged=${changed.length > 0}\n`
);
