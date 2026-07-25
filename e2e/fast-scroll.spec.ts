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
  // Far enough down that every further `f` has to scroll rather than coast.
  for (let i = 0; i < 12; i += 1) {
    await page.keyboard.press("f");
  }
  const geo = await cursorGeometry(page);
  await page.screenshot({ path: "evidence/fastscroll-after.png" });

  // Fully visible: the row's own box sits inside the scroller on both edges.
  expect(geo.gapBelow).toBeGreaterThanOrEqual(0);
  expect(geo.spaceAbove).toBeGreaterThanOrEqual(0);

  // …and with real context below it, not parked on the fold. One row of
  // slack is allowed for sub-pixel rounding on the measured row height.
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

  // Most `g` presses land the cursor mid-viewport and correctly don't scroll
  // at all; walk up until one actually nudges, then check where it parked.
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

  // Clear of the sticky file header, which overlays the top of the scroller.
  const headerPx = await page
    .locator(".qf-fsec-head")
    .first()
    .evaluate((el) => el.getBoundingClientRect().height);
  expect(landed?.spaceAbove).toBeGreaterThanOrEqual(
    headerPx + (landed?.rowPx ?? 0) * (CONTEXT_ROWS - 1)
  );
});
