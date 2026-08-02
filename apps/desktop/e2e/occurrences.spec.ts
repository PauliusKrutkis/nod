import { setupApp } from "./bridge.ts";
import { dblclickToken, tokenCenter } from "./dom.ts";
import { expect, test } from "./test.ts";
import type { Page } from "./types.ts";

const REVIEW_REQUESTS = /Review requests/;

test.beforeEach(async ({ page }) => {
  await setupApp(page);
  await expect(page.getByRole("option").first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator(".qf-fsec-head").first()).toBeVisible();
});

/** Programmatically select `text` inside a diff code line (fires selectionchange). */
async function selectInCode(page: Page, section: number, text: string) {
  const ok = await page.evaluate(
    ({ section: fileSection, text: needle }) => {
      const codes = document.querySelectorAll(
        `.qf-row[data-file-index="${fileSection}"]:not(.qf-row-hunk) .qf-code`
      );
      for (const code of codes) {
        const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          const node = walker.currentNode as Text;
          const i = node.data.indexOf(needle);
          if (i === -1) {
            continue;
          }
          const range = document.createRange();
          range.setStart(node, i);
          range.setEnd(node, i + needle.length);
          const sel = window.getSelection();
          if (!sel) {
            return false;
          }
          sel.removeAllRanges();
          sel.addRange(range);
          return true;
        }
      }
      return false;
    },
    { section, text }
  );
  if (!ok) {
    throw new Error(`text not found in diff: ${text}`);
  }
}

const occMarks = (page: Page) => page.locator("mark.qf-occ-mark");

test("single-clicking a token marks its occurrences within that file", async ({
  page,
}) => {
  const { x, y } = await tokenCenter(page, 0, "return");
  await page.mouse.move(x, y);
  await page.waitForTimeout(100);
  await page.mouse.click(x, y);
  await expect(occMarks(page)).toHaveCount(2);
  expect(await occMarks(page).allTextContents()).toEqual(["return", "return"]);
  await expect(
    page.locator('.qf-row[data-file-index="1"] mark.qf-occ-mark')
  ).toHaveCount(0);

  const alpha = await tokenCenter(page, 0, "alpha");
  await page.mouse.click(alpha.x, alpha.y);
  await expect(occMarks(page).first()).toHaveText("alpha");

  const row = await page
    .locator('.qf-row[data-file-index="0"]:not(.qf-row-hunk) .qf-code')
    .first()
    .boundingBox();
  if (!row) {
    throw new Error("row not found");
  }
  await page.mouse.click(row.x + row.width - 8, row.y + row.height / 2);
  await expect(occMarks(page)).toHaveCount(0);
});

test("double-clicking a token marks its occurrences", async ({ page }) => {
  await dblclickToken(page, 0, "return");
  await expect(occMarks(page)).toHaveCount(2);
});

test("a double-click keeps the native selection, painted apart from the marks", async ({
  page,
}) => {
  await dblclickToken(page, 0, "return");
  await expect(occMarks(page)).toHaveCount(2);

  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(
    "return"
  );

  const paint = await occMarks(page)
    .first()
    .evaluate((el) => ({
      mark: getComputedStyle(el).backgroundColor,
      selection: getComputedStyle(el, "::selection").backgroundColor,
    }));
  expect(paint.selection).not.toBe(paint.mark);
  expect(paint.selection).not.toBe("rgba(0, 0, 0, 0)");
});

test("clicking blank space right of a line ending in a word clears, not highlights", async ({
  page,
}) => {
  await dblclickToken(page, 1, "gamma");
  await expect(occMarks(page)).toHaveCount(2);

  const line = page
    .locator('.qf-row[data-file-index="1"]:not(.qf-row-hunk) .qf-code')
    .filter({ hasText: "export default search" })
    .first();
  const box = await line.boundingBox();
  if (!box) {
    throw new Error("box not found");
  }
  await page.mouse.click(box.x + box.width - 8, box.y + box.height / 2);
  await expect(occMarks(page)).toHaveCount(0);
});

test("marks are paint-only — the line's geometry does not move", async ({
  page,
}) => {
  const codeLine = page
    .locator('.qf-row[data-file-index="1"]:not(.qf-row-hunk) .qf-code')
    .first();
  const before = await codeLine.boundingBox();

  await dblclickToken(page, 1, "gamma");
  await expect(occMarks(page)).toHaveCount(2);

  const after = await codeLine.boundingBox();
  expect(after).toEqual(before);

  const style = await occMarks(page)
    .first()
    .evaluate((el) => {
      const s = getComputedStyle(el);
      return { border: s.borderWidth, margin: s.margin, padding: s.padding };
    });
  expect(style).toEqual({ border: "0px", margin: "0px", padding: "0px" });
});

test("whitespace or single-character selections mark nothing", async ({
  page,
}) => {
  await dblclickToken(page, 1, "gamma");
  await expect(occMarks(page)).toHaveCount(2);

  await selectInCode(page, 1, "q");
  await expect(occMarks(page)).toHaveCount(0);

  await dblclickToken(page, 1, "gamma");
  await expect(occMarks(page)).toHaveCount(2);

  await selectInCode(page, 1, "  ");
  await expect(occMarks(page)).toHaveCount(0);
});

test("the find bar suppresses occurrence marks; closing it restores them", async ({
  page,
}) => {
  await dblclickToken(page, 1, "gamma");
  await expect(occMarks(page)).toHaveCount(2);

  await page.keyboard.press("ControlOrMeta+f");
  await expect(page.locator(".qf-findbar")).toBeVisible();
  await expect(occMarks(page)).toHaveCount(0);
  await expect(page.locator("mark.qf-find-mark")).toHaveCount(2);

  await page.keyboard.press("Escape");
  await expect(page.locator(".qf-findbar")).toHaveCount(0);
  await expect(page.locator("mark.qf-find-mark")).toHaveCount(0);
  await expect(occMarks(page)).toHaveCount(2);
});

test("with find open, selecting a token hands off: find closes, occurrences take over", async ({
  page,
}) => {
  await page.keyboard.press("ControlOrMeta+f");
  await expect(page.locator(".qf-findbar")).toBeVisible();
  await page.locator(".qf-findbar-input").fill("alpha");
  await expect(page.locator("mark.qf-find-mark").first()).toBeVisible();
  await expect(occMarks(page)).toHaveCount(0);

  await dblclickToken(page, 0, "return");

  await expect(page.locator(".qf-findbar")).toHaveCount(0);
  await expect(page.locator("mark.qf-find-mark")).toHaveCount(0);
  await expect(occMarks(page)).toHaveCount(2);

  await page.keyboard.press("n");
  await expect(page.locator(".qf-row-active mark.qf-occ-mark")).toHaveCount(1);
});

test("stepping to an already-visible occurrence does not scroll", async ({
  page,
}) => {
  const { x, y } = await tokenCenter(page, 0, "return");
  await page.mouse.move(x, y);
  await page.waitForTimeout(100);
  await page.mouse.click(x, y);
  await expect(occMarks(page)).toHaveCount(2);

  const scroller = page.getByTestId("review-scroller");
  const before = await scroller.evaluate((el) => el.scrollTop);

  await page.keyboard.press("n");
  await expect(page.locator(".qf-row-active mark.qf-occ-mark")).toHaveCount(1);

  const after = await scroller.evaluate((el) => el.scrollTop);
  expect(after).toBe(before);
});

test("a drag-selection over code survives the click that ends it", async ({
  page,
}) => {
  const from = await tokenCenter(page, 0, "alpha");
  const to = await tokenCenter(page, 0, "return");
  await page.mouse.move(Math.round(from.x), Math.round(from.y));
  await page.mouse.down();
  await page.mouse.move(Math.round(to.x), Math.round(to.y), { steps: 5 });
  await page.mouse.up();

  const selected = await page.evaluate(
    () => window.getSelection()?.toString() ?? ""
  );
  expect(selected.length).toBeGreaterThan(1);

  await page.waitForTimeout(300);
  const after = await page.evaluate(
    () => window.getSelection()?.toString() ?? ""
  );
  expect(after).toBe(selected);
});

test("clicking into a composer while marks are lit keeps its caret", async ({
  page,
}) => {
  await dblclickToken(page, 1, "gamma");
  await expect(occMarks(page)).toHaveCount(2);

  await page.keyboard.press("j");
  await page.keyboard.press("c");
  const composer = page.getByRole("textbox", {
    name: "Add a review comment…",
  });
  await expect(composer).toBeFocused();

  await composer.click();
  const caret = await page.evaluate(() => {
    const sel = window.getSelection();
    return {
      inEditor: Boolean(
        sel?.anchorNode?.parentElement?.closest(".qa-editor-content")
      ),
      ranges: sel?.rangeCount ?? 0,
    };
  });
  expect(caret).toEqual({ inEditor: true, ranges: 1 });
  await page.keyboard.type("still typing");
  await expect(composer).toContainText("still typing");
});

test("Esc goes straight to the inbox — occurrence marks don't consume it", async ({
  page,
}) => {
  await dblclickToken(page, 1, "gamma");
  await expect(occMarks(page)).toHaveCount(2);

  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: REVIEW_REQUESTS })
  ).toBeVisible();
});
