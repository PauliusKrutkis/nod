import { setupApp } from "./bridge.ts";
import { DETAIL } from "./fixtures.ts";
import { expect, test } from "./test.ts";

/**
 * highlight.js ships no `astro` grammar, so `.astro` files fell through to
 * escaped plain text. They now resolve to the `xml` grammar — the same
 * fallback `.vue` and `.svelte` already use — so the template body tokenizes
 * while the `---` frontmatter fence stays plain.
 */
const ASTRO_PATCH = `@@ -0,0 +1,8 @@
+---
+const title = "Nod";
+---
+<section class="hero">
+  <h1>{title}</h1>
+  <p>Review pull requests at the speed of thought.</p>
+</section>
+<style>.hero { padding: 2rem; }</style>`;

test("astro files get syntax highlighting through the xml grammar", async ({
  page,
}) => {
  const detail = structuredClone(DETAIL) as typeof DETAIL;
  const astro = detail.files.find((f) => f.filename === "src/lib/search.ts");
  if (!astro) {
    throw new Error("fixture file missing");
  }
  astro.filename = "src/pages/index.astro";
  astro.patch = ASTRO_PATCH;
  astro.additions = 8;
  astro.changes = 8;

  await setupApp(page, { detail });
  await expect(page.getByRole("option").first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator(".qf-fsec-head").first()).toBeVisible();

  // The app reads files in tree order, so the index is whatever the sidebar
  // says it is — never the fixture's position in the host payload. Selecting
  // from the sidebar also scrolls the section into the virtualized window.
  const entry = page.locator(".qf-sidebar [data-file-index]", {
    hasText: "index.astro",
  });
  const astroIndex = await entry.getAttribute("data-file-index");
  await entry.click();
  const rows = page.locator(`.qf-row[data-file-index="${astroIndex}"]`);
  await expect(
    rows.locator(".hljs-name", { hasText: "section" }).first()
  ).toBeVisible();
  await expect(
    rows.locator(".hljs-attr", { hasText: "class" }).first()
  ).toBeVisible();
  await expect(
    rows.locator(".hljs-string", { hasText: "hero" }).first()
  ).toBeVisible();

  await page.screenshot({ path: "evidence/astro-highlighting.png" });
});
