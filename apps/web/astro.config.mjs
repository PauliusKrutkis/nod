/**
 * Static-first: this is a content page, so it ships zero JS of its own.
 * Styles are plain hand-authored CSS in src/styles/global.css — no
 * framework. React is build-time templating only: @nod/ui components (the
 * app's real keycaps) render to static HTML during the build, and no
 * client: directive exists anywhere, so nothing hydrates. Astro still emits
 * the react renderer's client runtime as an orphan _astro/client.*.js
 * chunk regardless of whether any island uses it (getClientInput in its
 * static build adds every renderer clientEntrypoint unconditionally);
 * stripOrphanChunks removes emitted _astro JS that no built page or asset
 * references, so the deploy stays exactly as JS-free as the pages are. The
 * guard is by reference, not by name: the day a real island appears, its
 * chunks are referenced from the HTML and survive.
 *
 * `site` is the canonical origin every absolute URL is built from
 * (Base.astro's canonical and og:url tags); the hosting setup is in
 * docs/RELEASING.md. The sitemap covers Astro pages only; the demo build is
 * copied into the output separately and is deliberately absent from it (and
 * disallowed in robots.txt) — it is an app shell, not a content page.
 */

import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import { defineConfig } from "astro/config";

/** Every file under `dir` (recursive) whose name passes `keep`. */
function filesUnder(dir, keep) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...filesUnder(full, keep));
    } else if (keep(entry.name)) {
      found.push(full);
    }
  }
  return found;
}

/**
 * Delete `_astro/*.js` chunks that no built HTML, CSS, or JS references —
 * the react renderer's unconditionally-emitted client runtime, today.
 */
function stripOrphanChunks() {
  return {
    name: "strip-orphan-chunks",
    hooks: {
      "astro:build:done": ({ dir, logger }) => {
        const out = fileURLToPath(dir);
        const astroDir = join(out, "_astro");
        if (!existsSync(astroDir)) {
          return;
        }
        const chunks = readdirSync(astroDir).filter((name) =>
          name.endsWith(".js")
        );
        if (chunks.length === 0) {
          return;
        }
        const referencing = filesUnder(out, (name) =>
          [".html", ".css", ".js"].some((ext) => name.endsWith(ext))
        );
        const corpus = referencing
          .map((file) => readFileSync(file, "utf8"))
          .join("\n");
        for (const chunk of chunks) {
          if (!corpus.includes(chunk)) {
            rmSync(join(astroDir, chunk));
            logger.info(`removed orphan chunk _astro/${chunk}`);
          }
        }
      },
    },
  };
}

export default defineConfig({
  site: "https://nodreview.com",
  integrations: [react(), sitemap(), stripOrphanChunks()],
});
