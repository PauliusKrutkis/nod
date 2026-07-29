import { defineConfig } from "@playwright/test";

/**
 * E2E for the marketing site, deliberately separate from the root
 * playwright.config.ts: that suite drives the React app under vite with a
 * mocked Tauri bridge, and a merged config would start an Astro server for
 * every desktop run and a vite server for every site run.
 *
 * The suite runs against a real `astro build` + `astro preview` rather than the
 * dev server. /downloads reads GitHub Releases at build time and ships as
 * static HTML; a dev-server run would prove the page renders, not that the
 * build baked the right markup into it.
 *
 * That build hits the GitHub API, so assertions here are about structure and
 * behaviour and never a specific version, size, or release note — pinning
 * "v0.4.0" would turn every release into a broken suite. Set GITHUB_TOKEN in
 * the environment if the unauthenticated rate limit bites.
 *
 * Runs on its own port, never reusing a listening server, for the same reason
 * the root config doesn't: a stray `pnpm dev:web` would otherwise serve a
 * different checkout's code and produce green runs that prove nothing.
 */

const port = Number(process.env.WEB_E2E_PORT ?? 14_207);

export default defineConfig({
  testDir: "./e2e",
  timeout: 15_000,
  use: {
    baseURL: `http://localhost:${port}`,
    viewport: { height: 900, width: 1280 },
  },
  webServer: {
    command: `pnpm run build && pnpm exec astro preview --port ${port}`,
    port,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
