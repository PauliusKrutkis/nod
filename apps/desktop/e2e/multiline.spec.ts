import { setupApp } from "./bridge.ts";
import { expect, test } from "./test.ts";

test.beforeEach(async ({ page }) => {
  await setupApp(page);
  await expect(page.getByRole("option").first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator(".qf-fsec-head").first()).toBeVisible();
});

/** Seat the cursor on "// tuned" (RIGHT:2). The first j only REVEALS the
 *  cursor (rAF-coalesced moves discard the delta on reveal), so wait for it
 *  before stepping. */
async function cursorToTuned(page: import("@playwright/test").Page) {
  await page.keyboard.press("j");
  await expect(
    page.locator('.qf-row-active[data-anchor="RIGHT:1"]')
  ).toBeVisible();
  await page.keyboard.press("j");
  await page.keyboard.press("j");
  await expect(
    page.locator('.qf-row-active[data-anchor="RIGHT:2"]')
  ).toBeVisible();
}

test("shift+j grows the range; c comments on it with a multi-line suggestion", async ({
  page,
}) => {
  await cursorToTuned(page);
  await page.keyboard.press("Shift+j");
  await page.keyboard.press("Shift+j");
  await expect(page.locator(".qf-row-selected")).toHaveCount(3);

  await page.keyboard.press("c");
  await expect(page.locator(".qf-range-head")).toHaveText("Lines 2–4");
  const ed = page.getByRole("textbox", { name: "Add a review comment…" });
  await expect(ed).toBeFocused();

  await page.getByRole("button", { name: "Insert suggestion" }).click();
  const sugg = ed.locator("pre code.language-suggestion");
  await expect(sugg).toContainText("// tuned");
  await expect(sugg).toContainText("return 2;");
  await expect(sugg).toContainText("}");

  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(page.locator(".qf-range-tag")).toHaveText("Lines 2–4");
  await expect(page.locator(".qf-pending .md-suggestion-line")).toHaveCount(3);
});

test("the submitted review payload carries the range start", async ({
  page,
}) => {
  await cursorToTuned(page);
  await page.keyboard.press("Shift+j");
  await page.keyboard.press("c");
  const ed = page.getByRole("textbox", { name: "Add a review comment…" });
  await expect(ed).toBeFocused();
  await page.keyboard.type("tighten this pair");
  await page.keyboard.press("ControlOrMeta+Enter"); // add to review
  await expect(page.getByText("Pending")).toBeVisible();

  await page.keyboard.press("s");
  await page.keyboard.press("ControlOrMeta+Enter"); // submit (COMMENT verdict)
  await expect
    .poll(async () =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem("e2e:lastReview") ?? "null")
      )
    )
    .toMatchObject({
      comments: [
        { line: 3, path: "src/lib/fuzzy.ts", side: "RIGHT", startLine: 2 },
      ],
    });
});

test("extension steps over the other side instead of dead-ending on it", async ({
  page,
}) => {
  await page.keyboard.press("j");
  await expect(
    page.locator('.qf-row-active[data-anchor="RIGHT:1"]')
  ).toBeVisible();

  await page.keyboard.press("Shift+j");
  await expect(
    page.locator('.qf-row-selected[data-anchor="RIGHT:1"]')
  ).toBeVisible();
  await expect(
    page.locator('.qf-row-selected[data-anchor="RIGHT:2"]')
  ).toBeVisible();

  await page.keyboard.press("c");
  await expect(page.locator(".qf-range-head")).toHaveText("Lines 1–2");
});

test("a range that stepped over a deletion sends one side to the host", async ({
  page,
}) => {
  await page.keyboard.press("j");
  await expect(
    page.locator('.qf-row-active[data-anchor="RIGHT:1"]')
  ).toBeVisible();
  await page.keyboard.press("Shift+j");

  await page.keyboard.press("c");
  const ed = page.getByRole("textbox", { name: "Add a review comment…" });
  await expect(ed).toBeFocused();
  await page.keyboard.type("both of these");
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(page.getByText("Pending")).toBeVisible();

  await page.keyboard.press("s");
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect
    .poll(async () =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem("e2e:lastReview") ?? "null")
      )
    )
    .toMatchObject({
      comments: [
        { line: 2, path: "src/lib/fuzzy.ts", side: "RIGHT", startLine: 1 },
      ],
    });
});

test("shift+k shrinks back over the anchor and the range collapses", async ({
  page,
}) => {
  await cursorToTuned(page);
  await page.keyboard.press("Shift+j");
  await expect(page.locator(".qf-row-selected")).toHaveCount(2);
  await page.keyboard.press("Shift+k");
  await expect(page.locator(".qf-row-selected")).toHaveCount(0);
});

test("plain j collapses the range; esc clears it without leaving the review", async ({
  page,
}) => {
  await cursorToTuned(page);
  await page.keyboard.press("Shift+j");
  await expect(page.locator(".qf-row-selected")).toHaveCount(2);
  await page.keyboard.press("j");
  await expect(page.locator(".qf-row-selected")).toHaveCount(0);

  await page.keyboard.press("Shift+j");
  await expect(page.locator(".qf-row-selected")).toHaveCount(2);
  await page.keyboard.press("Escape");
  await expect(page.locator(".qf-row-selected")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Add fuzzy matching to search" })
  ).toBeVisible();
});

test("dragging the gutter + selects the range and opens the composer", async ({
  page,
}) => {
  const from = page.locator(
    '.qf-row[data-file-index="0"][data-anchor="RIGHT:2"]'
  );
  const to = page.locator(
    '.qf-row[data-file-index="0"][data-anchor="RIGHT:4"]'
  );
  await from.hover();
  const btn = from.locator(".qf-add-btn");
  await expect(btn).toBeVisible();

  const start = await btn.boundingBox();
  const end = await to.boundingBox();
  if (!(start && end)) {
    throw new Error("rows not laid out");
  }
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, {
    steps: 6,
  });
  await expect(page.locator(".qf-row-selected")).toHaveCount(3);
  await expect(to.locator(".qf-add-btn")).toHaveCSS("display", "grid");
  await expect(to.locator(".qf-add-btn")).toHaveCSS("opacity", "1");
  await expect(btn).toHaveCSS("opacity", "0");
  await page.mouse.up();

  await expect(page.locator(".qf-range-head")).toHaveText("Lines 2–4");
  await expect(
    page.getByRole("textbox", { name: "Add a review comment…" })
  ).toBeFocused();
});

test("a plain + click still opens the single-line composer", async ({
  page,
}) => {
  const row = page.locator(
    '.qf-row[data-file-index="0"][data-anchor="RIGHT:2"]'
  );
  await row.hover();
  await row.locator(".qf-add-btn").click();
  await expect(
    page.getByRole("textbox", { name: "Add a review comment…" })
  ).toBeVisible();
  await expect(page.locator(".qf-range-head")).toHaveCount(0);
});

test("a pending range survives leaving and reopening the PR", async ({
  page,
}) => {
  await cursorToTuned(page);
  await page.keyboard.press("Shift+j");
  await page.keyboard.press("c");
  await expect(
    page.getByRole("textbox", { name: "Add a review comment…" })
  ).toBeFocused();
  await page.keyboard.type("keep this range");
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(page.locator(".qf-range-tag")).toHaveText("Lines 2–3");

  await page.keyboard.press("Escape"); // back to inbox
  await expect(page.getByRole("option").first()).toBeVisible();
  await page.keyboard.press("Enter"); // reopen
  await expect(page.locator(".qf-range-tag")).toHaveText("Lines 2–3");
});

/** Sweep a native text selection across two code rows and release, the way a
 *  pointer drag over code does. */
async function dragSelectRows(
  page: import("@playwright/test").Page,
  fromAnchor: string,
  toAnchor: string
) {
  await page.evaluate(
    ({ from, to }) => {
      const cell = (anchor: string) =>
        document
          .querySelector(`.qf-row[data-anchor="${anchor}"]`)
          ?.querySelector(".qf-code");
      const start = cell(from);
      const end = cell(to);
      if (!(start && end)) {
        throw new Error("rows not rendered");
      }
      const range = document.createRange();
      range.setStart(start, 0);
      range.setEnd(end, end.childNodes.length);
      const selection = document.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      document.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    },
    { from: fromAnchor, to: toAnchor }
  );
}

test("dragging across code rows arms the same range shift+j builds", async ({
  page,
}) => {
  await dragSelectRows(page, "RIGHT:1", "RIGHT:3");
  await expect(page.locator(".qf-row-selected")).toHaveCount(4);
  await expect(
    page.locator('.qf-row-active[data-anchor="RIGHT:3"]')
  ).toBeVisible();

  await page.keyboard.press("c");
  await expect(page.getByText("Lines 1–3")).toBeVisible();
});

test("a drag inside one row leaves the range alone", async ({ page }) => {
  await dragSelectRows(page, "RIGHT:2", "RIGHT:2");
  await expect(page.locator(".qf-row-selected")).toHaveCount(0);
});

test("clicking clears the drag range, even inside the selection", async ({
  page,
}) => {
  await dragSelectRows(page, "RIGHT:1", "RIGHT:3");
  await expect(page.locator(".qf-row-selected")).toHaveCount(4);

  // A click inside the highlighted run is the awkward one: the browser can
  // hold the old selection until mouseup so the text can be dragged, so the
  // range cannot be decided by reading the selection at that moment.
  const target = page
    .locator('.qf-row[data-anchor="RIGHT:2"] .qf-code')
    .first();
  const box = await target.boundingBox();
  if (!box) {
    throw new Error("row not measurable");
  }
  await page.mouse.move(box.x + 20, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.up();
  await expect(page.locator(".qf-row-selected")).toHaveCount(0);
});

test("a selection cleared by anything else takes the range with it", async ({
  page,
}) => {
  await dragSelectRows(page, "RIGHT:1", "RIGHT:3");
  await expect(page.locator(".qf-row-selected")).toHaveCount(4);

  // Not a click — the selection simply goes away (another surface takes it,
  // the page collapses it). The rows follow it out.
  await page.evaluate(() => document.getSelection()?.removeAllRanges());
  await expect(page.locator(".qf-row-selected")).toHaveCount(0);
});
