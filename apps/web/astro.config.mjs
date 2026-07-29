import { defineConfig } from "astro/config";

// Static-first: this is a content page, so it ships ~zero JS. Styles are
// plain hand-authored CSS in src/styles/global.css — no framework. `site` is
// the canonical origin every absolute URL is built from (Base.astro's
// canonical and og:url tags); the hosting setup is in docs/RELEASING.md.
export default defineConfig({
  site: "https://nodreview.com",
});
