import { defineConfig } from "@playwright/test";

/**
 * Screenshot suite over the gallery app — webkit ONLY, never chromium: Nod
 * ships on WebKitGTK and Chromium-only checks have hidden engine-shaped
 * regressions before (docs/BACKLOG.md § performance). Playwright's webkit is
 * the everyday proxy; the real Tauri window (gallery:desktop) stays the
 * ground truth.
 *
 * Determinism: reducedMotion pauses the stage animations (gallery.css honors
 * it), the spec awaits document.fonts.ready, and snapshot files carry the
 * platform suffix, so darwin baselines never claim to speak for the linux CI
 * image. Compare only against baselines produced on the same platform —
 * cross-OS font antialiasing turns any other comparison into noise.
 *
 * Own port (the app's dev port +1), same no-borrowed-server guarantee as the
 * desktop configs, and one worker for the same reason the capture config
 * uses one: parallel vite requests add frame latency and shots flake. One
 * retry, because webkit occasionally stalls a navigation deep into a long
 * sequential run — the retry's fresh worker always renders identically, so
 * pixel strictness is untouched.
 */

const port = Number(process.env.GALLERY_SHOTS_PORT ?? 1431);

export default defineConfig({
  testDir: "./e2e",
  testMatch: /\.shots\.ts/,
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${port}`,
    browserName: "webkit",
    reducedMotion: "reduce",
    viewport: { height: 800, width: 1280 },
  },
  retries: 1,
  workers: 1,
  webServer: {
    command: `pnpm exec vite --port ${port} --strictPort`,
    port,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
