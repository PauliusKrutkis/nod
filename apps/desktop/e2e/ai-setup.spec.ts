import { setupApp } from "./bridge.ts";
import { expect, test } from "./test.ts";
import type { Page } from "./types.ts";

const ASK_ABOUT_CODE = "Ask about code";
const SAVE_KEY = "Save key";

const CONFIGURED = {
  aiInfo: {
    baseUrl: "https://api.nexos.ai",
    configured: true,
    model: "gpt-4o",
  },
};

async function openReview(page: Page) {
  await expect(page.getByRole("option").first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator(".qf-fsec-head").first()).toBeVisible();
}

async function openSetupFromPalette(page: Page) {
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByPlaceholder("Run a command…").fill("ai settings");
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: ASK_ABOUT_CODE });
  await expect(dialog).toBeVisible();
  return dialog;
}

test("a opens AI setup with the Nexos preset prefilled", async ({ page }) => {
  await setupApp(page);
  await openReview(page);

  await page.keyboard.press("a");

  const dialog = page.getByRole("dialog", { name: ASK_ABOUT_CODE });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Provider base URL")).toHaveValue(
    "https://api.nexos.ai"
  );
  await expect(
    dialog.getByText("Nothing is sent until you ask.")
  ).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
});

test("pasting a key saves config and loads the model picker", async ({
  page,
}) => {
  await setupApp(page);
  await openReview(page);

  await page.keyboard.press("a");
  const dialog = page.getByRole("dialog", { name: ASK_ABOUT_CODE });
  await dialog.getByLabel("API key").fill("nexos-test-key");
  await page.keyboard.press("Enter");

  const picker = dialog.getByLabel("Model");
  await expect(picker).toBeVisible();
  await expect(dialog.getByLabel("API key")).toHaveCount(0);
  await picker.selectOption("gpt-4o");

  await expect(dialog.getByRole("button", { name: "Done" })).toBeVisible();
  await expect(picker).toBeVisible();

  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("e2e:aiConfig") ?? "null")
  );
  expect(saved).toMatchObject({
    baseUrl: "https://api.nexos.ai",
    model: "gpt-4o",
  });
  expect(saved.apiKey).toBe("");
});

test("preset chips rewrite the base URL", async ({ page }) => {
  await setupApp(page);
  await openReview(page);

  await page.keyboard.press("a");
  const dialog = page.getByRole("dialog", { name: ASK_ABOUT_CODE });
  await dialog.getByRole("button", { name: "OpenRouter" }).click();
  await expect(dialog.getByLabel("Provider base URL")).toHaveValue(
    "https://openrouter.ai/api"
  );
});

test("a saved key reads as a fact, with the model picker already loaded", async ({
  page,
}) => {
  await setupApp(page, CONFIGURED);
  await openReview(page);
  const dialog = await openSetupFromPalette(page);

  await expect(dialog.getByLabel("API key")).toHaveCount(0);
  await expect(dialog.getByText("api.nexos.ai · key saved")).toBeVisible();
  await expect(dialog.getByText("Nexos AI")).toBeVisible();
  await expect(dialog.getByLabel("Model")).toHaveValue("gpt-4o");
  await expect(dialog.getByLabel("Model")).toBeFocused();
});

test("removing the saved key takes two presses", async ({ page }) => {
  await setupApp(page, CONFIGURED);
  await openReview(page);
  const dialog = await openSetupFromPalette(page);

  const remove = dialog.getByRole("button", { name: "Remove", exact: true });
  await remove.click();
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Remove key?" })
  ).toBeVisible();

  await dialog.getByRole("button", { name: "Remove key?" }).click();
  await expect(dialog).not.toBeVisible();
});

test("tab arms the actions and the footer names what enter does", async ({
  page,
}) => {
  await setupApp(page, CONFIGURED);
  await openReview(page);
  const dialog = await openSetupFromPalette(page);

  const hint = dialog.getByRole("status");
  await expect(hint).toContainText("actions");
  await expect(hint).not.toContainText("replace key");

  await page.keyboard.press("Tab");
  await expect(hint).toContainText("replace key");
  await expect(dialog.getByLabel("Model")).toBeFocused();

  await page.keyboard.press("Tab");
  await expect(hint).toContainText("remove key");

  await page.keyboard.press("Tab");
  await expect(hint).toContainText("close");

  await page.keyboard.press("Enter");
  await expect(dialog).not.toBeVisible();
});

test("replace key swaps the row for the key field, and cancel restores it", async ({
  page,
}) => {
  await setupApp(page, CONFIGURED);
  await openReview(page);
  const dialog = await openSetupFromPalette(page);

  await dialog.getByRole("button", { name: "Replace key" }).click();
  await expect(dialog.getByLabel("API key")).toBeFocused();
  await expect(dialog.getByLabel("API key")).toHaveAttribute(
    "placeholder",
    "New key for Nexos AI"
  );
  await expect(dialog.getByLabel("Model")).toHaveCount(0);

  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog.getByLabel("Model")).toHaveValue("gpt-4o");
  await expect(dialog.getByLabel("API key")).toHaveCount(0);
});

test("command palette carries the AI settings entry everywhere", async ({
  page,
}) => {
  await setupApp(page);
  await expect(page.getByRole("option").first()).toBeVisible();

  await page.keyboard.press("ControlOrMeta+k");
  await page.getByPlaceholder("Run a command…").fill("ask about");
  await page.keyboard.press("Enter");

  await expect(
    page.getByRole("dialog", { name: ASK_ABOUT_CODE })
  ).toBeVisible();
  await expect(page.getByRole("button", { name: SAVE_KEY })).toBeVisible();
});

test("saving a replacement key hands the keyboard back to the picker", async ({
  page,
}) => {
  await setupApp(page, CONFIGURED);
  await openReview(page);
  const dialog = await openSetupFromPalette(page);

  await dialog.getByRole("button", { name: "Replace key" }).click();
  await dialog.getByLabel("API key").fill("nexos-replacement");
  await page.keyboard.press("Enter");

  await expect(dialog.getByLabel("Model")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("status")).toContainText("replace key");
});
