import { defineConfig } from "@playwright/test";

/**
 * Runs e2e/capture/landing.capture.ts — the landing-page footage scenes —
 * separately from the test suite: the main config only matches *.spec.ts, so
 * captures never run in CI or `pnpm e2e`. Its own port keeps the same
 * no-borrowed-server guarantee as the other configs. One worker, because the
 * scenes screenshot the page and parallel vite requests would add frame
 * latency for no benefit.
 */

const port = Number(process.env.CAPTURE_PORT ?? 14_208);

export default defineConfig({
  testDir: "./e2e/capture",
  testMatch: /landing\.capture\.ts/,
  timeout: 120_000,
  use: {
    baseURL: `http://localhost:${port}`,
    viewport: { height: 720, width: 1152 },
  },
  webServer: {
    command: `pnpm exec vite --port ${port} --strictPort`,
    port,
    reuseExistingServer: false,
    timeout: 30_000,
  },
  workers: 1,
});
