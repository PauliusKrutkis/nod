import { setupApp } from "./bridge.ts";
import { expect, test } from "./test.ts";
import type { Page } from "./types.ts";

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

function chatPanel(page: Page) {
  return page.locator(".qch-panel");
}

function composer(page: Page) {
  return page.getByRole("textbox", { name: "Message" });
}

async function readChatArgs(page: Page) {
  const raw = await page.evaluate(() => localStorage.getItem("e2e:aiChat"));
  return JSON.parse(raw ?? "{}");
}

test("m with no key configured opens AI setup instead of the chat", async ({
  page,
}) => {
  await setupApp(page);
  await openReview(page);
  await page.keyboard.press("m");
  await expect(
    page.getByRole("dialog", { name: "Ask about code" })
  ).toBeVisible();
  await expect(page.locator(".qf-drawer")).toHaveAttribute(
    "aria-hidden",
    "true"
  );
});

test("m opens the chat tab focused; a message round-trips with PR context", async ({
  page,
}) => {
  await setupApp(page, CONFIGURED);
  await openReview(page);

  await page.keyboard.press("m");
  await expect(page.locator(".qf-drawer")).toHaveAttribute(
    "aria-hidden",
    "false"
  );
  const input = composer(page);
  await expect(input).toBeFocused();

  await input.fill("What does this PR change?");
  await page.keyboard.press("Enter");
  await expect(
    chatPanel(page).getByText("What does this PR change?")
  ).toBeVisible();
  await expect(
    chatPanel(page).getByText("The retry knob is safe", { exact: false })
  ).toBeVisible();

  const args = await readChatArgs(page);
  expect(args.message).toBe("What does this PR change?");
  expect(args.chatId).toContain("#");
  expect(args.history).toEqual([]);
  expect(args.context.prTitle).toBe("Add fuzzy matching to search");
  expect(args.context.diffSummary).toContain("src/lib/fuzzy.ts");
});

test("scripted deltas stream into the transcript before the answer settles", async ({
  page,
}) => {
  await setupApp(page, {
    ...CONFIGURED,
    aiChatAnswer: "First half and the rest.",
    aiChatScript: [{ delta: "First half " }, { delta: "and the rest." }],
  });
  await openReview(page);
  await page.keyboard.press("m");
  await composer(page).fill("Stream it");
  await page.keyboard.press("Enter");

  await expect(
    chatPanel(page).getByText("First half and the rest.")
  ).toBeVisible();
  await expect(chatPanel(page).locator(".qch-tool")).toHaveCount(0);
});

test("tool activity shows while the model is working the repo", async ({
  page,
}) => {
  await setupApp(page, {
    ...CONFIGURED,
    aiChatAnswer: "hang",
    aiChatScript: [
      { delta: "Looking. " },
      { tool: { detail: 'Searching for "retry"', tool: "grep_repo" } },
    ],
  });
  await openReview(page);
  await page.keyboard.press("m");
  await composer(page).fill("Dig into the repo");
  await page.keyboard.press("Enter");

  await expect(chatPanel(page).locator(".qch-tool")).toHaveText(
    'Searching for "retry"'
  );
  await expect(chatPanel(page).getByText("Looking.")).toBeVisible();
});

test("a follow-up carries the settled history", async ({ page }) => {
  await setupApp(page, CONFIGURED);
  await openReview(page);
  await page.keyboard.press("m");

  await composer(page).fill("First question");
  await page.keyboard.press("Enter");
  await expect(
    chatPanel(page).getByText("The retry knob is safe", { exact: false })
  ).toBeVisible();

  await composer(page).fill("Second question");
  await page.keyboard.press("Enter");
  await expect(chatPanel(page).getByText("Second question")).toBeVisible();

  const args = await readChatArgs(page);
  expect(args.message).toBe("Second question");
  expect(args.history).toEqual([
    { content: "First question", role: "user" },
    {
      content: "The retry knob is safe — see `src/retry.ts:2`.",
      role: "assistant",
    },
  ]);
});

test("stop cancels the turn and keeps what streamed", async ({ page }) => {
  await setupApp(page, {
    ...CONFIGURED,
    aiChatAnswer: "hang",
    aiChatScript: [{ delta: "Partial thought" }],
  });
  await openReview(page);
  await page.keyboard.press("m");
  await composer(page).fill("Never finishes");
  await page.keyboard.press("Enter");

  await expect(chatPanel(page).getByText("Partial thought")).toBeVisible();
  await page.getByRole("button", { name: "Stop" }).click();
  const cancel = await page.evaluate(() =>
    localStorage.getItem("e2e:aiChatCancel")
  );
  expect(JSON.parse(cancel ?? "{}").chatId).toContain("#");
});

test("the conversation survives a reload", async ({ page }) => {
  await setupApp(page, CONFIGURED);
  await openReview(page);
  await page.keyboard.press("m");
  await composer(page).fill("Remember me");
  await page.keyboard.press("Enter");
  await expect(
    chatPanel(page).getByText("The retry knob is safe", { exact: false })
  ).toBeVisible();

  await page.reload();
  await expect(page.locator(".qf-fsec-head").first()).toBeVisible();
  await page.keyboard.press("m");
  await expect(chatPanel(page).getByText("Remember me")).toBeVisible();
  await expect(
    chatPanel(page).getByText("The retry knob is safe", { exact: false })
  ).toBeVisible();
});

test("an error settles as an error card, not a lost turn", async ({ page }) => {
  await setupApp(page, { ...CONFIGURED, aiChatAnswer: "error" });
  await openReview(page);
  await page.keyboard.press("m");
  await composer(page).fill("Break please");
  await page.keyboard.press("Enter");
  await expect(chatPanel(page).getByRole("alert")).toContainText(
    "AI provider error (402)"
  );
});

test("i and m share the panel: tabs switch, second press of the owner closes", async ({
  page,
}) => {
  await setupApp(page, CONFIGURED);
  await openReview(page);
  const drawer = page.locator(".qf-drawer");

  await page.keyboard.press("i");
  await expect(drawer).toHaveAttribute("aria-hidden", "false");
  await expect(
    page.getByRole("heading", { name: "Description" })
  ).toBeVisible();

  await page.keyboard.press("m");
  await expect(composer(page)).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(composer(page)).not.toBeFocused();
  await page.keyboard.press("i");
  await expect(
    page.getByRole("heading", { name: "Description" })
  ).toBeVisible();

  await page.keyboard.press("i");
  await expect(drawer).toHaveAttribute("aria-hidden", "true");
});

test("esc in the chat composer returns to the diff; esc again closes the panel", async ({
  page,
}) => {
  await setupApp(page, CONFIGURED);
  await openReview(page);
  await page.keyboard.press("m");
  await expect(composer(page)).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(composer(page)).not.toBeFocused();
  await expect(page.locator(".qf-drawer")).toHaveAttribute(
    "aria-hidden",
    "false"
  );

  await page.keyboard.press("Escape");
  await expect(page.locator(".qf-drawer")).toHaveAttribute(
    "aria-hidden",
    "true"
  );
});

/** Seat the cursor on "// tuned" (RIGHT:2) — the first j only reveals the
 *  cursor, so wait for it before stepping. */
async function cursorToTuned(page: Page) {
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

test("l adds the cursor line as a chip and the region rides the send", async ({
  page,
}) => {
  await setupApp(page, CONFIGURED);
  await openReview(page);
  await cursorToTuned(page);

  await page.keyboard.press("l");
  await expect(composer(page)).toBeFocused();
  await expect(chatPanel(page).getByText("src/lib/fuzzy.ts:2")).toBeVisible();

  await composer(page).fill("What is this line for?");
  await page.keyboard.press("Enter");
  const args = await readChatArgs(page);
  expect(args.regions).toEqual([
    {
      code: "  // tuned",
      filePath: "src/lib/fuzzy.ts",
      lineRange: "2",
      side: "RIGHT",
    },
  ]);
  await expect(chatPanel(page).locator(".qch-foot .qch-chip")).toHaveCount(0);
});

test("l with a selection chips the whole range; chips dedupe and remove", async ({
  page,
}) => {
  await setupApp(page, CONFIGURED);
  await openReview(page);
  await cursorToTuned(page);
  await page.keyboard.press("Shift+j");
  await page.keyboard.press("Shift+j");
  await expect(page.locator(".qf-row-selected")).toHaveCount(3);

  await page.keyboard.press("l");
  const chip = chatPanel(page).getByText("src/lib/fuzzy.ts:2–4");
  await expect(chip).toBeVisible();

  await page.keyboard.press("Escape");
  await page.keyboard.press("l");
  await expect(chatPanel(page).locator(".qch-foot .qch-chip")).toHaveCount(1);

  await page
    .getByRole("button", { name: "Remove src/lib/fuzzy.ts:2–4" })
    .click();
  await expect(chatPanel(page).locator(".qch-foot .qch-chip")).toHaveCount(0);
});

test("l with no cursor opens the chat focused without a chip", async ({
  page,
}) => {
  await setupApp(page, CONFIGURED);
  await openReview(page);
  await page.keyboard.press("l");
  await expect(composer(page)).toBeFocused();
  await expect(chatPanel(page).locator(".qch-foot .qch-chip")).toHaveCount(0);
});

test("l inside the composer types the letter instead of chipping", async ({
  page,
}) => {
  await setupApp(page, CONFIGURED);
  await openReview(page);
  await page.keyboard.press("m");
  await composer(page).pressSequentially("l");
  await expect(composer(page)).toHaveValue("l");
  await expect(chatPanel(page).locator(".qch-foot .qch-chip")).toHaveCount(0);
});

test("a chat draft survives closing and reopening the panel", async ({
  page,
}) => {
  await setupApp(page, CONFIGURED);
  await openReview(page);
  await page.keyboard.press("m");
  await composer(page).fill("half a thought");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.keyboard.press("m");
  await expect(composer(page)).toHaveValue("half a thought");
});

const PROPOSAL_SETUP = {
  ...CONFIGURED,
  aiChatAnswer: "Staged one suggestion for you.",
  aiChatScript: [
    {
      proposal: {
        body: "This constant looks off — should it be 3?",
        line: 2,
        path: "src/lib/fuzzy.ts",
        side: "RIGHT",
        startLine: null,
      },
    },
  ],
};

async function stageProposal(page: Page) {
  await page.keyboard.press("m");
  await composer(page).fill("Review this PR");
  await page.keyboard.press("Enter");
  await expect(
    chatPanel(page).getByText("1 suggested comment in the diff")
  ).toBeVisible();
}

test("a proposal stages a suggested comment and survives a reload", async ({
  page,
}) => {
  await setupApp(page, PROPOSAL_SETUP);
  await openReview(page);
  await stageProposal(page);

  await page.reload();
  await expect(page.locator(".qf-fsec-head").first()).toBeVisible();
  await page.keyboard.press("m");
  await expect(
    chatPanel(page).getByText("1 suggested comment in the diff")
  ).toBeVisible();
});

test("accept all turns suggestions into ordinary pending comments", async ({
  page,
}) => {
  await setupApp(page, PROPOSAL_SETUP);
  await openReview(page);
  await stageProposal(page);

  await page.getByRole("button", { name: "Accept all" }).click();
  await expect(
    chatPanel(page).getByText("1 suggested comment in the diff")
  ).toHaveCount(0);
  await expect(page.locator(".qf-pending")).toBeVisible();
  await expect(page.locator(".qf-pending")).toContainText(
    "This constant looks off"
  );
});

test("a suggestion renders in the diff at its anchor, in the AI material", async ({
  page,
}) => {
  await setupApp(page, PROPOSAL_SETUP);
  await openReview(page);
  await stageProposal(page);

  const card = page.locator(".qf-suggested");
  await expect(card).toBeVisible();
  await expect(card).toContainText("This constant looks off");
  await expect(card).toContainText("Suggested comment");
  await expect(page.locator(".qf-pending")).toHaveCount(0);
});

test("accepting the card converts it into a pending comment in place", async ({
  page,
}) => {
  await setupApp(page, PROPOSAL_SETUP);
  await openReview(page);
  await stageProposal(page);

  await page.getByRole("button", { name: "Accept", exact: true }).click();
  await expect(page.locator(".qf-suggested")).toHaveCount(0);
  await expect(page.locator(".qf-pending")).toContainText(
    "This constant looks off"
  );
});

test("editing the card opens the composer prefilled and drops the suggestion", async ({
  page,
}) => {
  await setupApp(page, PROPOSAL_SETUP);
  await openReview(page);
  await stageProposal(page);

  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.locator(".qf-suggested")).toHaveCount(0);
  const editor = page.locator(".qf-comment-wrap .tiptap");
  await expect(editor).toContainText("This constant looks off");
});

test("discarding the card removes it and nothing reaches pending", async ({
  page,
}) => {
  await setupApp(page, PROPOSAL_SETUP);
  await openReview(page);
  await stageProposal(page);

  await page
    .locator(".qf-suggested")
    .getByRole("button", { name: "Discard" })
    .click();
  await expect(page.locator(".qf-suggested")).toHaveCount(0);
  await expect(page.locator(".qf-pending")).toHaveCount(0);
});

test("discard all drops the batch without touching pending comments", async ({
  page,
}) => {
  await setupApp(page, PROPOSAL_SETUP);
  await openReview(page);
  await stageProposal(page);

  await page.getByRole("button", { name: "Discard all" }).click();
  await expect(
    chatPanel(page).getByText("1 suggested comment in the diff")
  ).toHaveCount(0);
  await expect(page.locator(".qf-pending")).toHaveCount(0);
});
