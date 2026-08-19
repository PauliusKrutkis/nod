import { setupApp } from "./bridge.ts";
import { DETAIL, makePr } from "./fixtures.ts";
import { expect, test } from "./test.ts";
import type { Page } from "./types.ts";

/**
 * The stack chip in the review header. The fixture inbox holds one three-PR
 * chain joined by refs (main <- feat/one <- feat/two <- feat/three), with the
 * middle PR listed first so opening the inbox's first row lands mid-stack,
 * which is where the count and the current marker are both interesting.
 * detailByNumber gives each member its own title, so navigating to a row is
 * observable in the header rather than only in the route.
 */

const stackPr = (
  n: number,
  title: string,
  baseRef: string,
  headRef: string,
  updatedAt: string
) => ({ ...makePr(n, title, "alice", updatedAt), baseRef, headRef });

const BOTTOM = stackPr(
  41,
  "Port the review header",
  "main",
  "feat/one",
  "2026-07-02T08:00:00Z"
);
const MIDDLE = stackPr(
  42,
  "Port the review chrome",
  "feat/one",
  "feat/two",
  "2026-07-02T10:00:00Z"
);
const TOP = stackPr(
  43,
  "Port the submit modal",
  "feat/two",
  "feat/three",
  "2026-07-02T09:00:00Z"
);

const STACK_INBOX = {
  assigned: { count: 0, prs: [] },
  created: { count: 0, prs: [] },
  involved: { count: 0, prs: [] },
  reviewRequested: { count: 3, prs: [MIDDLE, TOP, BOTTOM] },
};

const detailFor = (pr: ReturnType<typeof stackPr>) => ({ ...DETAIL, pr });

const DETAIL_BY_NUMBER = {
  41: detailFor(BOTTOM),
  42: detailFor(MIDDLE),
  43: detailFor(TOP),
};

const chip = (page: Page) => page.locator(".qf-stack button").first();
const options = (page: Page) => page.locator(".qf-stack-opt");

async function openMidStack(page: Page) {
  await expect(page.getByRole("option").first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator(".qf-fsec-head").first()).toBeVisible();
}

test("a PR with nothing stacked on it shows no chip", async ({ page }) => {
  await setupApp(page);
  await openMidStack(page);
  await expect(page.locator(".qf-stack")).toHaveCount(0);
});

test.describe("mid-stack", () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page, {
      detailByNumber: DETAIL_BY_NUMBER,
      inbox: STACK_INBOX,
    });
    await openMidStack(page);
  });

  test("the chip counts the detected chain from where you stand", async ({
    page,
  }) => {
    await expect(chip(page)).toHaveText("2 of 3");
    await expect(chip(page)).toHaveAttribute("aria-expanded", "false");
  });

  test("the menu opens on the keyboard and lists the chain in merge order", async ({
    page,
  }) => {
    await chip(page).focus();
    await page.keyboard.press("ArrowDown");

    await expect(chip(page)).toHaveAttribute("aria-expanded", "true");
    await expect(options(page)).toHaveCount(3);
    await expect(options(page).nth(0)).toContainText("#41");
    await expect(options(page).nth(0)).toContainText("Port the review header");
    await expect(options(page).nth(1)).toContainText("#42");
    await expect(options(page).nth(2)).toContainText("#43");

    await expect(options(page).nth(1)).toHaveAttribute("aria-selected", "true");
    await expect(options(page).nth(1).locator(".qf-stack-here")).toHaveCount(1);
    await expect(options(page).nth(0).locator(".qf-stack-here")).toHaveCount(0);
  });

  test("Enter on another entry opens that pull request", async ({ page }) => {
    await chip(page).focus();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowUp");
    await expect(options(page).nth(0)).toHaveAttribute("aria-selected", "true");

    await page.keyboard.press("Enter");

    await expect(page.locator(".qf-pr-title")).toContainText(
      "Port the review header"
    );
    await expect(chip(page)).toHaveText("1 of 3");
    await expect(options(page)).toHaveCount(0);
  });

  test("choosing the row you are already on just closes the menu", async ({
    page,
  }) => {
    await chip(page).focus();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");

    await expect(options(page)).toHaveCount(0);
    await expect(page.locator(".qf-pr-title")).toContainText(
      "Port the review chrome"
    );
  });

  test("Escape closes the menu and leaves the review open", async ({
    page,
  }) => {
    await chip(page).focus();
    await page.keyboard.press("ArrowDown");
    await expect(options(page)).toHaveCount(3);

    await page.keyboard.press("Escape");

    await expect(options(page)).toHaveCount(0);
    await expect(page.locator(".qf-fsec-head").first()).toBeVisible();
  });
});
