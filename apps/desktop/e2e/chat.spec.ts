import { setupApp } from "./bridge.ts";
import { expect, test } from "./test.ts";
import type { Page } from "./types.ts";

const SONNET_OPTION = /claude-sonnet/;
const MODEL_BUTTON = /Model:/;
const DISCARD_FUZZY = /Discard the comment on src\/lib\/fuzzy/;

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
  await page.keyboard.press("ControlOrMeta+l");
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

  await page.keyboard.press("ControlOrMeta+l");
  await expect(page.locator(".qf-drawer")).toHaveAttribute(
    "aria-hidden",
    "false"
  );
  const input = composer(page);
  await expect(input).toBeFocused();

  await input.fill("What does this PR change?");
  await page.keyboard.press("Enter");
  await expect(
    chatPanel(page)
      .locator(".qch-scroll")
      .getByText("What does this PR change?")
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
  await page.keyboard.press("ControlOrMeta+l");
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
  await page.keyboard.press("ControlOrMeta+l");
  await composer(page).fill("Dig into the repo");
  await page.keyboard.press("Enter");

  await expect(chatPanel(page).locator(".qch-trail-now")).toHaveText(
    'Searching for "retry"'
  );
  await expect(chatPanel(page).getByText("Looking.")).toBeVisible();
});

test("the trail opens to what the model actually did", async ({ page }) => {
  await setupApp(page, {
    ...CONFIGURED,
    aiChatAnswer: "Two issues.",
    aiChatScript: [
      { tool: { detail: "Reading the diff", tool: "read_diff" } },
      { reasoning: "Checking the retry ladder first." },
      { tool: { detail: 'Searching for "retry"', tool: "grep_repo" } },
      { delta: "Two issues." },
    ],
  });
  await openReview(page);
  await page.keyboard.press("ControlOrMeta+l");
  await composer(page).fill("Review it");
  await page.keyboard.press("Enter");

  const head = chatPanel(page).locator(".qch-trail-head");
  await expect(head).toContainText("Worked for");
  await expect(chatPanel(page).locator(".qch-trail-step")).toHaveCount(0);

  await head.click();
  await expect(chatPanel(page).locator(".qch-trail-step")).toHaveText([
    "Reading the diff",
    'Searching for "retry"',
  ]);
  await expect(chatPanel(page).locator(".qch-trail-think")).toContainText(
    "Checking the retry ladder"
  );
});

test("reasoning streams while the answer is still forming", async ({
  page,
}) => {
  await setupApp(page, {
    ...CONFIGURED,
    aiChatAnswer: "hang",
    aiChatScript: [{ reasoning: "Weighing the two call sites." }],
  });
  await openReview(page);
  await page.keyboard.press("ControlOrMeta+l");
  await composer(page).fill("Think about it");
  await page.keyboard.press("Enter");

  await expect(chatPanel(page).locator(".qch-trail-head")).toContainText(
    "Working…"
  );
  await chatPanel(page).locator(".qch-trail-head").click();
  await expect(chatPanel(page).locator(".qch-trail-think")).toContainText(
    "Weighing the two call sites"
  );
});

test("an answer carries a copy button and the newest turn shows its time", async ({
  page,
}) => {
  await setupApp(page, CONFIGURED);
  await openReview(page);
  await page.keyboard.press("ControlOrMeta+l");
  await composer(page).fill("When was this?");
  await page.keyboard.press("Enter");
  await expect(
    chatPanel(page).getByText("The retry knob is safe", { exact: false })
  ).toBeVisible();

  await expect(chatPanel(page).locator(".qch-time-on")).toHaveCount(1);
  await page.evaluate(() => {
    const store = { text: "" };
    (window as unknown as { __copied: { text: string } }).__copied = store;
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: (text: string) => {
          store.text = text;
          return Promise.resolve();
        },
      },
    });
  });
  await chatPanel(page).getByRole("button", { name: "Copy answer" }).click();
  const copied = await page.evaluate(
    () => (window as unknown as { __copied: { text: string } }).__copied.text
  );
  expect(copied).toContain("The retry knob is safe");
});

test("a follow-up carries the settled history", async ({ page }) => {
  await setupApp(page, CONFIGURED);
  await openReview(page);
  await page.keyboard.press("ControlOrMeta+l");

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
  await page.keyboard.press("ControlOrMeta+l");
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
  await page.keyboard.press("ControlOrMeta+l");
  await composer(page).fill("Remember me");
  await page.keyboard.press("Enter");
  await expect(
    chatPanel(page).getByText("The retry knob is safe", { exact: false })
  ).toBeVisible();

  await page.reload();
  await expect(page.locator(".qf-fsec-head").first()).toBeVisible();
  await page.keyboard.press("ControlOrMeta+l");
  await expect(
    chatPanel(page).locator(".qch-scroll").getByText("Remember me")
  ).toBeVisible();
  await expect(
    chatPanel(page).getByText("The retry knob is safe", { exact: false })
  ).toBeVisible();
});

test("an error settles as an error card, not a lost turn", async ({ page }) => {
  await setupApp(page, { ...CONFIGURED, aiChatAnswer: "error" });
  await openReview(page);
  await page.keyboard.press("ControlOrMeta+l");
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

  await page.keyboard.press("ControlOrMeta+i");
  await expect(drawer).toHaveAttribute("aria-hidden", "false");
  await expect(
    page.getByRole("heading", { name: "Description" })
  ).toBeVisible();

  await page.keyboard.press("ControlOrMeta+l");
  await expect(composer(page)).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(composer(page)).not.toBeFocused();
  await page.keyboard.press("ControlOrMeta+i");
  await expect(
    page.getByRole("heading", { name: "Description" })
  ).toBeVisible();

  await page.keyboard.press("ControlOrMeta+i");
  await expect(drawer).toHaveAttribute("aria-hidden", "true");
});

test("mod+m closes the chat from inside the composer", async ({ page }) => {
  await setupApp(page, CONFIGURED);
  await openReview(page);
  await page.keyboard.press("ControlOrMeta+l");
  await expect(composer(page)).toBeFocused();

  // The point of the mod: a plain key can never fire while the composer has
  // focus, so a plain `m` could open the panel but not close it.
  await page.keyboard.press("ControlOrMeta+l");
  await expect(page.locator(".qf-drawer")).toHaveAttribute(
    "aria-hidden",
    "true"
  );
});

test("esc in the chat composer returns to the diff; esc again closes the panel", async ({
  page,
}) => {
  await setupApp(page, CONFIGURED);
  await openReview(page);
  await page.keyboard.press("ControlOrMeta+l");
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

  await composer(page).pressSequentially("What is this line for?");
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
  await expect(chatPanel(page).locator(".qcc-chip")).toHaveCount(0);
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
  await expect(chatPanel(page).locator(".qcc-chip")).toHaveCount(1);

  await page
    .getByRole("button", { name: "Remove src/lib/fuzzy.ts:2–4" })
    .click();
  await expect(chatPanel(page).locator(".qcc-chip")).toHaveCount(0);
});

test("backspace removes a chip whole, on the first press", async ({ page }) => {
  await setupApp(page, CONFIGURED);
  await openReview(page);
  await cursorToTuned(page);
  await page.keyboard.press("l");
  await expect(chatPanel(page).locator(".qcc-chip")).toHaveCount(1);

  // Inserting a chip leaves a space after it for typing. One Backspace takes
  // both — a press that visibly does nothing reads as a broken key.
  await page.keyboard.press("Backspace");
  await expect(chatPanel(page).locator(".qcc-chip")).toHaveCount(0);
});

test("clicking a region chip selects those lines back in the diff", async ({
  page,
}) => {
  await setupApp(page, CONFIGURED);
  await openReview(page);
  await cursorToTuned(page);
  await page.keyboard.press("Shift+j");
  await expect(page.locator(".qf-row-selected")).toHaveCount(2);
  await page.keyboard.press("l");
  await expect(chatPanel(page).locator(".qcc-chip")).toHaveCount(1);

  await page.keyboard.press("Escape");
  await page.keyboard.press("j");
  await expect(page.locator(".qf-row-selected")).toHaveCount(0);

  await chatPanel(page).locator(".qcc-chip").click();
  await expect(page.locator(".qf-row-selected")).toHaveCount(2);
  await expect(
    page.locator('.qf-row-active[data-anchor="RIGHT:3"]')
  ).toBeVisible();
});

test("a pasted chip finds its code in the diff", async ({ page }) => {
  await setupApp(page, CONFIGURED);
  await openReview(page);
  await page.keyboard.press("ControlOrMeta+l");
  const paste = (text: string) =>
    page.evaluate((clip) => {
      const el = document.querySelector<HTMLElement>(".qcc-field");
      const data = new DataTransfer();
      data.setData("text/plain", clip);
      el?.dispatchEvent(
        new ClipboardEvent("paste", {
          bubbles: true,
          cancelable: true,
          clipboardData: data,
        })
      );
    }, text);

  // Code the reviewer pasted from somewhere else still belongs to a line in
  // this diff — clicking the chip is how they ask where.
  await composer(page).focus();
  await paste("  // tuned\n  return 2;");
  await expect(chatPanel(page).locator(".qcc-chip")).toHaveCount(1);
  await chatPanel(page).locator(".qcc-chip").click();
  await expect(page.locator(".qf-row-selected")).toHaveCount(2);
  await expect(
    page.locator('.qf-row-active[data-anchor="RIGHT:3"]')
  ).toBeVisible();

  await page.getByRole("button", { name: "Remove pasted code" }).click();
  await expect(chatPanel(page).locator(".qcc-chip")).toHaveCount(0);
});

test("a paste from outside the pull request has nowhere to jump", async ({
  page,
}) => {
  await setupApp(page, CONFIGURED);
  await openReview(page);
  await cursorToTuned(page);
  await page.keyboard.press("ControlOrMeta+l");
  await composer(page).focus();
  await page.evaluate(() => {
    const el = document.querySelector<HTMLElement>(".qcc-field");
    const data = new DataTransfer();
    data.setData("text/plain", "const nothing = true;\nconst here = false;");
    el?.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: data,
      })
    );
  });
  await expect(chatPanel(page).locator(".qcc-chip")).toHaveCount(1);

  // The cursor stays where the reviewer left it — a near-match jump would be
  // a guess, and a wrong one moves them off what they were reading.
  await chatPanel(page).locator(".qcc-chip").click();
  await expect(
    page.locator('.qf-row-active[data-anchor="RIGHT:2"]')
  ).toBeVisible();
});

test("l with no cursor opens the chat focused without a chip", async ({
  page,
}) => {
  await setupApp(page, CONFIGURED);
  await openReview(page);
  await page.keyboard.press("l");
  await expect(composer(page)).toBeFocused();
  await expect(chatPanel(page).locator(".qcc-chip")).toHaveCount(0);
});

test("l inside the composer types the letter instead of chipping", async ({
  page,
}) => {
  await setupApp(page, CONFIGURED);
  await openReview(page);
  await page.keyboard.press("ControlOrMeta+l");
  await composer(page).pressSequentially("l");
  await expect(composer(page)).toHaveText("l");
  await expect(chatPanel(page).locator(".qcc-chip")).toHaveCount(0);
});

test("a chat draft survives closing and reopening the panel", async ({
  page,
}) => {
  await setupApp(page, CONFIGURED);
  await openReview(page);
  await page.keyboard.press("ControlOrMeta+l");
  await composer(page).pressSequentially("half a thought");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.keyboard.press("ControlOrMeta+l");
  await expect(composer(page)).toHaveText("half a thought");
});

test("a multi-line paste becomes a chip; single lines paste as text", async ({
  page,
}) => {
  await setupApp(page, CONFIGURED);
  await openReview(page);
  await page.keyboard.press("ControlOrMeta+l");

  const paste = (text: string) =>
    page.evaluate((clip) => {
      const el = document.querySelector<HTMLElement>(".qcc-field");
      const data = new DataTransfer();
      data.setData("text/plain", clip);
      el?.dispatchEvent(
        new ClipboardEvent("paste", {
          bubbles: true,
          cancelable: true,
          clipboardData: data,
        })
      );
    }, text);

  await composer(page).focus();
  await paste("const a = 1;\nconst b = 2;");
  await expect(chatPanel(page).locator(".qcc-chip")).toHaveCount(1);
  await expect(chatPanel(page).locator(".qcc-chip")).toContainText(
    "pasted code (2 lines)"
  );

  await paste("one line");
  await expect(chatPanel(page).locator(".qcc-chip")).toHaveCount(1);
  await expect(composer(page)).toContainText("one line");

  await composer(page).pressSequentially("What does the pasted code do?");
  await page.keyboard.press("Enter");
  const args = await readChatArgs(page);
  expect(args.regions).toEqual([
    {
      code: "const a = 1;\nconst b = 2;",
      filePath: "",
      lineRange: "",
      side: "",
    },
  ]);
});

test("a message sent mid-turn queues and goes out when the turn settles", async ({
  page,
}) => {
  await setupApp(page, {
    ...CONFIGURED,
    aiChatAnswer: "hang",
    aiChatScript: [{ delta: "Thinking it over. " }],
  });
  await openReview(page);
  await page.keyboard.press("ControlOrMeta+l");
  await composer(page).pressSequentially("first question");
  await page.keyboard.press("Enter");
  await expect(chatPanel(page).getByText("Thinking it over.")).toBeVisible();

  // Enter mid-turn parks the message, visibly, instead of dying.
  await composer(page).pressSequentially("and a follow-up");
  await page.keyboard.press("Enter");
  await expect(
    chatPanel(page).getByText("Next: and a follow-up")
  ).toBeVisible();

  // Stop settles the first turn; the parked one goes out as its own turn.
  await chatPanel(page).getByRole("button", { name: "Stop" }).click();
  await expect
    .poll(async () => {
      const raw = await page.evaluate(() => localStorage.getItem("e2e:aiChat"));
      return (JSON.parse(raw ?? "{}") as { message?: string }).message;
    })
    .toBe("and a follow-up");
  await expect(chatPanel(page).getByText("Next: and a follow-up")).toHaveCount(
    0
  );
});

test("a queued message can be discarded before it sends", async ({ page }) => {
  await setupApp(page, {
    ...CONFIGURED,
    aiChatAnswer: "hang",
    aiChatScript: [{ delta: "Working. " }],
  });
  await openReview(page);
  await page.keyboard.press("ControlOrMeta+l");
  await composer(page).pressSequentially("first");
  await page.keyboard.press("Enter");
  await composer(page).pressSequentially("changed my mind");
  await page.keyboard.press("Enter");
  await expect(
    chatPanel(page).getByText("Next: changed my mind")
  ).toBeVisible();

  await page
    .getByRole("button", { name: "Discard the queued message" })
    .click();
  await expect(chatPanel(page).getByText("Next: changed my mind")).toHaveCount(
    0
  );
});

test("new chat starts a second thread; the picker switches and deletes", async ({
  page,
}) => {
  await setupApp(page, CONFIGURED);
  await openReview(page);
  await page.keyboard.press("ControlOrMeta+l");

  await composer(page).fill("First question");
  await page.keyboard.press("Enter");
  await expect(chatPanel(page).locator(".qch-thread-title")).toHaveText(
    "First question"
  );

  await page.getByRole("button", { name: "New chat" }).click();
  await expect(
    chatPanel(page).locator(".qch-scroll").getByText("First question")
  ).toHaveCount(0);
  // A new chat exists to be typed into.
  await expect(composer(page)).toBeFocused();

  await composer(page).fill("Second topic");
  await page.keyboard.press("Enter");
  await expect(chatPanel(page).locator(".qch-thread-title")).toHaveText(
    "Second topic"
  );

  await chatPanel(page).locator(".qch-thread-current").click();
  const rows = chatPanel(page).locator(".qch-thread-pick");
  await expect(rows).toHaveCount(2);
  await rows.first().click();
  await expect(
    chatPanel(page).locator(".qch-scroll").getByText("First question")
  ).toBeVisible();

  await chatPanel(page).locator(".qch-thread-current").click();
  await page.getByRole("button", { name: "Delete chat Second topic" }).click();
  await expect(chatPanel(page).locator(".qch-thread-pick")).toHaveCount(1);
});

test("threads survive a reload and v1 history migrates into one thread", async ({
  page,
}) => {
  await setupApp(page, CONFIGURED);
  await openReview(page);
  await page.keyboard.press("ControlOrMeta+l");
  await composer(page).fill("Keep this thread");
  await page.keyboard.press("Enter");
  await expect(
    chatPanel(page).getByText("The retry knob is safe", { exact: false })
  ).toBeVisible();

  await page.evaluate(() => {
    const v2 = JSON.parse(localStorage.getItem("nod:chatHistory:v2") ?? "{}");
    const key = Object.keys(v2)[0];
    localStorage.setItem(
      "nod:chatHistory:v1",
      JSON.stringify({ [key]: v2[key][0].turns })
    );
    localStorage.removeItem("nod:chatHistory:v2");
  });
  await page.reload();
  await expect(page.locator(".qf-fsec-head").first()).toBeVisible();
  await page.keyboard.press("ControlOrMeta+l");
  await expect(
    chatPanel(page).locator(".qch-scroll").getByText("Keep this thread")
  ).toBeVisible();
  await expect(chatPanel(page).locator(".qch-thread-title")).toHaveText(
    "Keep this thread"
  );
});

test("the dock edge drags to a new width that survives a reload", async ({
  page,
}) => {
  await setupApp(page, CONFIGURED);
  await openReview(page);
  await page.keyboard.press("ControlOrMeta+i");

  const drawer = page.locator(".qf-drawer");
  const before = await drawer.boundingBox();
  const handle = page.locator(".qf-dock-resize");
  const box = await handle.boundingBox();
  if (!(box && before)) {
    throw new Error("dock not measurable");
  }
  await page.mouse.move(box.x + box.width / 2, box.y + 200);
  await page.mouse.down();
  await page.mouse.move(box.x - 150, box.y + 200);
  await page.mouse.up();

  const after = await drawer.boundingBox();
  expect(Math.round(after?.width ?? 0)).toBeGreaterThan(
    Math.round(before.width) + 100
  );

  await page.reload();
  await expect(page.locator(".qf-fsec-head").first()).toBeVisible();
  await page.keyboard.press("ControlOrMeta+i");
  const restored = await page.locator(".qf-drawer").boundingBox();
  expect(Math.round(restored?.width ?? 0)).toBe(Math.round(after?.width ?? 0));
});

test("the model button swaps the chat's model and the pick rides the send", async ({
  page,
}) => {
  await setupApp(page, CONFIGURED);
  await openReview(page);
  await page.keyboard.press("ControlOrMeta+l");

  const modelButton = page.locator(".qch-model");
  await expect(modelButton).toContainText("gpt-4o");
  await modelButton.click();

  const search = page.getByLabel("Search models");
  await expect(search).toBeFocused();
  await search.fill("claude");
  await page.getByRole("option", { name: SONNET_OPTION }).click();
  await expect(modelButton).toContainText("claude-sonnet");

  await composer(page).fill("Which model are you?");
  await page.keyboard.press("Enter");
  const args = await readChatArgs(page);
  expect(args.model).toBe("claude-sonnet");

  await page.reload();
  await expect(page.locator(".qf-fsec-head").first()).toBeVisible();
  await page.keyboard.press("ControlOrMeta+l");
  await expect(page.locator(".qch-model")).toContainText("claude-sonnet");
});

test("thinking effort rides the request and survives a reload", async ({
  page,
}) => {
  await setupApp(page, CONFIGURED);
  await openReview(page);
  await page.keyboard.press("ControlOrMeta+l");
  await chatPanel(page).getByLabel(MODEL_BUTTON).click();
  await page.getByRole("button", { name: "low", exact: true }).click();

  await composer(page).pressSequentially("quick question");
  await page.keyboard.press("Enter");
  expect((await readChatArgs(page)).effort).toBe("low");

  // The choice is the reviewer's, so it outlives the window.
  await page.reload();
  await expect(page.locator(".qf-fsec-head").first()).toBeVisible();
  await page.keyboard.press("ControlOrMeta+l");
  await composer(page).pressSequentially("another");
  await page.keyboard.press("Enter");
  expect((await readChatArgs(page)).effort).toBe("low");
});

test("the diff rides the request so read_diff has hunks to serve", async ({
  page,
}) => {
  await setupApp(page, CONFIGURED);
  await openReview(page);
  await page.keyboard.press("ControlOrMeta+l");
  await composer(page).fill("Review the diff");
  await page.keyboard.press("Enter");
  const args = await readChatArgs(page);
  const paths = (args.diffs as { path: string }[]).map((d) => d.path);
  expect(paths).toContain("src/lib/fuzzy.ts");
  expect(
    (args.diffs as { patch: string }[]).some((d) => d.patch.includes("@@"))
  ).toBe(true);
});

test("a snapshot still downloading is said out loud in the composer", async ({
  page,
}) => {
  await setupApp(page, { ...CONFIGURED, snapshotState: "downloading" });
  await openReview(page);
  await page.keyboard.press("ControlOrMeta+l");
  await expect(
    chatPanel(page).getByText("Fetching the repository", { exact: false })
  ).toBeVisible();
});

test("/ offers find-skill even when the repo has none of its own", async ({
  page,
}) => {
  await setupApp(page, {
    ...CONFIGURED,
    chatSkills: [
      {
        description: "Find a skill, or write one",
        name: "find-skill",
        source: "built-in",
      },
    ],
  });
  await openReview(page);
  await page.keyboard.press("ControlOrMeta+l");
  await composer(page).pressSequentially("/");
  await expect(chatPanel(page).getByText("find-skill")).toBeVisible();
});

test("skills found only after the snapshot lands still reach the picker", async ({
  page,
}) => {
  await setupApp(page, {
    ...CONFIGURED,
    chatSkills: [
      { description: "Repo conventions", name: "pr-validity", source: "repo" },
    ],
    snapshotState: "downloading",
  });
  await openReview(page);
  await page.keyboard.press("ControlOrMeta+l");
  await page.evaluate(() => {
    (
      window as unknown as { __setSnapshotState: (s: string) => void }
    ).__setSnapshotState("ready");
  });
  await expect
    .poll(async () => {
      await composer(page).fill("");
      await composer(page).pressSequentially("/");
      return await chatPanel(page).locator(".qcs-panel").count();
    })
    .toBe(1);
});

const SKILLS_SETUP = {
  ...CONFIGURED,
  chatSkills: [
    {
      description: "Review against repo conventions",
      name: "pr-validity",
      source: "repo",
    },
    {
      description: "Hunt for security issues",
      name: "security-pass",
      source: "repo",
    },
  ],
};

test("/ lists the repo's skills; arrows and Enter pick one as a chip", async ({
  page,
}) => {
  await setupApp(page, SKILLS_SETUP);
  await openReview(page);
  await page.keyboard.press("ControlOrMeta+l");

  await composer(page).pressSequentially("/");
  const panel = page.locator(".qcs-panel");
  await expect(panel.getByRole("button")).toHaveCount(2);

  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  // The skill lands in the field as a chip, where the code chips are.
  await expect(chatPanel(page).locator(".qcc-chip-skill")).toContainText(
    "/security-pass"
  );
});

test("a typed prefix narrows the skills and the pick rides the send", async ({
  page,
}) => {
  await setupApp(page, SKILLS_SETUP);
  await openReview(page);
  await page.keyboard.press("ControlOrMeta+l");

  await composer(page).pressSequentially("/pr");
  const panel = page.locator(".qcs-panel");
  await expect(panel.getByRole("button")).toHaveCount(1);
  await page.keyboard.press("Enter");
  await expect(chatPanel(page).locator(".qcc-chip-skill")).toContainText(
    "/pr-validity"
  );

  await composer(page).pressSequentially("Run it on this PR");
  await page.keyboard.press("Enter");
  const args = await readChatArgs(page);
  expect(args.skills).toEqual(["pr-validity"]);
  expect(args.message).toBe("Run it on this PR");
  await expect(chatPanel(page).locator(".qcc-chip-skill")).toHaveCount(0);
  await expect(chatPanel(page).getByText("/pr-validity")).toBeVisible();
});

test("the picker says what each skill does, and Tab takes the pick", async ({
  page,
}) => {
  await setupApp(page, SKILLS_SETUP);
  await openReview(page);
  await page.keyboard.press("ControlOrMeta+l");

  await composer(page).pressSequentially("/");
  await expect(page.locator(".qcs-hint").first()).toHaveText(
    "Review against repo conventions"
  );

  // Tab is what every completion menu answers to; Enter still works.
  await page.keyboard.press("Tab");
  await expect(chatPanel(page).locator(".qcc-chip-skill")).toContainText(
    "/pr-validity"
  );

  // What gets typed next continues the line the chip is on.
  await page.keyboard.type("on the auth files");
  const inline = await page.evaluate(() => {
    const chip = document
      .querySelector(".qcc-chip-skill")
      ?.getBoundingClientRect();
    const field = document.querySelector(".qcc-field");
    const text = [...(field?.childNodes ?? [])].find((n) =>
      (n.textContent ?? "").includes("auth")
    );
    if (!(chip && text)) {
      return null;
    }
    const range = document.createRange();
    range.selectNode(text);
    return Math.abs(range.getBoundingClientRect().top - chip.top) < 4;
  });
  expect(inline).toBe(true);
});

test("a skill runs on its own, with nothing typed after it", async ({
  page,
}) => {
  await setupApp(page, SKILLS_SETUP);
  await openReview(page);
  await page.keyboard.press("ControlOrMeta+l");

  await composer(page).pressSequentially("/pr");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");

  const args = await readChatArgs(page);
  expect(args.skills).toEqual(["pr-validity"]);
  expect(args.message).toBe("");
  await expect(chatPanel(page).locator(".qcc-chip-skill")).toHaveCount(0);
});

test("a shy timestamp goes away with the pointer", async ({ page }) => {
  await setupApp(page, { ...CONFIGURED, aiChatAnswer: "First answer." });
  await openReview(page);
  await page.keyboard.press("ControlOrMeta+l");
  await composer(page).pressSequentially("one");
  await page.keyboard.press("Enter");
  await expect(chatPanel(page).getByText("First answer.")).toBeVisible();
  await composer(page).pressSequentially("two");
  await page.keyboard.press("Enter");

  // The newest turn keeps its time; the older one shows it only while the
  // pointer is on it, and stops showing it when the pointer leaves.
  const older = chatPanel(page).locator(".qch-ai").first();
  await expect(older.locator(".qch-time")).toHaveCSS("opacity", "0");
  await older.hover();
  await expect(older.locator(".qch-time")).toHaveCSS("opacity", "1");
  await chatPanel(page).locator(".qch-composer").hover();
  await expect(older.locator(".qch-time")).toHaveCSS("opacity", "0");
});

test("a skill-only thread is named by the skill it ran", async ({ page }) => {
  await setupApp(page, SKILLS_SETUP);
  await openReview(page);
  await page.keyboard.press("ControlOrMeta+l");

  // Nothing was typed, so there is no first line to name the thread with —
  // the skill is what this conversation is.
  await composer(page).pressSequentially("/pr");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(chatPanel(page).locator(".qch-thread-title")).toHaveText(
    "/pr-validity"
  );
});

test("two skills ride one message, in the order they were invoked", async ({
  page,
}) => {
  await setupApp(page, SKILLS_SETUP);
  await openReview(page);
  await page.keyboard.press("ControlOrMeta+l");

  await composer(page).pressSequentially("/security");
  await page.keyboard.press("Tab");
  await composer(page).pressSequentially("/pr");
  await page.keyboard.press("Tab");
  await expect(chatPanel(page).locator(".qcc-chip-skill")).toHaveCount(2);

  // The same skill twice is one chip — invoking it again is not a second run.
  await composer(page).pressSequentially("/pr");
  await page.keyboard.press("Tab");
  await expect(chatPanel(page).locator(".qcc-chip-skill")).toHaveCount(2);

  await composer(page).pressSequentially("both passes please");
  await page.keyboard.press("Enter");
  const args = await readChatArgs(page);
  expect(args.skills).toEqual(["security-pass", "pr-validity"]);
  expect(args.message).toBe("both passes please");
});

test("escape leaves the composer while a turn runs; Stop still stops", async ({
  page,
}) => {
  await setupApp(page, {
    ...CONFIGURED,
    aiChatAnswer: "hang",
    aiChatScript: [{ delta: "Reading the diff" }],
  });
  await openReview(page);
  await page.keyboard.press("ControlOrMeta+l");
  await composer(page).pressSequentially("what changed?");
  await page.keyboard.press("Enter");
  await expect(chatPanel(page).getByText("Reading the diff")).toBeVisible();

  // Esc is the leave key everywhere else; making it stop a run would take
  // "close the chat while it works" away. Stop is the stop.
  await page.keyboard.press("Escape");
  await expect(composer(page)).not.toBeFocused();
  await expect(
    chatPanel(page).getByRole("button", { name: "Stop" })
  ).toBeVisible();

  await chatPanel(page).getByRole("button", { name: "Stop" }).click();
  await expect(
    chatPanel(page).getByRole("button", { name: "Send" })
  ).toBeVisible();
  const cancelled = await page.evaluate(() =>
    localStorage.getItem("e2e:aiChatCancel")
  );
  expect(cancelled).not.toBeNull();
});
test("the skill chip removes; a repo with no skills offers nothing on /", async ({
  page,
}) => {
  await setupApp(page, SKILLS_SETUP);
  await openReview(page);
  await page.keyboard.press("ControlOrMeta+l");

  await composer(page).pressSequentially("/pr");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Remove skill pr-validity" }).click();
  await expect(chatPanel(page).locator(".qcc-chip-skill")).toHaveCount(0);

  // Backspace reaches it too, like any other chip.
  await composer(page).pressSequentially("/pr");
  await expect(page.locator(".qcs-panel")).toHaveCount(1);
  await page.keyboard.press("Enter");
  await expect(chatPanel(page).locator(".qcc-chip-skill")).toHaveCount(1);
  await page.keyboard.press("Backspace");
  await expect(chatPanel(page).locator(".qcc-chip-skill")).toHaveCount(0);

  await composer(page).pressSequentially("/nothing-matches");
  await expect(page.locator(".qcs-panel")).toHaveCount(0);
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
  await page.keyboard.press("ControlOrMeta+l");
  await composer(page).pressSequentially("Review this PR");
  await page.keyboard.press("Enter");
  await expect(chatPanel(page).locator(".qch-staged-go")).toHaveCount(1);
  await expect(
    chatPanel(page).getByRole("button", { name: "Send" })
  ).toBeVisible();
}

test("a proposal lands as a pending comment, and survives a reload", async ({
  page,
}) => {
  await setupApp(page, PROPOSAL_SETUP);
  await openReview(page);
  await stageProposal(page);

  const card = page.locator(".qf-pending");
  await expect(card).toContainText("This constant looks off");
  // One card for every unsent comment — no AI-made differentiation.
  await expect(card).toContainText("Pending");

  await page.reload();
  await expect(page.locator(".qf-fsec-head").first()).toBeVisible();
  await expect(page.locator(".qf-pending")).toContainText(
    "This constant looks off"
  );
});

test("a staged comment submits with the review, no accept step", async ({
  page,
}) => {
  await setupApp(page, PROPOSAL_SETUP);
  await openReview(page);
  await stageProposal(page);

  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.keyboard.press("s");
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("e2e:lastReview") ?? "null")?.comments
            ?.length ?? 0
      )
    )
    .toBe(1);
});

test("the chat lists what it staged and jumps to the line", async ({
  page,
}) => {
  await setupApp(page, PROPOSAL_SETUP);
  await openReview(page);
  await stageProposal(page);

  const row = chatPanel(page).locator(".qch-staged-go");
  await expect(row).toContainText("src/lib/fuzzy.ts:2");
  await expect(row).toContainText("This constant looks off");
  await row.click();
  await expect(
    page.locator('.qf-row-active[data-anchor="RIGHT:2"]')
  ).toBeVisible();
});

test("discarding from the chat removes the comment from the diff", async ({
  page,
}) => {
  await setupApp(page, PROPOSAL_SETUP);
  await openReview(page);
  await stageProposal(page);

  await page.getByRole("button", { name: DISCARD_FUZZY }).click();
  await expect(page.locator(".qf-pending")).toHaveCount(0);
  await expect(chatPanel(page).locator(".qch-staged-go")).toHaveCount(0);
});

test("comment now posts one pending comment without the review", async ({
  page,
}) => {
  await setupApp(page, PROPOSAL_SETUP);
  await openReview(page);
  await stageProposal(page);

  await page.keyboard.press("Escape");
  await page.locator(".qf-pending").hover();
  await page.getByRole("button", { name: "Post this comment now" }).click();

  // The one comment leaves as a standalone review comment; the card goes.
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

test("a pending comment edits in place", async ({ page }) => {
  await setupApp(page, PROPOSAL_SETUP);
  await openReview(page);
  await stageProposal(page);

  await page.locator(".qf-pending").hover();
  await page.getByRole("button", { name: "Edit comment" }).click();
  const editor = page.locator(".qf-pending .tiptap");
  await editor.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("Reworded by hand.");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.locator(".qf-pending")).toContainText("Reworded by hand.");
});

test("hovering a pending comment arms shift+e to edit it", async ({ page }) => {
  await setupApp(page, PROPOSAL_SETUP);
  await openReview(page);
  await stageProposal(page);

  await page.keyboard.press("Escape");
  await page.locator(".qf-pending").hover();
  await page.keyboard.press("Shift+e");
  await expect(page.locator(".qf-pending .tiptap")).toBeVisible();
});

test("hovering a pending comment arms shift+d", async ({ page }) => {
  await setupApp(page, PROPOSAL_SETUP);
  await openReview(page);
  await stageProposal(page);

  await page.keyboard.press("Escape");
  await page.locator(".qf-pending").hover();
  await page.keyboard.press("Shift+d");
  await expect(page.locator(".qf-pending")).toHaveCount(0);
});
