import { setupApp } from "./bridge.ts";
import { DETAIL } from "./fixtures.ts";
import { expect, test } from "./test.ts";

/**
 * The sidebar has two modes over the same flat file model. Tree is the
 * default; the toggle is remembered. Keyboard file navigation deliberately
 * stays on the flat order — a folder is auto-expanded when the file it holds
 * becomes selected, rather than the cycle skipping collapsed files.
 *
 * The default fixture keeps every file in one directory, so the first block
 * covers the index model and the collapse/reopen contract cheaply. The
 * nested block feeds a multi-folder PR through the same UI and is where the
 * evidence screenshots come from — a single-folder shot can't show sibling
 * folders, breadcrumb chains, or depth.
 */

async function openFirstPr(page: Parameters<typeof setupApp>[0]) {
  await expect(page.getByRole("option").first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator(".qf-fsec-head").first()).toBeVisible();
}

test.describe("single-folder fixture", () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page);
    await openFirstPr(page);
  });

  test("the tree groups files under a folder row and indents them", async ({
    page,
  }) => {
    const folder = page.locator(".qf-file-dirrow");
    await expect(folder).toHaveCount(1);
    await expect(folder).toContainText("src/lib");

    await expect(page.locator(".qf-file[data-file-index]")).toHaveCount(3);
    const depth = await page
      .locator('.qf-file[data-file-index="0"]')
      .evaluate((el) =>
        (el as HTMLElement).style.getPropertyValue("--qf-depth")
      );
    expect(depth).toBe("1");
  });

  test("collapsing a folder hides its files; selecting one reopens it", async ({
    page,
  }) => {
    await page.locator(".qf-file-dirrow").click();
    await expect(page.locator(".qf-file[data-file-index]")).toHaveCount(0);

    await page.keyboard.press("r");
    await expect(page.locator(".qf-file-active")).toHaveAttribute(
      "data-file-index",
      "1"
    );
    await expect(page.locator(".qf-file[data-file-index]")).toHaveCount(3);
  });

  test("the flat mode toggle is remembered across a reload", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Show a flat file list" }).click();
    await expect(page.locator(".qf-file-dirrow")).toHaveCount(0);
    await expect(page.locator(".qf-file-dir").first()).toContainText(
      "src/lib/"
    );

    await page.reload();
    await expect(page.locator(".qf-fsec-head").first()).toBeVisible();
    await expect(page.locator(".qf-file-dirrow")).toHaveCount(0);
  });
});

const NESTED_PATCH = `@@ -1,2 +1,2 @@
 export function noop() {
-  return 1;
+  return 2;
 }`;

function nestedFile(filename: string, status: "added" | "modified") {
  return {
    additions: 2,
    changes: 3,
    deletions: 1,
    filename,
    patch: NESTED_PATCH,
    sha: `sha-${filename}`,
    status,
  };
}

// A PR shaped like real work: sibling folders, a deep chain, a root-level
// leaf. Indexes follow array order, the same order GitHub returns.
const NESTED_DETAIL = {
  ...DETAIL,
  comments: [],
  files: [
    nestedFile("e2e/file-tree.spec.ts", "added"),
    nestedFile("src/components/review/diff-view.tsx", "modified"),
    nestedFile("src/components/review/file-sidebar.tsx", "modified"),
    nestedFile("src/lib/file-tree.test.ts", "added"),
    nestedFile("src/lib/file-tree.ts", "added"),
    nestedFile("src/quiet.css", "modified"),
  ],
};

test.describe("nested fixture", () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page, { detail: NESTED_DETAIL });
    await openFirstPr(page);
  });

  // `components/review` is a single-child chain, so it renders as one
  // breadcrumb row, while `src` — two subdirectories plus a file — stays a
  // real level. The selection lands on a depth-2 file before the evidence
  // shot so it shows the active row inside a folder; collapsing `lib` must
  // hide exactly its own two files and leave every other row and the
  // selection untouched.
  test("sibling folders, a collapsed chain and depth-2 rows render; one folder collapses alone", async ({
    page,
  }) => {
    await expect(page.locator(".qf-file-dirrow")).toHaveText([
      "e2e",
      "src",
      "components/review",
      "lib",
    ]);
    await expect(page.locator(".qf-file[data-file-index]")).toHaveCount(6);

    const depthOf = (selector: string) =>
      page
        .locator(selector)
        .evaluate((el) =>
          (el as HTMLElement).style.getPropertyValue("--qf-depth")
        );
    expect(await depthOf('.qf-file-dirrow[data-dir-path="src/lib"]')).toBe("1");
    expect(await depthOf('.qf-file[data-file-index="2"]')).toBe("2");

    await page.locator('.qf-file[data-file-index="2"]').click();
    await expect(page.locator(".qf-file-active")).toHaveAttribute(
      "data-file-index",
      "2"
    );
    await page.screenshot({ path: "evidence/file-tree-nested.png" });

    await page.locator('.qf-file-dirrow[data-dir-path="src/lib"]').click();
    await expect(page.locator(".qf-file[data-file-index]")).toHaveCount(4);
    await expect(page.locator('.qf-file[data-file-index="4"]')).toHaveCount(0);
    await expect(page.locator(".qf-file-active")).toHaveAttribute(
      "data-file-index",
      "2"
    );
    await page.screenshot({ path: "evidence/file-tree-nested-collapsed.png" });
  });

  // The pointer parks over empty sidebar space before the screenshot so
  // neither the toggle's tooltip nor a diff row's hover state is caught.
  test("flat mode shows the same six files with full paths", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Show a flat file list" }).click();
    await expect(page.locator(".qf-file-dirrow")).toHaveCount(0);
    await expect(page.locator(".qf-file[data-file-index]")).toHaveCount(6);
    await expect(page.locator(".qf-file-dir").nth(1)).toContainText(
      "src/components/review/"
    );
    await page.mouse.move(150, 600);
    await expect(page.locator(".q-tooltip")).toHaveCount(0);
    await page.screenshot({ path: "evidence/file-tree-nested-flat.png" });
  });
});
