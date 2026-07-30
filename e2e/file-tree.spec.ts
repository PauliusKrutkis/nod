import { setupApp } from "./bridge.ts";
import { expect, test } from "./test.ts";

/**
 * The sidebar has two modes over the same flat file model. Tree is the
 * default; the toggle is remembered. Keyboard file navigation deliberately
 * stays on the flat order — a folder is auto-expanded when the file it holds
 * becomes selected, rather than the cycle skipping collapsed files.
 */
test.beforeEach(async ({ page }) => {
  await setupApp(page);
  await expect(page.getByRole("option").first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator(".qf-fsec-head").first()).toBeVisible();
});

test("the tree groups files under a folder row and indents them", async ({
  page,
}) => {
  const folder = page.locator(".qf-file-dirrow");
  await expect(folder).toHaveCount(1);
  await expect(folder).toContainText("src/lib");

  await expect(page.locator(".qf-file[data-file-index]")).toHaveCount(3);
  const depth = await page
    .locator('.qf-file[data-file-index="0"]')
    .evaluate((el) => (el as HTMLElement).style.getPropertyValue("--qf-depth"));
  expect(depth).toBe("1");
  await page.screenshot({ path: "evidence/file-tree.png" });
});

test("collapsing a folder hides its files; selecting one reopens it", async ({
  page,
}) => {
  await page.locator(".qf-file-dirrow").click();
  await expect(page.locator(".qf-file[data-file-index]")).toHaveCount(0);

  await page.keyboard.press("r");
  await expect(page.locator(".qf-file-active")).toHaveAttribute(
    "data-file-index",
    "1"
  );
  await expect(page.locator(".qf-file[data-file-index]")).toHaveCount(3);
});

test("the flat mode toggle is remembered across a reload", async ({ page }) => {
  await page.getByRole("button", { name: "Show a flat file list" }).click();
  await expect(page.locator(".qf-file-dirrow")).toHaveCount(0);
  await expect(page.locator(".qf-file-dir").first()).toContainText("src/lib/");
  await page.screenshot({ path: "evidence/file-tree-flat.png" });

  await page.reload();
  await expect(page.locator(".qf-fsec-head").first()).toBeVisible();
  await expect(page.locator(".qf-file-dirrow")).toHaveCount(0);
});
