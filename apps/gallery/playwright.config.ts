import { defineConfig } from "@playwright/test";

/**
 * Screenshot suite over the gallery app — webkit ONLY, never chromium: Nod
 * ships on WebKitGTK and Chromium-only checks have hidden engine-shaped
 * regressions before (docs/BACKLOG.md § performance). Playwright's webkit is
 * the everyday proxy; the real Tauri window (gallery:desktop) stays the
 * ground truth.
 *
 * Determinism: reducedMotion stops the stage animations (gallery.css and the
 * component stylesheets honor it), the spec awaits document.fonts.ready, and
 * snapshot files carry the platform suffix, so darwin baselines never claim
 * to speak for the linux CI image. Compare only against baselines produced on
 * the same platform — cross-OS font antialiasing turns any other comparison
 * into noise.
 *
 * timezoneId and locale are pinned for the same reason: anything that formats
 * a date renders the host's offset and month names otherwise, so a fixture
 * timestamped 09:00Z shifts a day on a machine far enough east or west and
 * the baselines only reproduce where the author sat. UTC and en-US are the
 * arbitrary-but-fixed pair darwin and the linux CI image both agree on.
 *
 * Own port (the app's dev port +1), same no-borrowed-server guarantee as the
 * desktop configs, and one worker for the same reason the capture config
 * uses one: parallel vite requests add frame latency and shots flake. One
 * retry, because webkit occasionally stalls a navigation deep into a long
 * sequential run — the retry's fresh worker always renders identically, so
 * pixel strictness is untouched.
 *
 * fullyParallel does not contradict the single worker: with workers: 1 the
 * run stays strictly sequential on any one machine. It exists for CI's
 * --shard, which otherwise splits by FILE — and every shot lives in one
 * file, so one shard would run the whole suite while the rest ran nothing.
 */

const port = Number(process.env.GALLERY_SHOTS_PORT ?? 1431);

export default defineConfig({
  testDir: "./e2e",
  testMatch: /\.shots\.ts/,
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${port}`,
    browserName: "webkit",
    locale: "en-US",
    reducedMotion: "reduce",
    timezoneId: "UTC",
    viewport: { height: 800, width: 1280 },
  },
  fullyParallel: true,
  retries: 1,
  workers: 1,
  webServer: {
    command: `pnpm exec vite --port ${port} --strictPort`,
    port,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
