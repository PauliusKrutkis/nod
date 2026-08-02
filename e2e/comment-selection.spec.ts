import { setupApp } from "./bridge.ts";
import { tokenCenter } from "./dom.ts";
import { expect, test } from "./test.ts";

/**
 * Occurrence handling clears the DOM selection on a plain click, which used
 * to fire for clicks inside a comment body too — killing the caret there
 * whenever occurrence marks happened to be lit.
 */
test("clicking inside a comment keeps its text selectable while marks are lit", async ({
  page,
}) => {
  await setupApp(page);
  await expect(page.getByRole("option").first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator(".qf-fsec-head").first()).toBeVisible();

  const { x, y } = await tokenCenter(page, 0, "alpha");
  await page.mouse.move(x, y);
  await page.waitForTimeout(100);
  await page.mouse.click(x, y);
  await expect(page.locator("mark.qf-occ-mark").first()).toBeVisible();

  const body = page.locator(".qf-comment-body").first();
  await expect(body).toBeVisible();
  await body.click();

  const caret = await body.evaluate((el) => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) {
      return "no-selection";
    }
    return el.contains(sel.anchorNode) ? "inside" : "elsewhere";
  });
  expect(caret).toBe("inside");

  await expect(page.locator("mark.qf-occ-mark").first()).toBeVisible();
});
