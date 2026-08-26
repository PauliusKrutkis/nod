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
 * The ledger tab derives everything from the mocked ledger_status /
 * ledger_session commands and is deliberately the inbox's twin: one flat
 * list across watched repos rendered through PRListItem rows (subject as
 * the title, topic on the branch chip, repo in the meta) beside the
 * InboxDetail reading pane carrying coverage, provenance and files. Enter
 * opens the group's session on the review surface — ReviewHeader on top,
 * Approve standing where submit stands — where r signs the region under
 * the cursor; signing flips the bridge to the after-review fixture, which
 * is how the spec asserts the keystroke both records the fact (command
 * args in localStorage) and re-derives the number rather than mutating UI
 * state.
 */

const COVERAGE_ZERO = /Coverage 0\.0%/;
const COVERAGE_87 = /Coverage 87\.0%/;
const APPROVE = /Approve/;

const openLedger = (page: Page) =>
  page.getByRole("button", { name: "Ledger" }).click();

const sessionList = (page: Page) =>
  page.getByRole("listbox", { name: "Review sessions" });

test("the queue lists one row per feature group, styled as inbox rows", async ({
  page,
}) => {
  await setupApp(page, {
    ledger: LEDGER,
    watchedRepos: ["me/nod"],
  });
  await expect(page.getByRole("option").first()).toBeVisible();

  await openLedger(page);
  await expect(page.getByRole("option")).toHaveCount(2);
  // Rows wear the PR row anatomy, titled by identity: a named topic leads
  // with its feature name ("ledger" from the #321 scope), while a bucket
  // (the direct push's sha) leads with the commit subject and wears the
  // bucket on the branch chip.
  const list = sessionList(page);
  await expect(list.getByText("ledger", { exact: true })).toBeVisible();
  await expect(list.getByText("chore: tighten CAS retry")).toBeVisible();
  await expect(list.getByText("d1eec70", { exact: true })).toBeVisible();
  // The reading pane mirrors the row's title and carries the story,
  // coverage, and the group's size.
  await expect(
    page.getByText("feat(ledger): anchor resolver (#321)")
  ).toBeVisible();
  await expect(page.getByText(COVERAGE_ZERO)).toBeVisible();
  await expect(page.locator(".qi-detail-stats").getByText("+40")).toBeVisible();

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

test("empty ledgers across watched repos read as all-read, no setup step", async ({
  page,
}) => {
  await setupApp(page, { watchedRepos: ["me/nod", "me/site"] });
  await expect(page.getByRole("option").first()).toBeVisible();

  await openLedger(page);
  await expect(page.getByText("All read")).toBeVisible();
});

test("enter opens a session on the review surface and r signs the region", async ({
  page,
}) => {
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
  // A session owns the window like the review screen: no tab strip, and
  // the file tree column is there even for a single file.
  await expect(page.getByRole("button", { name: "Ledger" })).toBeHidden();
  await expect(page.locator(".qf-filelist")).toBeVisible();
  await expect(page.getByText("resolveAnchor")).toBeVisible();
  const sessionArgs = await page.evaluate(() =>
    localStorage.getItem("e2e:ledgerSession")
  );
  expect(JSON.parse(sessionArgs ?? "{}")).toMatchObject({
    repoKey: "me/nod",
    targets: ["src/anchors/resolve.ts:1-40"],
  });

  await page.keyboard.press("r");
  const review = await page.evaluate(() =>
    localStorage.getItem("e2e:ledgerReview")
  );
  expect(JSON.parse(review ?? "{}")).toMatchObject({
    repoKey: "me/nod",
    target: "src/anchors/resolve.ts:1-40",
  });
  await expect(page.getByText("Session signed off")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(sessionList(page)).toBeVisible();
  await expect(page.getByText(COVERAGE_87)).toBeVisible();
});

test("a session shows the net diff for a signed-then-edited file", async ({
  page,
}) => {
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
  // The baseline and tip ride the review header's branch chips.
  await expect(page.getByText("ba5e100", { exact: true })).toBeVisible();
  await expect(page.getByText("71b0000", { exact: true })).toBeVisible();
  await expect(page.locator(".qf-row-del")).toHaveCount(1);
  await expect(page.locator(".qf-row-add")).toHaveCount(1);

  await page.keyboard.press("Escape");
  await expect(sessionList(page)).toBeVisible();
});

test("approving is gated on viewed: v arms the Approve button and a stamps", async ({
  page,
}) => {
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
  const approve = page.getByRole("button", { name: APPROVE });
  await expect(approve).toBeDisabled();

  // Before every file is viewed, a records nothing.
  await page.keyboard.press("a");
  expect(
    await page.evaluate(() => localStorage.getItem("e2e:ledgerApprove"))
  ).toBeNull();

  await page.keyboard.press("v");
  await expect(approve).toBeEnabled();

  await page.keyboard.press("a");
  const approved = await page.evaluate(() =>
    localStorage.getItem("e2e:ledgerApprove")
  );
  expect(JSON.parse(approved ?? "{}")).toMatchObject({
    repoKey: "me/nod",
    topic: "ledger",
  });
  await expect(sessionList(page)).toBeVisible();
  await expect(page.getByText(COVERAGE_87)).toBeVisible();
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

test("escape leaves the queue straight to the PR tabs", async ({ page }) => {
  await setupApp(page, {
    ledger: LEDGER,
    watchedRepos: ["me/nod"],
  });
  await expect(page.getByRole("option").first()).toBeVisible();

  await openLedger(page);
  await expect(page.getByText(COVERAGE_ZERO)).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(sessionList(page)).toBeHidden();
  await expect(page.getByRole("option").first()).toBeVisible();
});
