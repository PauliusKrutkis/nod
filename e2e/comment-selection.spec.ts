import { setupApp } from "./bridge.ts";
import { expect, test } from "./test.ts";
import type { Page } from "./types.ts";

/** Viewport-centre of `token` in a real diff line (same helper as occurrences.spec.ts). */
async function tokenCenter(page: Page, token: string) {
  const rect = await page.evaluate((wordToken) => {
    const codes = document.querySelectorAll(
      ".qf-row:not(.qf-row-hunk) .qf-code"
    );
    for (const code of codes) {
      const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode as Text;
        const i = node.data.indexOf(wordToken);
        if (i === -1) {
          continue;
        }
        const range = document.createRange();
        range.setStart(node, i);
        range.setEnd(node, i + wordToken.length);
        const r = range.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      }
    }
    return null;
  }, token);
  if (!rect) {
    throw new Error(`token not found: ${token}`);
  }
  return rect;
}

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

  const { x, y } = await tokenCenter(page, "alpha");
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
