import { setupApp } from "./bridge.ts";
import {
  LEDGER,
  LEDGER_AFTER_APPROVE,
  LEDGER_AFTER_REVIEW,
  LEDGER_SESSION,
} from "./fixtures.ts";
import { expect, test } from "./test.ts";
import type { Page } from "./types.ts";

/**
 * The ledger view derives everything from the mocked ledger_status /
 * ledger_session commands. The queue is one row per feature group
 * (conventional-commit scope, sha fallback); enter opens the group's
 * session on the review surface, where r signs the region under the cursor
 * — signing flips the bridge to the after-review fixture, which is how the
 * spec asserts the keystroke both records the fact (command args in
 * localStorage) and re-derives the number rather than mutating UI state.
 * The clone-path map (nod:repoPaths:v1) is seeded for the returning-user
 * tests and built through the form in the first-visit test.
 */

const openLedger = (page: Page) =>
  page.keyboard.press(
    process.platform === "darwin" ? "Meta+Shift+l" : "Control+Shift+l"
  );

const seedKnownClone = (page: Page) =>
  page.addInitScript(() => {
    localStorage.setItem(
      "nod:repoPaths:v1",
      JSON.stringify({ "me/nod": "/repo/nod" })
    );
    localStorage.setItem("nod:ledgerLastRepo:v1", "me/nod");
  });

test("the queue lists one session per feature group; r signs nothing here", async ({
  page,
}) => {
  await seedKnownClone(page);
  await setupApp(page, {
    ledger: LEDGER,
    watchedRepos: ["me/nod"],
  });
  await expect(page.getByRole("option").first()).toBeVisible();

  await openLedger(page);
  await expect(page.locator('[data-route="ledger"]')).toBeVisible();
  await expect(page.getByRole("option")).toHaveCount(2);
  await expect(page.getByText("0.0%")).toBeVisible();
  // #321 carries scope "ledger"; the direct push falls back to its sha.
  await expect(page.getByText("ledger", { exact: true })).toBeVisible();
  await expect(page.getByText("d1eec70", { exact: true })).toBeVisible();
  await expect(page.getByText("#321", { exact: true })).toBeVisible();
  await expect(page.getByText("1 region · 1 file · 40 lines")).toBeVisible();

  // Signing lives inside the session, not on the queue.
  await page.keyboard.press("r");
  const review = await page.evaluate(() =>
    localStorage.getItem("e2e:ledgerReview")
  );
  expect(review).toBeNull();
});

test("j selects the next group; signing happens inside its session", async ({
  page,
}) => {
  await seedKnownClone(page);
  await setupApp(page, {
    ledger: LEDGER,
    ledgerAfterReview: LEDGER_AFTER_REVIEW,
    ledgerSession: LEDGER_SESSION,
    watchedRepos: ["me/nod"],
  });
  await expect(page.getByRole("option").first()).toBeVisible();

  await openLedger(page);
  await expect(page.getByRole("option")).toHaveCount(2);
  await page.keyboard.press("j");
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-testid="review-scroller"]')).toBeVisible();
  await page.keyboard.press("r");
  const review = await page.evaluate(() =>
    localStorage.getItem("e2e:ledgerReview")
  );
  expect(JSON.parse(review ?? "{}")).toMatchObject({
    target: "src/facts/store.ts:7-12",
  });
});

test("first visit picks a watched repo and sets its clone path once", async ({
  page,
}) => {
  await setupApp(page, { watchedRepos: ["me/nod", "me/site"] });
  await expect(page.getByRole("option").first()).toBeVisible();

  await openLedger(page);
  await expect(
    page.getByRole("listbox", { name: "Watched repositories" })
  ).toBeVisible();
  await expect(page.getByRole("option")).toHaveCount(2);

  await page.keyboard.press("Enter");
  await expect(page.getByText("Where is me/nod cloned?")).toBeVisible();
  await page.getByLabel("Repository path").fill("/repo/nod");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Queue is empty")).toBeVisible();

  const paths = await page.evaluate(() =>
    localStorage.getItem("nod:repoPaths:v1")
  );
  expect(JSON.parse(paths ?? "{}")).toMatchObject({ "me/nod": "/repo/nod" });
});

test("enter opens a session on the review surface and r signs the region", async ({
  page,
}) => {
  await seedKnownClone(page);
  await setupApp(page, {
    ledger: LEDGER,
    ledgerAfterReview: LEDGER_AFTER_REVIEW,
    ledgerSession: LEDGER_SESSION,
    watchedRepos: ["me/nod"],
  });
  await expect(page.getByRole("option").first()).toBeVisible();

  await openLedger(page);
  await expect(page.getByRole("option")).toHaveCount(2);

  await page.keyboard.press("Enter");
  await expect(page.locator('[data-testid="review-scroller"]')).toBeVisible();
  await expect(page.getByText("resolveAnchor")).toBeVisible();
  const sessionArgs = await page.evaluate(() =>
    localStorage.getItem("e2e:ledgerSession")
  );
  expect(JSON.parse(sessionArgs ?? "{}")).toMatchObject({
    repoPath: "/repo/nod",
    targets: ["src/anchors/resolve.ts:1-40"],
  });

  await page.keyboard.press("r");
  const review = await page.evaluate(() =>
    localStorage.getItem("e2e:ledgerReview")
  );
  expect(JSON.parse(review ?? "{}")).toMatchObject({
    repoPath: "/repo/nod",
    target: "src/anchors/resolve.ts:1-40",
  });
  await expect(page.getByText("Session signed off")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("listbox", { name: "Review sessions" })
  ).toBeVisible();
  await expect(page.getByText("87.0%")).toBeVisible();
});

test("a session shows the net diff for a signed-then-edited file", async ({
  page,
}) => {
  await seedKnownClone(page);
  await setupApp(page, {
    ledger: LEDGER,
    ledgerSession: LEDGER_SESSION,
    watchedRepos: ["me/nod"],
  });
  await expect(page.getByRole("option").first()).toBeVisible();

  await openLedger(page);
  await expect(page.getByRole("option")).toHaveCount(2);
  await page.keyboard.press("j");
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-testid="review-scroller"]')).toBeVisible();
  await expect(page.getByText("since ba5e100 → tip 71b0000")).toBeVisible();
  await expect(page.locator(".qf-row-del")).toHaveCount(1);
  await expect(page.locator(".qf-row-add")).toHaveCount(1);

  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("listbox", { name: "Review sessions" })
  ).toBeVisible();
});

test("approving is gated on viewed: v unlocks a, which stamps the topic", async ({
  page,
}) => {
  await seedKnownClone(page);
  await setupApp(page, {
    ledger: LEDGER,
    ledgerAfterApprove: LEDGER_AFTER_APPROVE,
    ledgerSession: LEDGER_SESSION,
    watchedRepos: ["me/nod"],
  });
  await expect(page.getByRole("option").first()).toBeVisible();

  await openLedger(page);
  await expect(page.getByRole("option")).toHaveCount(2);
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-testid="review-scroller"]')).toBeVisible();
  await expect(page.getByText("viewed (0/1)")).toBeVisible();

  // Before every file is viewed, a records nothing.
  await page.keyboard.press("a");
  expect(
    await page.evaluate(() => localStorage.getItem("e2e:ledgerApprove"))
  ).toBeNull();

  await page.keyboard.press("v");
  await expect(page.getByText("viewed (1/1)")).toBeVisible();

  await page.keyboard.press("a");
  const approve = await page.evaluate(() =>
    localStorage.getItem("e2e:ledgerApprove")
  );
  expect(JSON.parse(approve ?? "{}")).toMatchObject({
    repoPath: "/repo/nod",
    topic: "ledger",
  });
  await expect(
    page.getByRole("listbox", { name: "Review sessions" })
  ).toBeVisible();
  await expect(page.getByText("87.0%")).toBeVisible();
  await expect(page.getByRole("option")).toHaveCount(1);
});

test("a multi-file group shows the file tree; clicking a file jumps to it", async ({
  page,
}) => {
  // Extend the canned fixtures with a second file in the #321 group.
  const extraItem = {
    baseline: null,
    endLine: 9,
    newLines: 9,
    path: "src/anchors/anchor.ts",
    provenance: LEDGER.queue[0].provenance,
    startLine: 1,
    topic: "ledger",
  };
  const extraSession = {
    baseline: null,
    patch: "@@ -0,0 +1,2 @@\n+export const makeAnchor = () => {\n+};",
    path: "src/anchors/anchor.ts",
    regions: [{ endLine: 9, startLine: 1 }],
  };
  await seedKnownClone(page);
  await setupApp(page, {
    ledger: { ...LEDGER, queue: [...LEDGER.queue, extraItem] },
    ledgerSession: {
      ...LEDGER_SESSION,
      sessions: [...LEDGER_SESSION.sessions, extraSession],
    },
    watchedRepos: ["me/nod"],
  });
  await expect(page.getByRole("option").first()).toBeVisible();

  await openLedger(page);
  await expect(page.getByRole("option")).toHaveCount(2);

  await page.keyboard.press("Enter");
  await expect(page.locator('[data-testid="review-scroller"]')).toBeVisible();
  await expect(page.locator(".qf-filelist")).toBeVisible();

  await page.locator(".qf-filelist").getByText("anchor.ts").click();
  await expect(
    page.locator('.qf-fsec-head[data-file-index="1"]').first()
  ).toBeVisible();
  await expect(page.getByText("makeAnchor")).toBeVisible();
});

test("escape steps out of the queue to the picker, then to the inbox", async ({
  page,
}) => {
  await seedKnownClone(page);
  await setupApp(page, {
    ledger: LEDGER,
    watchedRepos: ["me/nod"],
  });
  await expect(page.getByRole("option").first()).toBeVisible();

  await openLedger(page);
  await expect(page.getByText("0.0%")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("listbox", { name: "Watched repositories" })
  ).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.locator('[data-route="inbox"]')).toBeVisible();
});
