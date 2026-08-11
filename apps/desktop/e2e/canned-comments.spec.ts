import { setupApp } from "./bridge.ts";
import { expect, test } from "./test.ts";
import type { Page } from "./types.ts";

/**
 * Canned comments: a per-user list of sentences kept in localStorage, opened
 * with ⌘; and dropped into the comment box the reviewer was last writing in.
 * The list is editable from the same dialog (type to add, Tab to arm a row,
 * Enter to delete) and survives a reload.
 */

/** The dialog pops in over 130ms, so a still taken the moment it is visible
    catches it mid-animation. */
async function shot(page: Page, name: string) {
  await page.waitForTimeout(200);
  await page.screenshot({ path: `evidence/${name}.png` });
}

function dialog(page: Page) {
  return page.getByRole("dialog", { name: "Canned comments" });
}

function composer(page: Page) {
  return page.getByRole("textbox", { name: "Add a review comment…" });
}

async function openReview(page: Page) {
  await expect(page.getByRole("option").first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator(".qf-fsec-head").first()).toBeVisible();
}

async function openComposer(page: Page) {
  await page.keyboard.press("j");
  await page.keyboard.press("c");
  await expect(composer(page)).toBeFocused();
}

test.beforeEach(async ({ page }) => {
  await setupApp(page);
});

test("mod+; drops the picked line into the open composer", async ({ page }) => {
  await openReview(page);
  await openComposer(page);

  await page.keyboard.press("ControlOrMeta+;");
  await expect(dialog(page)).toBeVisible();
  await shot(page, "canned-picker");

  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");

  await expect(dialog(page)).toHaveCount(0);
  await expect(composer(page)).toBeFocused();
  await expect(composer(page)).toHaveText("Needs a test.");
  await shot(page, "canned-inserted");
});

test("a drawer composer left open behind a closed drawer does not take the line", async ({
  page,
}) => {
  await openReview(page);

  // Closing the drawer from its scrim leaves the box composing, so it stays
  // mounted and laid out behind a panel that is only translated off-screen.
  // Nothing else may be focused afterwards: a second composer taking focus
  // would sit ahead of the stale one and hide the wrong answer.
  await page.keyboard.press("Shift+C");
  await expect(
    page.getByRole("textbox", { name: "Comment on this pull request…" })
  ).toBeFocused();
  await page.getByRole("button", { name: "Close panel" }).click();

  await page.keyboard.press("ControlOrMeta+;");
  await expect(dialog(page).getByText("No comment box is open")).toBeVisible();

  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  const drawerText = await page.evaluate(
    () =>
      document.querySelector(".qf-drawer [contenteditable]")?.textContent ?? ""
  );
  expect(drawerText).toBe("");
});

test("the line lands as its own paragraph under what is already typed", async ({
  page,
}) => {
  await openReview(page);
  await openComposer(page);
  await page.keyboard.type("Two things.");

  await page.keyboard.press("ControlOrMeta+;");
  await expect(dialog(page)).toBeVisible();
  await page.keyboard.press("Enter");

  await expect(composer(page).locator("p")).toHaveText([
    "Two things.",
    "nit: naming",
  ]);
});

test("an inserted line submits as the pending comment's body", async ({
  page,
}) => {
  await openReview(page);
  await openComposer(page);
  await page.keyboard.press("ControlOrMeta+;");
  await page.keyboard.press("Enter");
  await expect(composer(page)).toBeFocused();

  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(page.locator(".qf-pending")).toHaveCount(1);
  await expect(page.getByText("nit: naming")).toBeVisible();
});

test("typing adds a line, Tab arms a row, Enter deletes it, and both persist", async ({
  page,
}) => {
  await openReview(page);
  await openComposer(page);
  await page.keyboard.press("ControlOrMeta+;");

  const input = page.getByLabel("Add a canned comment");
  await expect(input).toBeFocused();
  await input.fill("Please rebase before merging.");
  await page.keyboard.press("Enter");
  await expect(input).toHaveValue("");
  await expect(
    dialog(page).getByRole("button", {
      name: "Delete “Please rebase before merging.”",
    })
  ).toBeVisible();
  await shot(page, "canned-editing");

  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(
    dialog(page).getByRole("button", { name: "Delete “nit: naming”" })
  ).toHaveCount(0);

  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.locator(".qf-fsec-head").first()).toBeVisible();
  await page.keyboard.press("ControlOrMeta+;");
  await expect(
    dialog(page).getByRole("button", {
      name: "Delete “Please rebase before merging.”",
    })
  ).toBeVisible();
  await expect(
    dialog(page).getByRole("button", { name: "Delete “nit: naming”" })
  ).toHaveCount(0);
});

test("with no comment box open the dialog says so and still edits", async ({
  page,
}) => {
  await openReview(page);
  await page.keyboard.press("ControlOrMeta+;");

  await expect(dialog(page).getByText("No comment box is open")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(dialog(page)).toBeVisible();
  await shot(page, "canned-no-composer");
});

test("the palette carries the same entry", async ({ page }) => {
  await openReview(page);
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByPlaceholder("Run a command…").fill("canned");
  await page.keyboard.press("Enter");
  await expect(dialog(page)).toBeVisible();
});
