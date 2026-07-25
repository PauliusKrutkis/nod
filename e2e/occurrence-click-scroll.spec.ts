import { setupApp } from "./bridge.ts";
import { makeBigDetail } from "./fixtures.ts";
import { expect, test } from "./test.ts";
import type { Page } from "./types.ts";

/**
 * One tall file whose `needle` token recurs far enough apart that stepping
 * between matches always crosses the fold — the only shape in which "bring the
 * match into frame" is observable at all. occurrences.spec.ts covers the
 * marking rules themselves on the small default fixture.
 */
const NEEDLE_ROWS = [1, 30, 60];
const TALL_DETAIL = makeBigDetail(1, 70, (_file, line) =>
  NEEDLE_ROWS.includes(line)
    ? `const slot${line} = needle;`
    : `const filler${line} = ${line};`
);

const ACTIVE_ROW = /qf-row-active/;

const rowAt = (page: Page, line: number) =>
  page.locator(`.qf-row[data-anchor="RIGHT:${line}"]`);

const scrollTopOf = (page: Page) =>
  page.getByTestId("review-scroller").evaluate((el) => el.scrollTop);

test.beforeEach(async ({ page }) => {
  await setupApp(page, { detail: TALL_DETAIL });
  await expect(page.getByRole("option").first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator(".qf-fsec-head").first()).toBeVisible();
});

/**
 * Click `token` on `line` at the midpoint of whatever part of it the scroller
 * actually shows, so the same helper can target a match hanging off the fold.
 */
async function clickToken(page: Page, line: number, token: string) {
  const point = await page.evaluate(
    ({ line: row, token: word }) => {
      const code = document.querySelector(
        `.qf-row[data-anchor="RIGHT:${row}"] .qf-code`
      );
      const scroller = document.querySelector(
        '[data-testid="review-scroller"]'
      );
      if (!(code && scroller)) {
        return null;
      }
      const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode as Text;
        const at = node.data.indexOf(word);
        if (at === -1) {
          continue;
        }
        const range = document.createRange();
        range.setStart(node, at);
        range.setEnd(node, at + word.length);
        const box = range.getBoundingClientRect();
        const view = scroller.getBoundingClientRect();
        const top = Math.max(box.top, view.top);
        const bottom = Math.min(box.bottom, view.bottom);
        return bottom - top < 2
          ? null
          : { x: box.x + box.width / 2, y: (top + bottom) / 2 };
      }
      return null;
    },
    { line, token }
  );
  if (!point) {
    throw new Error(`no clickable "${token}" on line ${line}`);
  }
  await page.mouse.move(point.x, point.y);
  await page.waitForTimeout(100);
  await page.mouse.click(point.x, point.y);
}

/** Where `line`'s row sits relative to the scroller viewport. */
function rowFraming(page: Page, line: number) {
  return page.evaluate((row) => {
    const el = document.querySelector(`.qf-row[data-anchor="RIGHT:${row}"]`);
    const scroller = document.querySelector('[data-testid="review-scroller"]');
    if (!(el && scroller)) {
      return null;
    }
    const box = el.getBoundingClientRect();
    const view = scroller.getBoundingClientRect();
    return {
      fullyVisible: box.top >= view.top && box.bottom <= view.bottom,
      onScreen: box.bottom > view.top && box.top < view.bottom,
    };
  }, line);
}

/** Park `line`'s row across the bottom edge, leaving only `visiblePx` showing. */
async function clipRowAtBottomEdge(
  page: Page,
  line: number,
  visiblePx: number
) {
  await expect(rowAt(page, line)).toBeAttached();
  await page.evaluate(
    ({ line: row, visiblePx: keep }) => {
      const el = document.querySelector(`.qf-row[data-anchor="RIGHT:${row}"]`);
      const scroller = document.querySelector(
        '[data-testid="review-scroller"]'
      ) as HTMLElement | null;
      if (!(el && scroller)) {
        return;
      }
      const box = el.getBoundingClientRect();
      const view = scroller.getBoundingClientRect();
      scroller.scrollTop += box.top - view.bottom + keep;
    },
    { line, visiblePx }
  );
  await expect
    .poll(() => rowFraming(page, line))
    .toEqual({
      fullyVisible: false,
      onScreen: true,
    });
}

test("clicking a partially-visible occurrence scrolls it fully into frame", async ({
  page,
}) => {
  await clickToken(page, NEEDLE_ROWS[0], "needle");
  await expect(page.locator("mark.qf-occ-mark").first()).toBeVisible();

  await clipRowAtBottomEdge(page, NEEDLE_ROWS[1], 16);
  await clickToken(page, NEEDLE_ROWS[1], "needle");

  // the match the pointer landed on becomes current, and comes into frame
  await expect(rowAt(page, NEEDLE_ROWS[1])).toHaveClass(ACTIVE_ROW);
  await expect
    .poll(() => rowFraming(page, NEEDLE_ROWS[1]))
    .toEqual({ fullyVisible: true, onScreen: true });
});

test("clicking an already-fully-visible occurrence does not move the viewport", async ({
  page,
}) => {
  await clickToken(page, NEEDLE_ROWS[0], "needle");
  await expect(page.locator("mark.qf-occ-mark").first()).toBeVisible();

  await clipRowAtBottomEdge(page, NEEDLE_ROWS[1], 16);
  await clickToken(page, NEEDLE_ROWS[1], "needle");
  await expect(rowAt(page, NEEDLE_ROWS[1])).toHaveClass(ACTIVE_ROW);
  await expect
    .poll(() => rowFraming(page, NEEDLE_ROWS[1]))
    .toEqual({ fullyVisible: true, onScreen: true });

  const settled = await scrollTopOf(page);
  await clickToken(page, NEEDLE_ROWS[1], "needle");
  await page.waitForTimeout(400);
  expect(await scrollTopOf(page)).toBe(settled);
});

test("clicking an ordinary code line never scrolls, even off the fold", async ({
  page,
}) => {
  await clickToken(page, NEEDLE_ROWS[0], "needle");
  await expect(page.locator("mark.qf-occ-mark").first()).toBeVisible();

  const filler = NEEDLE_ROWS[1] - 1;
  await clipRowAtBottomEdge(page, filler, 16);
  const before = await scrollTopOf(page);

  await clickToken(page, filler, `filler${filler}`);
  await expect(page.locator("mark.qf-occ-mark").first()).toBeVisible();
  await page.waitForTimeout(400);

  expect(await scrollTopOf(page)).toBe(before);
});
