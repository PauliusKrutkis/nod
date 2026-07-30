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
  detail.files[1].filename = "src/pages/index.astro";
  detail.files[1].patch = ASTRO_PATCH;

  await setupApp(page, { detail });
  await expect(page.getByRole("option").first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator(".qf-fsec-head").first()).toBeVisible();

  await page.keyboard.press("r");
  await expect(
    page.locator(".qf-fsec-head", { hasText: "index.astro" })
  ).toBeVisible();

  await expect(
    page.locator(".hljs-name", { hasText: "section" }).first()
  ).toBeVisible();
  await expect(
    page.locator(".hljs-attr", { hasText: "class" }).first()
  ).toBeVisible();
  await expect(
    page.locator(".hljs-string", { hasText: "hero" }).first()
  ).toBeVisible();

  await page.screenshot({ path: "evidence/astro-highlighting.png" });
});
