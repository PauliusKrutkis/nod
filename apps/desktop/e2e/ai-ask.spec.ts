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

/** The inline note lives inside the diff scroller — never a drawer. */
function askNote(page: Page) {
  return page
    .getByTestId("review-scroller")
    .getByRole("complementary", { name: "Ask about code" });
}

test("a with no cursor opens the whole-PR note; question round-trips", async ({
  page,
}) => {
  await setupApp(page, CONFIGURED);
  await openReview(page);

  await page.keyboard.press("a");
  const note = askNote(page);
  await expect(note).toBeVisible();
  await expect(
    note.getByText("Whole pull request", { exact: true })
  ).toBeVisible();

  const input = note.getByLabel("Question");
  await expect(input).toBeFocused();
  await input.fill("What does this PR do?");
  await page.keyboard.press("Enter");

  await expect(note.getByText("What does this PR do?")).toBeVisible();
  await expect(note.getByText("renames the retry knob")).toBeVisible();

  const sent = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("e2e:aiAsk") ?? "null")
  );
  expect(sent.question).toBe("What does this PR do?");
  expect(sent.context.diffSummary).toContain("fuzzy.ts");
  expect(sent.context.code).toBeNull();
});

test("cursor line: the note anchors under the row and code rides along", async ({
  page,
}) => {
  await setupApp(page, CONFIGURED);
  await openReview(page);

  await page.keyboard.press("j");
  await page.keyboard.press("a");
  const note = askNote(page);
  await expect(note.getByText(FUZZY_LINE_CHIP)).toBeVisible();

  await note.getByLabel("Question").fill("Why this change?");
  await page.keyboard.press("Enter");
  await expect(note.getByText("renames the retry knob")).toBeVisible();

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
  const note = askNote(page);
  await note.getByLabel("Question").fill("Will this fail?");
  await page.keyboard.press("Enter");

  await expect(note.getByRole("alert")).toContainText("out of credits");
});

test("escape closes the note; a at the same spot resumes the conversation", async ({
  page,
}) => {
  await setupApp(page, CONFIGURED);
  await openReview(page);

  await page.keyboard.press("j");
  await page.keyboard.press("a");
  const note = askNote(page);
  await note.getByLabel("Question").fill("What does this PR do?");
  await page.keyboard.press("Enter");
  await expect(note.getByText("renames the retry knob")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(note).not.toBeVisible();

  await page.keyboard.press("a");
  await expect(note).toBeVisible();
  await expect(note.getByText("renames the retry knob")).toBeVisible();
});

test("start comment from this prefills the composer at the ask's line", async ({
  page,
}) => {
  await setupApp(page, CONFIGURED);
  await openReview(page);

  await page.keyboard.press("j");
  await page.keyboard.press("a");
  const note = askNote(page);
  await note.getByLabel("Question").fill("Why this change?");
  await page.keyboard.press("Enter");
  await expect(note.getByText("renames the retry knob")).toBeVisible();

  await note.getByRole("button", { name: "Start comment from this" }).click();
  await expect(note).not.toBeVisible();

  const editor = page.getByRole("textbox", { name: "Add a review comment…" });
  await expect(editor).toBeVisible();
  await expect(editor).toContainText("renames the retry knob");

  await page.getByRole("button", { name: "Add to review" }).click();
  await expect(page.locator(".qf-pending")).toContainText(
    "renames the retry knob"
  );
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
  await expect(askNote(page)).toBeVisible();
});
