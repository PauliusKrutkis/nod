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
  await page.keyboard.press("m");
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
  await page.keyboard.press("m");
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
  await page.keyboard.press("m");
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

test("clicking a region chip selects those lines back in the diff", async ({
  page,
}) => {
  await setupApp(page, CONFIGURED);
  await openReview(page);
  await cursorToTuned(page);
  await page.keyboard.press("Shift+j");
  await expect(page.locator(".qf-row-selected")).toHaveCount(2);
  await page.keyboard.press("l");
  await expect(chatPanel(page).locator(".qch-chip-go")).toHaveCount(1);

  await page.keyboard.press("Escape");
  await page.keyboard.press("j");
  await expect(page.locator(".qf-row-selected")).toHaveCount(0);

  await chatPanel(page).locator(".qch-chip-go").click();
  await expect(page.locator(".qf-row-selected")).toHaveCount(2);
  await expect(
    page.locator('.qf-row-active[data-anchor="RIGHT:3"]')
  ).toBeVisible();
});

test("a pasted chip has nothing to reveal, only a remove", async ({ page }) => {
  await setupApp(page, CONFIGURED);
  await openReview(page);
  await page.keyboard.press("m");
  await composer(page).focus();
  await page.evaluate(() => {
    const el = document.querySelector<HTMLTextAreaElement>(".qch-input");
    const data = new DataTransfer();
    data.setData("text/plain", "const a = 1;\nconst b = 2;");
    el?.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: data,
      })
    );
  });
  await expect(chatPanel(page).locator(".qch-chip")).toHaveCount(1);
  await expect(chatPanel(page).locator(".qch-chip-go")).toHaveCount(0);
  await page.getByRole("button", { name: /Remove pasted code/ }).click();
  await expect(chatPanel(page).locator(".qch-chip")).toHaveCount(0);
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

test("a multi-line paste becomes a chip; single lines paste as text", async ({
  page,
}) => {
  await setupApp(page, CONFIGURED);
  await openReview(page);
  await page.keyboard.press("m");

  const paste = (text: string) =>
    page.evaluate((clip) => {
      const el = document.querySelector<HTMLTextAreaElement>(".qch-input");
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
  await expect(
    chatPanel(page).getByText("pasted code (2 lines)")
  ).toBeVisible();
  await expect(composer(page)).toHaveValue("");

  await paste("one line");
  await expect(chatPanel(page).locator(".qch-foot .qch-chip")).toHaveCount(1);

  await composer(page).fill("What does the pasted code do?");
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

test("new chat starts a second thread; the picker switches and deletes", async ({
  page,
}) => {
  await setupApp(page, CONFIGURED);
  await openReview(page);
  await page.keyboard.press("m");

  await composer(page).fill("First question");
  await page.keyboard.press("Enter");
  await expect(chatPanel(page).locator(".qch-thread-title")).toHaveText(
    "First question"
  );

  await page.getByRole("button", { name: "New chat" }).click();
  await expect(
    chatPanel(page).locator(".qch-scroll").getByText("First question")
  ).toHaveCount(0);

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
  await page.keyboard.press("m");
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
  await page.keyboard.press("m");
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
  await page.keyboard.press("i");

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
  await page.keyboard.press("i");
  const restored = await page.locator(".qf-drawer").boundingBox();
  expect(Math.round(restored?.width ?? 0)).toBe(Math.round(after?.width ?? 0));
});

test("the model button swaps the chat's model and the pick rides the send", async ({
  page,
}) => {
  await setupApp(page, CONFIGURED);
  await openReview(page);
  await page.keyboard.press("m");

  const modelButton = page.locator(".qch-model");
  await expect(modelButton).toContainText("gpt-4o");
  await modelButton.click();

  const search = page.getByLabel("Search models");
  await expect(search).toBeFocused();
  await search.fill("claude");
  await page.getByRole("option", { name: /claude-sonnet/ }).click();
  await expect(modelButton).toContainText("claude-sonnet");

  await composer(page).fill("Which model are you?");
  await page.keyboard.press("Enter");
  const args = await readChatArgs(page);
  expect(args.model).toBe("claude-sonnet");

  await page.reload();
  await expect(page.locator(".qf-fsec-head").first()).toBeVisible();
  await page.keyboard.press("m");
  await expect(page.locator(".qch-model")).toContainText("claude-sonnet");
});

test("the diff rides the request so read_diff has hunks to serve", async ({
  page,
}) => {
  await setupApp(page, CONFIGURED);
  await openReview(page);
  await page.keyboard.press("m");
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
  await page.keyboard.press("m");
  await expect(
    chatPanel(page).getByText("Fetching the repository", { exact: false })
  ).toBeVisible();
});

test("the skills button opens the folder skills live in", async ({ page }) => {
  await setupApp(page, CONFIGURED);
  await openReview(page);
  await page.keyboard.press("m");

  const button = chatPanel(page).locator(".qch-skills-btn");
  await expect(button).toHaveText("Add skills");
  await button.click();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("e2e:revealedPath")))
    .toBe("/tmp/nod/skills");
});

test("the skills button counts what is reachable", async ({ page }) => {
  await setupApp(page, {
    ...CONFIGURED,
    chatSkills: [
      { description: "a", name: "pr-validity" },
      { description: "b", name: "security-pass" },
    ],
  });
  await openReview(page);
  await page.keyboard.press("m");
  await expect(chatPanel(page).locator(".qch-skills-btn")).toHaveText(
    "Skills (2)"
  );
});

test("/ with no skills explains where skills come from", async ({ page }) => {
  await setupApp(page, CONFIGURED);
  await openReview(page);
  await page.keyboard.press("m");
  await composer(page).pressSequentially("/");
  await expect(chatPanel(page).locator(".qch-suggest-empty")).toContainText(
    "No skills yet"
  );
});

test("skills found only after the snapshot lands still reach the picker", async ({
  page,
}) => {
  await setupApp(page, {
    ...CONFIGURED,
    chatSkills: [{ description: "Repo conventions", name: "pr-validity" }],
    snapshotState: "downloading",
  });
  await openReview(page);
  await page.keyboard.press("m");
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
    { description: "Review against repo conventions", name: "pr-validity" },
    { description: "Hunt for security issues", name: "security-pass" },
  ],
};

test("/ lists the repo's skills; arrows and Enter pick one as a chip", async ({
  page,
}) => {
  await setupApp(page, SKILLS_SETUP);
  await openReview(page);
  await page.keyboard.press("m");

  await composer(page).pressSequentially("/");
  const panel = page.locator(".qcs-panel");
  await expect(panel.getByRole("button")).toHaveCount(2);

  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(chatPanel(page).locator(".qch-skill-chip")).toContainText(
    "/security-pass"
  );
  await expect(composer(page)).toHaveValue("");
});

test("a typed prefix narrows the skills and the pick rides the send", async ({
  page,
}) => {
  await setupApp(page, SKILLS_SETUP);
  await openReview(page);
  await page.keyboard.press("m");

  await composer(page).pressSequentially("/pr");
  const panel = page.locator(".qcs-panel");
  await expect(panel.getByRole("button")).toHaveCount(1);
  await page.keyboard.press("Enter");
  await expect(chatPanel(page).locator(".qch-skill-chip")).toContainText(
    "/pr-validity"
  );

  await composer(page).fill("Run it on this PR");
  await page.keyboard.press("Enter");
  const args = await readChatArgs(page);
  expect(args.skill).toBe("pr-validity");
  expect(args.message).toBe("Run it on this PR");
  await expect(
    chatPanel(page).locator(".qch-composer .qch-skill-chip")
  ).toHaveCount(0);
  await expect(chatPanel(page).getByText("/pr-validity")).toBeVisible();
});

test("the skill chip removes; a repo with no skills offers nothing on /", async ({
  page,
}) => {
  await setupApp(page, SKILLS_SETUP);
  await openReview(page);
  await page.keyboard.press("m");

  await composer(page).pressSequentially("/pr");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Remove skill pr-validity" }).click();
  await expect(chatPanel(page).locator(".qch-skill-chip")).toHaveCount(0);

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
  await page.keyboard.press("m");
  await composer(page).fill("Review this PR");
  await page.keyboard.press("Enter");
  await expect(chatPanel(page).locator(".qch-staged-go")).toHaveCount(1);
}

test("a proposal lands as a pending comment, and survives a reload", async ({
  page,
}) => {
  await setupApp(page, PROPOSAL_SETUP);
  await openReview(page);
  await stageProposal(page);

  const card = page.locator(".qf-pending");
  await expect(card).toContainText("This constant looks off");
  await expect(card).toContainText("Suggested");

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

  await page
    .getByRole("button", { name: /Discard the comment on src\/lib\/fuzzy/ })
    .click();
  await expect(page.locator(".qf-pending")).toHaveCount(0);
  await expect(chatPanel(page).locator(".qch-staged-go")).toHaveCount(0);
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
