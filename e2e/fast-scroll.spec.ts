/**
 * `f`/`g` jump the cursor by a fixed number of rows; both tests drive them
 * repeatedly through a large diff and read cursor-vs-scroller geometry via
 * `cursorGeometry`, in device pixels relative to `.qf-scrollhost`, so
 * assertions read as "distance from the fold" rather than page coordinates.
 * Each assertion allows one row of slack for sub-pixel rounding on the
 * measured row height. The `g` test walks presses one at a time because most
 * land the cursor mid-viewport and correctly don't scroll at all — only a
 * press that actually moves `scrollTop` is checked against the header +
 * context-rows floor.
 */
import { setupApp } from "./bridge.ts";
import { makeBigDetail } from "./fixtures.ts";
import { expect, test } from "./test.ts";
import type { Page } from "./types.ts";

const BIG_DETAIL = makeBigDetail(
  4,
  400,
  (f, i) => `const value_${f}_${i} = compute(${i} + ${f});`
);

/** Mirrors CURSOR_CONTEXT_ROWS in review-list.tsx. */
const CONTEXT_ROWS = 4;

test.beforeEach(async ({ page }) => {
  await setupApp(page, { detailByLoad: [BIG_DETAIL] });
  await expect(page.getByRole("option").first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator(".qf-diff").first()).toBeVisible();
});

/**
 * Cursor row vs scroller geometry, once scrolling has settled. Reported in
 * device pixels relative to the scroll host so the assertions read as
 * "distance from the fold" rather than page coordinates.
 */
async function cursorGeometry(page: Page) {
  const cursorRow = page.locator(".qf-row-active");
  await expect(cursorRow).toBeVisible();
  let last = Number.NaN;
  await expect
    .poll(async () => {
      const y = (await cursorRow.boundingBox())?.y ?? Number.NaN;
      const settled = Math.abs(y - last) < 0.5;
      last = y;
      return settled;
    })
    .toBe(true);

  const geo = await page.evaluate(() => {
    const host = document.querySelector(".qf-scrollhost");
    const row = document.querySelector(".qf-row-active");
    const sample = document.querySelector(".qf-row:not(.qf-row-hunk)");
    if (!(host && row && sample)) {
      return null;
    }
    const h = host.getBoundingClientRect();
    const r = row.getBoundingClientRect();
    return {
      gapBelow: h.bottom - r.bottom,
      rowPx: sample.getBoundingClientRect().height,
      spaceAbove: r.top - h.top,
    };
  });
  if (!geo) {
    throw new Error("cursor row or scroll host not found");
  }
  return geo;
}

test("f leaves reading context below the cursor and never clips the row", async ({
  page,
}) => {
  for (let i = 0; i < 12; i += 1) {
    await page.keyboard.press("f");
  }
  const geo = await cursorGeometry(page);
  await page.screenshot({ path: "evidence/fastscroll-after.png" });

  expect(geo.gapBelow).toBeGreaterThanOrEqual(0);
  expect(geo.spaceAbove).toBeGreaterThanOrEqual(0);
  expect(geo.gapBelow).toBeGreaterThanOrEqual(geo.rowPx * (CONTEXT_ROWS - 1));
});

test("g leaves reading context above the cursor and never clips the row", async ({
  page,
}) => {
  for (let i = 0; i < 12; i += 1) {
    await page.keyboard.press("f");
  }
  await cursorGeometry(page);

  const scrollTop = () =>
    page.locator(".qf-scrollhost").evaluate((el) => el.scrollTop);

  let landed: Awaited<ReturnType<typeof cursorGeometry>> | null = null;
  for (let i = 0; i < 20 && landed === null; i += 1) {
    const before = await scrollTop();
    await page.keyboard.press("g");
    const geo = await cursorGeometry(page);
    expect(geo.spaceAbove).toBeGreaterThanOrEqual(0);
    if ((await scrollTop()) !== before) {
      landed = geo;
    }
  }
  expect(landed, "no `g` press ever scrolled").not.toBeNull();

  const headerPx = await page
    .locator(".qf-fsec-head")
    .first()
    .evaluate((el) => el.getBoundingClientRect().height);
  expect(landed?.spaceAbove).toBeGreaterThanOrEqual(
    headerPx + (landed?.rowPx ?? 0) * (CONTEXT_ROWS - 1)
  );
});
