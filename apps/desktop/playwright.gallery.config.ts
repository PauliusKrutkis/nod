import { defineConfig } from "@playwright/test";

/**
 * Screenshot suite over the #/gallery route — webkit ONLY, never chromium:
 * Nod ships on WebKitGTK and Chromium-only checks have hidden engine-shaped
 * regressions here before (docs/BACKLOG.md § performance). Playwright's
 * webkit is the everyday proxy; the real Tauri window stays the ground truth.
 *
 * Determinism: reducedMotion pauses the stage animations (gallery.css honors
 * it), the spec awaits document.fonts.ready, and snapshot files carry the
 * platform suffix, so darwin baselines never claim to speak for the linux CI
 * image. Compare only against baselines produced on the same platform —
 * cross-OS font antialiasing turns any other comparison into noise.
 *
 * Own port, same no-borrowed-server guarantee as the other configs.
 */

const port = Number(process.env.GALLERY_PORT ?? 14_209);

export default defineConfig({
  testDir: "./e2e/gallery",
  testMatch: /\.shots\.ts/,
  timeout: 30_000,
  use: {
    baseURL: `http://localhost:${port}`,
    browserName: "webkit",
    reducedMotion: "reduce",
    viewport: { height: 800, width: 1280 },
  },
  webServer: {
    command: `pnpm exec vite --port ${port} --strictPort`,
    port,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
