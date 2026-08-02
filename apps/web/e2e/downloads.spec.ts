import { expect, type Page, test } from "@playwright/test";

/**
 * /downloads resolves one download for the visitor's own platform and keeps
 * every other build one click away. The build is live GitHub data, so nothing
 * here asserts a version, a size, or a note — only structure and behaviour.
 *
 * Most platform assertions strip navigator.userAgentData first. Chromium
 * synthesises a client hint from an overridden user agent and gets it wrong
 * for anything it can't parse, which would test Chromium rather than the
 * page; stripping it also matches WebKit, which has no UA-CH at all.
 */

const USER_AGENTS = {
  macOS:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
  Windows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  Linux:
    "Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0",
};

const DARWIN_WEBVIEW_UA = "Mozilla/5.0 (Darwin; arm64) AppleWebKit/605.1.15";

const COPY_BUTTON_PATTERN = /copy/i;

const BREW_INSTALL_PATTERN = /^brew install /;

async function dropClientHints(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "userAgentData", {
      configurable: true,
      value: undefined,
    });
  });
}

function activeOption(page: Page) {
  return page.locator(".dl__option[data-active]");
}

for (const [platform, userAgent] of Object.entries(USER_AGENTS)) {
  test(`offers the ${platform} build to a ${platform} visitor`, async ({
    browser,
  }) => {
    const context = await browser.newContext({ userAgent });
    const page = await context.newPage();
    await dropClientHints(page);
    await page.goto("/downloads");

    await expect(activeOption(page)).toHaveAttribute("data-platform", platform);
    await expect(activeOption(page).locator(".dl__btn")).toContainText(
      `Download for ${platform}`
    );
    await expect(page.locator(".dl__option[data-active]")).toHaveCount(1);

    await context.close();
  });
}

test("reads the client hint in preference to the user agent string", async ({
  browser,
}) => {
  const context = await browser.newContext({
    userAgent: USER_AGENTS.Windows,
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "userAgentData", {
      configurable: true,
      value: { platform: "Linux" },
    });
  });
  await page.goto("/downloads");

  await expect(activeOption(page)).toHaveAttribute("data-platform", "Linux");

  await context.close();
});

test("does not mistake a Darwin webview for Windows", async ({ browser }) => {
  const context = await browser.newContext({ userAgent: DARWIN_WEBVIEW_UA });
  const page = await context.newPage();
  await dropClientHints(page);
  await page.goto("/downloads");

  await expect(activeOption(page)).toHaveAttribute("data-platform", "macOS");

  await context.close();
});

test("keeps the built-in default when the platform is unrecognised", async ({
  browser,
}) => {
  const context = await browser.newContext({ userAgent: "SomeFutureOS/1.0" });
  const page = await context.newPage();
  await dropClientHints(page);
  await page.goto("/downloads");

  await expect(activeOption(page)).toHaveCount(1);
  await expect(activeOption(page).locator(".dl__btn")).toBeVisible();

  await context.close();
});

for (const [platform, userAgent] of Object.entries(USER_AGENTS)) {
  const shouldSeeNote = platform === "macOS";

  test(`${shouldSeeNote ? "shows" : "hides"} the notarization step for a ${platform} visitor`, async ({
    browser,
  }) => {
    const context = await browser.newContext({ userAgent });
    const page = await context.newPage();
    await dropClientHints(page);
    await page.goto("/downloads");

    const note = activeOption(page).locator(".dl__note");
    if (shouldSeeNote) {
      await expect(note).toContainText("System Settings");
    } else {
      await expect(note).toHaveCount(0);
    }

    await context.close();
  });
}

test("lists every build grouped under its platform, each named once", async ({
  page,
}) => {
  await page.goto("/downloads");
  await page.locator(".dl__summary").click();

  const headings = await page.locator(".dl__group-head").allInnerTexts();
  expect(headings.length).toBeGreaterThan(0);
  expect(new Set(headings).size).toBe(headings.length);

  for (const heading of headings) {
    const group = page.locator(".dl__group").filter({
      has: page.getByRole("heading", { name: heading, exact: true }),
    });
    await expect(group.locator(".dl__item")).not.toHaveCount(0);
    await expect(group.locator(".dl__item").first()).not.toContainText(heading);
  }
});

test("points every download at a published release asset", async ({ page }) => {
  await page.goto("/downloads");
  await page.locator(".dl__summary").click();

  const hrefs = await page
    .locator(".dl__item, .dl__btn, .dl__alt a")
    .evaluateAll((links) => links.map((link) => link.getAttribute("href")));

  expect(hrefs.length).toBeGreaterThan(0);
  for (const href of hrefs) {
    expect(href).toContain("/releases/download/");
  }
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("still offers a download and every other build", async ({ page }) => {
    await page.goto("/downloads");

    await expect(activeOption(page)).toHaveCount(1);
    await expect(activeOption(page).locator(".dl__btn")).toBeVisible();

    await page.locator(".dl__summary").click();
    await expect(page.locator(".dl__group-head")).not.toHaveCount(0);
    await expect(page.locator(".dl__item").first()).toBeVisible();
  });
});

test.describe("the Homebrew copy button", () => {
  test.use({ permissions: ["clipboard-read", "clipboard-write"] });

  test("copies every command, not just the install line", async ({ page }) => {
    await page.goto("/downloads");
    await page.getByRole("button", { name: COPY_BUTTON_PATTERN }).click();

    const copied = await page.evaluate(() => navigator.clipboard.readText());
    const lines = copied.split("\n");

    expect(lines[0]).toMatch(BREW_INSTALL_PATTERN);
    expect(lines).toHaveLength(await page.locator(".cmd__line").count());
    await expect(page.locator(".cmd")).toHaveAttribute(
      "data-copy-state",
      "copied"
    );
  });
});

test("says so visibly when the clipboard is blocked", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error("blocked")) },
    });
  });
  await page.goto("/downloads");
  await page.getByRole("button", { name: COPY_BUTTON_PATTERN }).click();

  await expect(page.locator(".cmd")).toHaveAttribute(
    "data-copy-state",
    "failed"
  );
  await expect(page.locator(".cmd__status")).toBeVisible();
  await expect(page.locator(".cmd__status")).toContainText("Couldn't copy");
});
