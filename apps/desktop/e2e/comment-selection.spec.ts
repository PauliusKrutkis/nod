import { setupApp } from "./bridge.ts";
import { clickToken } from "./dom.ts";
import { expect, test } from "./test.ts";
import type { Locator } from "./types.ts";

/**
 * Occurrence handling clears the DOM selection on a plain click, which used
 * to fire for clicks inside a comment too — killing the caret there whenever
 * occurrence marks happened to be lit. Production bails on the readable
 * containers (`.md`, `.qf-comment-head`, `.qf-thread-collapsed-lead`), so
 * the assertions here target those same classes.
 */
test.beforeEach(async ({ page }) => {
  await setupApp(page);
  await expect(page.getByRole("option").first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator(".qf-fsec-head").first()).toBeVisible();
  await clickToken(page, 0, "alpha");
  await expect(page.locator("mark.qf-occ-mark").first()).toBeVisible();
});

async function caretWithin(container: Locator) {
  return await container.evaluate((el) => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) {
      return "no-selection";
    }
    return el.contains(sel.anchorNode) ? "inside" : "elsewhere";
  });
}

test("clicking a comment body keeps its text selectable while marks are lit", async ({
  page,
}) => {
  const body = page.locator(".qf-comment .md").first();
  await expect(body).toBeVisible();
  await body.locator("p").first().click();

  expect(await caretWithin(body)).toBe("inside");
  await expect(page.locator("mark.qf-occ-mark").first()).toBeVisible();
});

test("clicking the comment header keeps its selection while marks are lit", async ({
  page,
}) => {
  const head = page.locator(".qf-comment-head").first();
  await expect(head).toBeVisible();
  await head.locator(".qf-comment-author").click();

  expect(await caretWithin(head)).toBe("inside");
  await expect(page.locator("mark.qf-occ-mark").first()).toBeVisible();
});
