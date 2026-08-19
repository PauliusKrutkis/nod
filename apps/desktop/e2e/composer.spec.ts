import { setupApp } from "./bridge.ts";
import { expect, test } from "./test.ts";
import type { Page } from "./types.ts";

/**
 * The rich composer: a WYSIWYG surface that submits markdown. ⌘B/⌘I/⌘E
 * toggle real formatting (no symbols on the surface), ⌘K links the selection
 * through an inline url input, markdown typing shortcuts autoconvert, and the
 * suggestion block round-trips to the ```suggestion fence both hosts apply.
 */

function box(page: Page) {
  return page.getByRole("textbox", { name: "Add a review comment…" });
}

test.beforeEach(async ({ page }) => {
  await setupApp(page);
  await expect(page.getByRole("option").first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator(".qf-fsec-head").first()).toBeVisible();
  await page.keyboard.press("j");
  await page.keyboard.press("c");
  await expect(box(page)).toBeFocused();
});

test("mod+b bolds the selection for real — no symbols on the surface", async ({
  page,
}) => {
  const ed = box(page);
  await page.keyboard.type("make this bold");
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("ControlOrMeta+b");
  await expect(ed.locator("strong")).toHaveText("make this bold");
  await expect(ed).not.toContainText("**");
  await expect(page.getByRole("button", { name: "Bold" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
});

test("markdown typing shortcuts still resolve — muscle memory keeps working", async ({
  page,
}) => {
  const ed = box(page);
  await page.keyboard.type("**bold** and *italic* prose");
  await expect(ed.locator("strong")).toHaveText("bold");
  await expect(ed.locator("em")).toHaveText("italic");
  await expect(ed).not.toContainText("*");
});

test("mod+k links the selection via the inline url input", async ({ page }) => {
  const ed = box(page);
  await page.keyboard.type("docs");
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("ControlOrMeta+k");
  await expect(page.locator(".qc-input")).toHaveCount(0);
  const url = page.getByLabel("Link URL");
  await expect(url).toBeFocused();
  await url.fill("https://example.com");
  await page.keyboard.press("Enter");
  await expect(ed.locator('a[href="https://example.com"]')).toHaveText("docs");
});

test("rich text serializes to markdown on submit — bold survives the wire", async ({
  page,
}) => {
  await page.keyboard.type("ship it");
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("ControlOrMeta+b");
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(page.getByText("Pending")).toBeVisible();
  await expect(page.locator(".qf-pending strong")).toHaveText("ship it");
});

test("the suggestion block round-trips: insert, edit in place, pending card", async ({
  page,
}) => {
  const ed = box(page);
  await page.getByRole("button", { name: "Insert suggestion" }).click();
  const sugg = ed.locator("pre code.language-suggestion");
  await expect(sugg).toHaveText("export function alpha() {");
  await expect(ed).toBeFocused();
  await page.keyboard.type(" // tighten");
  await expect(sugg).toHaveText("export function alpha() { // tighten");
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(page.getByText("Pending")).toBeVisible();
  await expect(page.locator(".qf-pending .md-suggestion-line")).toHaveText(
    "export function alpha() { // tighten"
  );
});

test("mod+shift+g inserts the block with the caret at the end — nothing pre-selected", async ({
  page,
}) => {
  const ed = box(page);
  await page.keyboard.press("ControlOrMeta+Shift+g");
  const sugg = ed.locator("pre code.language-suggestion");
  await expect(sugg).toHaveText("export function alpha() {");
  await expect(ed).toBeFocused();
  await page.keyboard.type(" // note");
  await expect(sugg).toHaveText("export function alpha() { // note");
});

test("esc backs out of the composer without leaving the review", async ({
  page,
}) => {
  await page.keyboard.type("draft");
  await page.keyboard.press("Escape");
  await expect(box(page)).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Add fuzzy matching to search" })
  ).toBeVisible();
});

test("tab still flips the batch/now mode from inside the editor", async ({
  page,
}) => {
  await page.keyboard.type("x");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("radio", { name: "Comment now" })
  ).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("radio", { name: "Add to review" })
  ).toHaveAttribute("aria-checked", "true");
});

test("tab indents inside a suggestion block instead of flipping the mode", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Insert suggestion" }).click();
  const sugg = box(page).locator("pre code.language-suggestion");
  await expect(sugg).toHaveText("export function alpha() {");

  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await page.keyboard.type("done");
  await expect
    .poll(() => sugg.evaluate((el) => el.textContent))
    .toContain("export function alpha() {\n  done");
  await expect(
    page.getByRole("radio", { name: "Add to review" })
  ).toHaveAttribute("aria-checked", "true");

  await page.keyboard.press("Shift+Tab");
  await expect
    .poll(() => sugg.evaluate((el) => el.textContent))
    .toContain("export function alpha() {\ndone");
  await expect(
    page.getByRole("radio", { name: "Add to review" })
  ).toHaveAttribute("aria-checked", "true");
});

test("suggestion tokens light as the file's language; a selection lifts them while it stands", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Insert suggestion" }).click();
  const sugg = box(page).locator("pre code.language-suggestion");
  await expect(sugg).toHaveText("export function alpha() {");
  await expect(sugg.locator(".hljs-keyword").first()).toHaveText("export");
  await expect(sugg.locator(".hljs-title").first()).toHaveText("alpha");

  await page.keyboard.press("ControlOrMeta+a");
  await expect(sugg.locator(".hljs-keyword")).toHaveCount(0);

  await page.keyboard.press("ArrowRight");
  await expect(sugg.locator(".hljs-keyword").first()).toHaveText("export");
});

test("shift+d discards the pending comment the cursor sits on", async ({
  page,
}) => {
  await page.keyboard.type("drop me");
  await page.keyboard.press("ControlOrMeta+Enter");
  const pending = page.locator(".qf-pending");
  await expect(pending).toHaveCount(1);
  await expect(page.getByText("drop me")).toBeVisible();
  await page.screenshot({ path: "evidence/discard-button.png" });

  await page.keyboard.press("Shift+d");
  await expect(pending).toHaveCount(0);
  await expect(page.getByText("drop me")).toHaveCount(0);
});

test("the discard button removes the pending comment too", async ({ page }) => {
  await page.keyboard.type("click to drop");
  await page.keyboard.press("ControlOrMeta+Enter");
  const pending = page.locator(".qf-pending");
  await expect(pending).toHaveCount(1);

  await page.getByRole("button", { name: "Discard comment" }).click();
  await expect(pending).toHaveCount(0);
});

test("discarding the last pending comment leaves the cursor on its line", async ({
  page,
}) => {
  await page.keyboard.type("drop me");
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(page.locator(".qf-pending")).toHaveCount(1);

  await page.keyboard.press("Shift+d");
  await expect(page.locator(".qf-pending")).toHaveCount(0);

  await page.keyboard.press("j");
  await expect(page.locator(".qf-row-active")).toHaveAttribute(
    "data-file-index",
    "0"
  );
});

test("only the last pending card advertises its hotkeys", async ({ page }) => {
  await page.keyboard.type("first");
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(page.locator(".qf-pending")).toHaveCount(1);

  await page.keyboard.press("c");
  await expect(box(page)).toBeFocused();
  await page.keyboard.type("second");
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(page.locator(".qf-pending")).toHaveCount(2);

  const cards = page.locator(".qf-pending");
  const tip = page.getByRole("tooltip");

  await cards.last().getByRole("button", { name: "Edit comment" }).hover();
  await expect(tip).toHaveCount(1);
  await expect(tip.locator(".q-kbd-combo")).toHaveCount(1);

  await page.mouse.move(0, 0);
  await expect(tip).toHaveCount(0);

  await cards.first().getByRole("button", { name: "Edit comment" }).hover();
  await expect(tip).toHaveCount(1);
  await expect(tip.locator(".q-kbd-combo")).toHaveCount(0);
});

test.describe("the tool strip's keys", () => {
  test.use({ permissions: ["clipboard-read", "clipboard-write"] });

  test("shift+y copies the pending comment under the cursor", async ({
    page,
  }) => {
    await page.keyboard.type("worth a second look");
    await page.keyboard.press("ControlOrMeta+Enter");
    await expect(page.locator(".qf-pending")).toHaveCount(1);

    await page.keyboard.press("Shift+y");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      "worth a second look"
    );
    await expect(page.getByText("Copied comment")).toBeVisible();
  });

  test("shift+p posts the pending comment on its own", async ({ page }) => {
    await page.keyboard.type("posting just this one");
    await page.keyboard.press("ControlOrMeta+Enter");
    await expect(page.locator(".qf-pending")).toHaveCount(1);

    await page.keyboard.press("Shift+p");

    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as unknown as { __calls?: Record<string, number> }).__calls
              ?.create_review_comment ?? 0
        )
      )
      .toBe(1);
    await expect(page.locator(".qf-pending")).toHaveCount(0);
  });
});
