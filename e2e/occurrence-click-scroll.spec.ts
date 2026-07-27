import { setupApp } from "./bridge.ts";
import { makeBigDetail } from "./fixtures.ts";
import { expect, test } from "./test.ts";
import type { Page } from "./types.ts";

/**
 * One tall file whose `needle` token recurs far enough apart that stepping
 * between matches always crosses the fold — the only shape in which "bring the
 * match into frame" is observable at all. occurrences.spec.ts covers the
 * marking rules themselves on the small default fixture.
 *
 * The gestures under test: a plain click only marks the word (the viewport must
 * hold still, even when the clicked match is half off the fold), and mod+click
 * walks from the clicked word to the neighbouring match and brings it into
 * frame with room around it — on any word, marked already or not.
 */
const NEEDLE_ROWS = [1, 30, 60];
const TALL_DETAIL = makeBigDetail(1, 70, (_file, line) =>
  NEEDLE_ROWS.includes(line)
    ? `const slot${line} = needle;`
    : `const filler${line} = ${line};`
);

const ACTIVE_ROW = /qf-row-active/;
const JUMP_MARGIN_ROWS = 2;

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
 * The midpoint of whatever part of `token` on `line` the scroller actually
 * shows, so the pointer can target a match hanging off the fold.
 */
async function tokenPoint(page: Page, line: number, token: string) {
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
  return point;
}

/** Settle the pointer on `token`, like a real hover. */
async function moveToToken(page: Page, line: number, token: string) {
  const { x, y } = await tokenPoint(page, line, token);
  await page.mouse.move(x, y);
  await page.waitForTimeout(100);
}

/**
 * Click `token` on `line`. `mod` holds Meta across the click — either half of
 * the app's `metaKey || ctrlKey`, on any platform.
 */
async function clickToken(
  page: Page,
  line: number,
  token: string,
  opts?: { mod?: boolean }
) {
  const { x, y } = await tokenPoint(page, line, token);
  await page.mouse.move(x, y);
  await page.waitForTimeout(100);
  if (opts?.mod) {
    await page.keyboard.down("Meta");
  }
  await page.mouse.click(x, y);
  if (opts?.mod) {
    await page.keyboard.up("Meta");
  }
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

/**
 * Clear space between `line`'s row and each edge of the space a reader can
 * actually see, in row heights. `above` measures from the sticky file header
 * rather than the viewport top — the header covers the rows behind it, so
 * counting them as context would hide a jump that landed flush under it.
 */
function rowMarginRows(page: Page, line: number) {
  return page.evaluate((row) => {
    const el = document.querySelector(`.qf-row[data-anchor="RIGHT:${row}"]`);
    const scroller = document.querySelector('[data-testid="review-scroller"]');
    if (!(el && scroller)) {
      return null;
    }
    const box = el.getBoundingClientRect();
    const view = scroller.getBoundingClientRect();
    const head = scroller
      .querySelector(".qf-fsec-head")
      ?.getBoundingClientRect();
    const ceiling = Math.max(view.top, head?.bottom ?? view.top);
    return {
      above: (box.top - ceiling) / box.height,
      below: (view.bottom - box.bottom) / box.height,
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

test("mod+clicking an occurrence walks to the next one, into frame", async ({
  page,
}) => {
  await clickToken(page, NEEDLE_ROWS[0], "needle");
  await expect(page.locator("mark.qf-occ-mark").first()).toBeVisible();

  await clickToken(page, NEEDLE_ROWS[0], "needle", { mod: true });

  await expect(rowAt(page, NEEDLE_ROWS[1])).toHaveClass(ACTIVE_ROW);
  await expect
    .poll(() => rowFraming(page, NEEDLE_ROWS[1]))
    .toEqual({ fullyVisible: true, onScreen: true });

  // it scrolled up from below, so it lands clear of the bottom edge
  const margin = await rowMarginRows(page, NEEDLE_ROWS[1]);
  expect(margin?.below).toBeGreaterThanOrEqual(JUMP_MARGIN_ROWS);
});

test("mod+clicking the last occurrence walks back to the one before it", async ({
  page,
}) => {
  await clickToken(page, NEEDLE_ROWS[0], "needle");
  await expect(page.locator("mark.qf-occ-mark").first()).toBeVisible();

  await page.keyboard.press("n");
  await page.keyboard.press("n");
  await expect(rowAt(page, NEEDLE_ROWS[2])).toHaveClass(ACTIVE_ROW);

  await clickToken(page, NEEDLE_ROWS[2], "needle", { mod: true });

  await expect(rowAt(page, NEEDLE_ROWS[1])).toHaveClass(ACTIVE_ROW);
  await expect
    .poll(() => rowFraming(page, NEEDLE_ROWS[1]))
    .toEqual({ fullyVisible: true, onScreen: true });

  // it scrolled down from above, so it lands clear of the sticky file header
  const margin = await rowMarginRows(page, NEEDLE_ROWS[1]);
  expect(margin?.above).toBeGreaterThanOrEqual(JUMP_MARGIN_ROWS);
});

test("a plain click on a half-clipped occurrence does not move the viewport", async ({
  page,
}) => {
  await clickToken(page, NEEDLE_ROWS[0], "needle");
  await expect(page.locator("mark.qf-occ-mark").first()).toBeVisible();

  await clipRowAtBottomEdge(page, NEEDLE_ROWS[1], 16);
  const before = await scrollTopOf(page);

  await clickToken(page, NEEDLE_ROWS[1], "needle");
  await expect(page.locator("mark.qf-occ-mark").first()).toBeVisible();
  await page.waitForTimeout(400);

  expect(await scrollTopOf(page)).toBe(before);
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

test("mod+clicking a word with nothing marked yet still walks to its next one", async ({
  page,
}) => {
  await expect(page.locator("mark.qf-occ-mark")).toHaveCount(0);

  await clickToken(page, NEEDLE_ROWS[0], "needle", { mod: true });

  await expect(page.locator("mark.qf-occ-mark").first()).toBeVisible();
  await expect(rowAt(page, NEEDLE_ROWS[1])).toHaveClass(ACTIVE_ROW);
});

test("holding mod lights up the word under the pointer, marked or not", async ({
  page,
}) => {
  const painted = () =>
    page.evaluate(() => {
      const registry = (
        CSS as unknown as { highlights: Map<string, Iterable<Range>> }
      ).highlights;
      const highlight = registry.get("qf-occ-link");
      return highlight ? Array.from(highlight, (r) => r.toString()) : [];
    });

  await moveToToken(page, NEEDLE_ROWS[0], "needle");
  expect(await painted()).toEqual([]);
  await expect(page.locator("body.qf-occ-link")).toHaveCount(0);

  // nothing is marked yet, so there is no <mark> to hover — the word still lights
  await page.keyboard.down("Meta");
  await expect(page.locator("body.qf-occ-link")).toHaveCount(1);
  expect(await painted()).toEqual(["needle"]);

  await moveToToken(page, NEEDLE_ROWS[0] + 1, `filler${NEEDLE_ROWS[0] + 1}`);
  expect(await painted()).toEqual([`filler${NEEDLE_ROWS[0] + 1}`]);

  await page.keyboard.up("Meta");
  await expect(page.locator("body.qf-occ-link")).toHaveCount(0);
  expect(await painted()).toEqual([]);
});
