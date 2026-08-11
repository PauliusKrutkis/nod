/**
 * Evidence stills for the configured setup dialog: the saved-connection state
 * with the model picker loaded, an armed action with the footer naming what
 * Enter does, the two-step remove, and the replace-key state. Output:
 * capture-out/aisetup/*.png.
 */

import { join } from "node:path";
import { setupApp } from "../bridge.ts";
import { expect, test } from "../test.ts";
import type { Page } from "../types.ts";

const OUT = join("capture-out", "aisetup");

const CONFIGURED = {
  aiInfo: {
    baseUrl: "https://api.nexos.ai",
    configured: true,
    model: "gpt-4o",
  },
};

async function openSetup(page: Page) {
  await expect(page.getByRole("option").first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator(".qf-fsec-head").first()).toBeVisible();
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByPlaceholder("Run a command…").fill("ai settings");
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Ask about code" });
  await expect(dialog).toBeVisible();
  return dialog;
}

test("configured setup dialog", async ({ page }) => {
  await setupApp(page, CONFIGURED);
  const dialog = await openSetup(page);
  await page.mouse.move(0, 0);
  await expect(dialog.getByLabel("Model")).toHaveValue("gpt-4o");
  await dialog.screenshot({ path: join(OUT, "saved.png") });

  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await dialog.screenshot({ path: join(OUT, "armed-remove.png") });

  await page.keyboard.press("Enter");
  await expect(
    dialog.getByRole("button", { name: "Remove key?" })
  ).toBeVisible();
  await dialog.screenshot({ path: join(OUT, "remove-confirm.png") });
});

test("replace key state", async ({ page }) => {
  await setupApp(page, CONFIGURED);
  const dialog = await openSetup(page);
  await page.mouse.move(0, 0);
  await dialog.getByRole("button", { name: "Replace key" }).click();
  await expect(dialog.getByLabel("API key")).toBeFocused();
  await dialog.screenshot({ path: join(OUT, "replace.png") });
});

test("first run", async ({ page }) => {
  await setupApp(page, {});
  const dialog = await openSetup(page);
  await page.mouse.move(0, 0);
  await dialog.screenshot({ path: join(OUT, "first-run.png") });
});
