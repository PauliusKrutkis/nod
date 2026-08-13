import { describe, expect, it } from "vitest";
import { gitIn } from "../git/exec.ts";
import { formatReplayReport, listSquashMerges, runReplay } from "./replay.ts";
import type { ResolveConfig } from "./resolve.ts";

/**
 * The phase 2 acceptance test, per docs/LEDGER.md §7: replay this repo's own
 * merged PRs and assert anchors survive the refactors that actually
 * happened. Skips gracefully where real history is unavailable (shallow CI
 * clones, forks without squash history).
 */

const CONFIGS: ResolveConfig[] = [
  { normalization: "ws", staleThreshold: 0.35 },
  { normalization: "ws", staleThreshold: 0.5 },
  { normalization: "rtrim", staleThreshold: 0.35 },
  { normalization: "rtrim", staleThreshold: 0.5 },
  { normalization: "exact", staleThreshold: 0.35 },
  { normalization: "exact", staleThreshold: 0.5 },
];

const MIN_MERGES = 15;

describe("replay over real history", () => {
  it("anchors explain everything blame sees surviving", async () => {
    const root = (
      await gitIn(process.cwd())(["rev-parse", "--show-toplevel"])
    ).trim();
    const git = gitIn(root);
    const shallow =
      (await git(["rev-parse", "--is-shallow-repository"])).trim() === "true";
    const merges = await listSquashMerges(git, "HEAD", 20);
    if (shallow || merges.length < MIN_MERGES) {
      console.warn("replay skipped: shallow clone or too few squash merges");
      return;
    }

    const report = await runReplay(git, { count: 20, configs: CONFIGS });
    console.log(`\n${formatReplayReport(report)}\n`);

    const defaultRun = report.configs[0];
    expect(defaultRun.lines).toBeGreaterThan(1000);
    // False churn: signed lines blame can still see but the resolver lost.
    expect(defaultRun.unexplained / defaultRun.blameSurvivors).toBeLessThan(
      0.05
    );
    // Tracking: the bulk of signed lines resolve to alive or stale, not gone.
    expect(
      (defaultRun.alive + defaultRun.stale) / defaultRun.lines
    ).toBeGreaterThan(0.75);
  }, 180_000);
});
