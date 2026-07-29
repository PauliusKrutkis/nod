import { defineConfig } from "astro/config";

// Static-first: this is a content page, so it ships ~zero JS. Styles are
// plain hand-authored CSS in src/styles/global.css — no framework.
export default defineConfig({
  // Canonical origin for absolute URLs (Astro.site, sitemaps). Nothing emits
  // a canonical or og:url tag yet, so this is latent — but it previously
  // named a hostname owned by someone else, which is the wrong default to
  // leave lying around. The Pages project also answers on
  // pr-flow-73o.pages.dev; only one host can be canonical.
  site: "https://nodreview.com",
});
