import { setupApp } from "./bridge.ts";
import { expect, test } from "./test.ts";
import type { Page } from "./types.ts";

const FUZZY_LINE_CHIP = /fuzzy\.ts:\d+/;

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

function askPanel(page: Page) {
  return page.getByRole("complementary", { name: "Ask about code" });
}

test("a opens the ask panel when configured; question round-trips", async ({
  page,
}) => {
  await setupApp(page, CONFIGURED);
  await openReview(page);

  await page.keyboard.press("a");
  const panel = askPanel(page);
  await expect(panel).toBeVisible();
  await expect(
    panel.getByText("Whole pull request", { exact: true })
  ).toBeVisible();

  const input = panel.getByLabel("Question");
  await expect(input).toBeFocused();
  await input.fill("What does this PR do?");
  await page.keyboard.press("Enter");

  await expect(panel.getByText("What does this PR do?")).toBeVisible();
  await expect(panel.getByText("renames the retry knob")).toBeVisible();

  const sent = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("e2e:aiAsk") ?? "null")
  );
  expect(sent.question).toBe("What does this PR do?");
  expect(sent.context.diffSummary).toContain("fuzzy.ts");
  expect(sent.context.code).toBeNull();
  expect(sent.context.headSha).toBeTruthy();
  expect(sent.context.owner).toBeTruthy();
});

test("cursor line rides along as context", async ({ page }) => {
  await setupApp(page, CONFIGURED);
  await openReview(page);

  await page.keyboard.press("j");
  await page.keyboard.press("a");
  const panel = askPanel(page);
  await expect(panel.getByText(FUZZY_LINE_CHIP)).toBeVisible();

  await panel.getByLabel("Question").fill("Why this change?");
  await page.keyboard.press("Enter");
  await expect(panel.getByText("renames the retry knob")).toBeVisible();

  const sent = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("e2e:aiAsk") ?? "null")
  );
  expect(sent.context.filePath).toContain("fuzzy.ts");
  expect(sent.context.code).not.toBeNull();
  expect(sent.context.diffSummary).toBeNull();
});

test("provider errors surface inline and asking again works", async ({
  page,
}) => {
  await setupApp(page, { ...CONFIGURED, aiAnswer: "error" });
  await openReview(page);

  await page.keyboard.press("a");
  const panel = askPanel(page);
  await panel.getByLabel("Question").fill("Will this fail?");
  await page.keyboard.press("Enter");

  await expect(panel.getByRole("alert")).toContainText("out of credits");
});

test("escape closes ask; i reopens info; a returns to ask", async ({
  page,
}) => {
  await setupApp(page, CONFIGURED);
  await openReview(page);

  await page.keyboard.press("a");
  await expect(askPanel(page)).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(askPanel(page)).not.toBeVisible();

  await page.keyboard.press("i");
  await expect(askPanel(page)).not.toBeVisible();
  await expect(page.getByText("Pull request", { exact: true })).toBeVisible();

  await page.keyboard.press("a");
  await expect(askPanel(page)).toBeVisible();
});

test("a lands in setup when unconfigured, ask after configuring", async ({
  page,
}) => {
  await setupApp(page);
  await openReview(page);

  await page.keyboard.press("a");
  const dialog = page.getByRole("dialog", { name: "Ask about code" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("API key").fill("nexos-test-key");
  await page.keyboard.press("Enter");
  await dialog.getByLabel("Model").selectOption("gpt-4o");
  await dialog.getByRole("button", { name: "Done" }).click();

  await page.keyboard.press("a");
  await expect(askPanel(page)).toBeVisible();
});
