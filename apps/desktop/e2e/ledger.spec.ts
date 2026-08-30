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
 * list across watched repos rendered through PRListItem rows beside the
 * InboxDetail reading pane. Rows are titled by identity — a named topic
 * leads with its feature name and wears its fact-minted #N, while a bucket
 * (a direct push's sha) leads with the commit subject and wears the bucket
 * on the branch chip; the sole author shows as the forge login when the
 * noreply email or the ledger_commit_authors mock names one, the git name
 * otherwise. Enter opens the group's session on the review surface —
 * ReviewHeader on top, Approve standing where submit stands, the info dock
 * behind mod+i — where r signs the region under the cursor.
 *
 * Mutations are optimistic, and the bridge is built to prove both halves:
 * signing/approving flips it to the after-review/after-approve fixture, so
 * a re-derive (not UI mutation) explains the new numbers; posted comments
 * accumulate in the mock and `ledgerMutationDelayMs` holds the sidecar
 * reply open, so a thread visible before the delay elapses can only have
 * painted from the optimistic cache.
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
  const list = sessionList(page);
  await expect(list.getByText("ledger", { exact: true })).toBeVisible();
  await expect(list.getByText("chore: tighten CAS retry")).toBeVisible();
  await expect(list.getByText("d1eec70", { exact: true })).toBeVisible();
  await expect(list.getByText("#1", { exact: true })).toBeVisible();
  await expect(
    page.getByText("feat(ledger): anchor resolver (#321)")
  ).toBeVisible();
  await expect(page.getByText(COVERAGE_ZERO)).toBeVisible();
  await expect(page.locator(".qi-detail-stats").getByText("+40")).toBeVisible();

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

test("e archives a group until it updates; z undoes; u browses archived", async ({
  page,
}) => {
  await setupApp(page, {
    ledger: LEDGER,
    watchedRepos: ["me/nod"],
  });
  await expect(page.getByRole("option").first()).toBeVisible();

  await openLedger(page);
  await expect(page.getByRole("option")).toHaveCount(2);
  const list = sessionList(page);

  await page.keyboard.press("e");
  await expect(page.getByRole("option")).toHaveCount(1);
  await expect(list.getByText("ledger", { exact: true })).toBeHidden();

  await page.keyboard.press("z");
  await expect(page.getByRole("option")).toHaveCount(2);

  await page.keyboard.press("e");
  await page.keyboard.press("u");
  await expect(page.getByText("restores")).toBeVisible();
  await expect(list.getByText("ledger", { exact: true })).toBeVisible();
  await page.keyboard.press("e");
  await expect(page.getByText("Nothing archived")).toBeVisible();
  await page.keyboard.press("u");
  await expect(page.getByRole("option")).toHaveCount(2);
});

test("an archived group stays archived across a reload", async ({ page }) => {
  await setupApp(page, {
    ledger: LEDGER,
    watchedRepos: ["me/nod"],
  });
  await expect(page.getByRole("option").first()).toBeVisible();

  await openLedger(page);
  await expect(page.getByRole("option")).toHaveCount(2);
  await page.keyboard.press("e");
  await expect(page.getByRole("option")).toHaveCount(1);

  await page.reload();
  await expect(page.getByRole("option").first()).toBeVisible();
  await openLedger(page);
  await expect(page.getByRole("option")).toHaveCount(1);
  await page.keyboard.press("u");
  await expect(
    sessionList(page).getByText("ledger", { exact: true })
  ).toBeVisible();
});

test("y copies the group's nod:// link — the topic is the id", async ({
  page,
}) => {
  await setupApp(page, {
    ledger: LEDGER,
    watchedRepos: ["me/nod"],
  });
  await expect(page.getByRole("option").first()).toBeVisible();

  await openLedger(page);
  await expect(page.getByRole("option")).toHaveCount(2);
  await page.keyboard.press("y");
  await expect(page.getByText("nod://ledger/me/nod/ledger")).toBeVisible();
});

test("a nod://ledger launch link lands straight in the named session", async ({
  page,
}) => {
  await setupApp(page, {
    ledger: LEDGER,
    ledgerLink: { owner: "me", repo: "nod", topic: "ledger" },
    ledgerSession: LEDGER_SESSION,
    watchedRepos: ["me/nod"],
  });

  await expect(page.locator('[data-testid="review-scroller"]')).toBeVisible();
  await expect(page.getByText("resolveAnchor")).toBeVisible();
  await expect(page.getByRole("button", { name: "Ledger" })).toBeHidden();
});

test("a group authored through the forge wears the login, like a PR row", async ({
  page,
}) => {
  await setupApp(page, {
    ledger: LEDGER,
    watchedRepos: ["me/nod"],
  });
  await expect(page.getByRole("option").first()).toBeVisible();

  await openLedger(page);
  const list = sessionList(page);
  await expect(list.getByText("amy", { exact: true })).toBeVisible();
  await expect(list.getByText("Rosa Diaz")).toBeVisible();
});

test("a resolved commit author displaces the git name on the row", async ({
  page,
}) => {
  await setupApp(page, {
    ledger: LEDGER,
    ledgerAuthors: {
      d1eec70000000000000000000000000000000000: {
        avatarUrl: "",
        login: "rosad",
      },
    },
    watchedRepos: ["me/nod"],
  });
  await expect(page.getByRole("option").first()).toBeVisible();

  await openLedger(page);
  const list = sessionList(page);
  await expect(list.getByText("rosad", { exact: true })).toBeVisible();
  await expect(list.getByText("Rosa Diaz")).toBeHidden();
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
  await expect(page.getByRole("button", { name: "Ledger" })).toBeHidden();
  await expect(page.locator(".qf-filelist")).toBeVisible();
  await expect(page.locator(".qf-header-author")).toHaveText("amy");
  await expect(page.locator(".qf-pr-num")).toHaveText("#1");
  await expect(page.getByText("resolveAnchor")).toBeVisible();
  // The neighbor prefetch may land after Enter's own fetch, so the proof
  // is containment in the call log, never "the last call".
  const sessionCalls = await page.evaluate(() =>
    localStorage.getItem("e2e:ledgerSessionCalls")
  );
  expect(JSON.parse(sessionCalls ?? "[]")).toContainEqual(
    expect.objectContaining({
      repoKey: "me/nod",
      targets: ["src/anchors/resolve.ts:1-40"],
    })
  );

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
  await expect(page.getByText("ba5e100", { exact: true })).toBeVisible();
  await expect(page.getByText("71b0000", { exact: true })).toBeVisible();
  await expect(page.locator(".qf-row-del")).toHaveCount(1);
  await expect(page.locator(".qf-row-add")).toHaveCount(1);

  await page.keyboard.press("Escape");
  await expect(sessionList(page)).toBeVisible();
});

test("a approves immediately — no gate — and returns to the queue", async ({
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

test("the info panel opens on the session and tells the group's story", async ({
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
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-testid="review-scroller"]')).toBeVisible();

  await page
    .getByRole("button", { name: "PR description & conversation" })
    .click();
  await expect(page.locator("aside.qf-drawer-open")).toBeVisible();
  await expect(page.getByText("How it got here:")).toBeVisible();
  await expect(page.getByText(COVERAGE_ZERO)).toBeVisible();
});

test("session threads render inline and c posts a comment optimistically", async ({
  page,
}) => {
  await setupApp(page, {
    ledger: LEDGER,
    ledgerMutationDelayMs: 1500,
    ledgerSession: LEDGER_SESSION,
    watchedRepos: ["me/nod"],
  });
  await expect(page.getByRole("option").first()).toBeVisible();

  await openLedger(page);
  await expect(page.getByRole("option")).toHaveCount(2);
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-testid="review-scroller"]')).toBeVisible();
  await expect(
    page.getByText("Postings could be cached per tip.").first()
  ).toBeVisible();
  await expect(
    page.getByText("Should gone report which lines it lost?").first()
  ).toBeVisible();
  await expect(page.getByText("rosa", { exact: true }).first()).toBeVisible();

  await page.keyboard.press("j");
  await page.keyboard.press("c");
  const box = page.getByRole("textbox", { name: "Add a review comment…" });
  await expect(box).toBeFocused();
  await page.keyboard.type("Wait, what about renames?");
  await page.getByRole("button", { name: "Comment", exact: true }).click();
  // The mock holds the sidecar reply for 1.5s, so the thread appearing now
  // can only have painted from the optimistic cache.
  await expect(
    page.getByText("Wait, what about renames?").first()
  ).toBeVisible();
  const posted = await page.evaluate(() =>
    localStorage.getItem("e2e:ledgerComment")
  );
  expect(JSON.parse(posted ?? "{}")).toMatchObject({
    body: "Wait, what about renames?",
    repoKey: "me/nod",
  });
});

test("q and w walk the session's threads; x resolves the active one", async ({
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
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-testid="review-scroller"]')).toBeVisible();

  await page.keyboard.press("q");
  await page.keyboard.press("x");
  const resolved = await page.evaluate(() =>
    localStorage.getItem("e2e:ledgerResolve")
  );
  expect(JSON.parse(resolved ?? "{}")).toMatchObject({
    factId: "bbbb333300000000",
    repoKey: "me/nod",
  });
  await page.keyboard.press("w");
  await expect(page.locator('[data-testid="review-scroller"]')).toBeVisible();
});

test("shift+v expands the full file from the store clone", async ({ page }) => {
  await setupApp(page, {
    fileBlobs: {
      "src/facts/store.ts":
        "const LOCKS = new Map();\nconst RETRY_BACKOFF = 10;\nconst UNUSED = 0;\nconst PADDING = 0;\nconst RETRIES = 5;\n\nconst casUpdate = (ref, attempt = 0) => {\n  const lock = takeLock(ref);\n  if (!lock) {\n    return retry(ref);\n  }\n};\nconst FULL_FILE_MARKER = 1;",
    },
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

  await page.keyboard.press("Shift+v");
  await expect(
    page.locator(".qf-row-xctx", { hasText: "FULL_FILE_MARKER" }).first()
  ).toBeVisible();
});

test("a multi-file group shows the file tree; clicking a file jumps to it", async ({
  page,
}) => {
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
