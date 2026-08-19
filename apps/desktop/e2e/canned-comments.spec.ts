import { setupApp } from "./bridge.ts";
import { expect, test } from "./test.ts";
import type { Page } from "./types.ts";

/**
 * Canned comments complete inline: type the opening of a saved line and the
 * rest is offered under the composer. The keys the panel borrows are the
 * point of most of these — Enter and Escape have to go back to splitting the
 * paragraph and backing out of the composer the moment nothing is offered,
 * because those are the same keys the composer has always used.
 */

function box(page: Page) {
  return page.getByRole("textbox", { name: "Add a review comment…" });
}

function panel(page: Page) {
  return page.locator(".qcs-panel");
}

function rows(page: Page) {
  return page.locator(".qcs-row");
}

/** Two frames, so a mount that has reached the DOM has also reached the pixels
 *  and the browser is no longer mid-commit when the next key arrives. */
function settled(page: Page) {
  return page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      })
  );
}

function caretOffset(page: Page) {
  return page.evaluate(() => document.getSelection()?.anchorOffset ?? -1);
}

/** Press ArrowLeft and wait for the caret to actually move, so a keypress the
 *  browser drops fails here rather than as a confusing assertion downstream. */
async function moveCaretLeft(page: Page) {
  const before = await caretOffset(page);
  await page.keyboard.press("ArrowLeft");
  await expect.poll(() => caretOffset(page)).toBe(before - 1);
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

test("typing the opening of a saved line offers the rest, and Enter takes it", async ({
  page,
}) => {
  await page.keyboard.type("nit");
  await expect(panel(page)).toBeVisible();
  await expect(rows(page)).toHaveCount(1);

  await page.keyboard.press("Enter");
  await expect(box(page)).toContainText("nit: naming");
  await expect(panel(page)).toBeHidden();
});

test("one character is not enough to offer on", async ({ page }) => {
  await page.keyboard.type("n");
  await expect(panel(page)).toBeHidden();
  await page.keyboard.type("i");
  await expect(panel(page)).toBeVisible();
});

test("arrows walk the offers and Enter takes the highlighted one", async ({
  page,
}) => {
  await page.keyboard.press("ControlOrMeta+Semicolon");
  const add = page.getByLabel("Add a canned comment");
  await add.fill("Needs a changelog entry.");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  await expect(box(page)).toBeFocused();

  await page.keyboard.type("Needs a");
  await expect(rows(page)).toHaveCount(2);
  await expect(rows(page).first()).toHaveAttribute("data-selected", "true");

  await page.keyboard.press("ArrowDown");
  await expect(rows(page).nth(1)).toHaveAttribute("data-selected", "true");

  await page.keyboard.press("Enter");
  await expect(box(page)).toContainText("Needs a changelog entry.");
});

test("Escape sends the panel away without closing the composer", async ({
  page,
}) => {
  await page.keyboard.type("nit");
  await expect(panel(page)).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(panel(page)).toBeHidden();
  await expect(box(page)).toBeFocused();
  await expect(box(page)).toContainText("nit");

  // The next keystroke is a new line to complete, so the offer comes back.
  await page.keyboard.type(":");
  await expect(panel(page)).toBeVisible();
});

test("Escape backs out of the composer once nothing is offered", async ({
  page,
}) => {
  await page.keyboard.type("nit");
  await page.keyboard.press("Escape");
  await expect(panel(page)).toBeHidden();

  await page.keyboard.press("Escape");
  await expect(box(page)).toHaveCount(0);
});

test("Enter still splits the paragraph when nothing is offered", async ({
  page,
}) => {
  await page.keyboard.type("no such saved line");
  await expect(panel(page)).toBeHidden();

  await page.keyboard.press("Enter");
  await page.keyboard.type("second paragraph");
  await expect(box(page).locator("p")).toHaveCount(2);
});

test("nothing is offered inside a code block", async ({ page }) => {
  await page.keyboard.type("``` ");
  await page.keyboard.type("nit");
  await expect(box(page).locator("pre")).toBeVisible();
  await expect(panel(page)).toBeHidden();
});

test("nothing is offered mid-line", async ({ page }) => {
  await page.keyboard.type("nit");
  await expect(panel(page)).toBeVisible();

  // An arrow key is handled natively inside the contenteditable, and one
  // pressed in the frame the panel is mounting into is dropped by the browser
  // before it reaches the caret: the caret stays at the end of the line, which
  // is exactly the state this test is trying to leave. Waiting for the mount to
  // paint gives the keypress an editor that can receive it, and moveCaretLeft
  // then proves the caret moved before anything is asserted about the panel.
  await settled(page);
  await moveCaretLeft(page);

  await expect(panel(page)).toBeHidden();
});

test("a line added in the dialog completes in the composer already open", async ({
  page,
}) => {
  await page.keyboard.type("Ship it");
  await expect(panel(page)).toBeHidden();

  await page.keyboard.press("ControlOrMeta+Semicolon");
  const add = page.getByLabel("Add a canned comment");
  await add.fill("Ship it when CI is green.");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");

  await expect(box(page)).toBeFocused();
  await expect(panel(page)).toBeVisible();
  await expect(rows(page).first()).toContainText("Ship it when CI is green.");
});

test("a saved line is offered once, however many times it is added", async ({
  page,
}) => {
  await page.keyboard.press("ControlOrMeta+Semicolon");
  const add = page.getByLabel("Add a canned comment");
  await add.fill("nit: naming");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");

  await page.keyboard.type("nit");
  await expect(rows(page)).toHaveCount(1);
});
