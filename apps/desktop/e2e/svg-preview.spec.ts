import { setupApp } from "./bridge.ts";
import { DETAIL_SVG, HOSTILE_SVG, SVG_PATH } from "./fixtures.ts";
import { expect, test } from "./test.ts";
import type { Page } from "./types.ts";

/**
 * SVG files in a diff. The fixture is hostile on purpose (a script element,
 * an onload handler, a remote image reference), because both surfaces this
 * spec touches would be an XSS in the window holding the reviewer's session
 * if they leaked: the preview, which renders the file through an <img> data:
 * URL where script and remote fetches are inert, and the diff rows, where the
 * same markup is text that React escapes.
 */

const PREVIEW = 'img[src^="data:image/svg+xml;base64,"]';
const REMOTE_HOST = "evil.example";

async function openSvgPr(page: Page) {
  await setupApp(page, {
    detail: DETAIL_SVG,
    fileBlobs: { [SVG_PATH]: HOSTILE_SVG },
  });
  await expect(page.getByRole("option").first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator(".qf-fsec-head").first()).toBeVisible();
}

async function previewsDecoded(page: Page) {
  await expect(page.locator(PREVIEW)).toHaveCount(2);
  await expect
    .poll(() =>
      page
        .locator(PREVIEW)
        .evaluateAll((imgs) =>
          imgs.every(
            (img) =>
              (img as HTMLImageElement).complete &&
              (img as HTMLImageElement).naturalWidth > 0
          )
        )
    )
    .toBe(true);
}

test("an SVG renders as a before/after preview above its markup", async ({
  page,
}) => {
  await openSvgPr(page);
  await previewsDecoded(page);

  await expect(page.locator(".qf-img-label").first()).toHaveText("Before");
  await expect(page.locator(".qf-img-label").last()).toHaveText("After");
  await expect(
    page.locator('.qf-row[data-file-index="0"]').filter({ hasText: "circle" })
  ).not.toHaveCount(0);
  await page.screenshot({ path: "evidence/svg-preview.png" });
});

test("a hostile SVG runs no script and fetches nothing remote", async ({
  page,
}) => {
  const remote: string[] = [];
  page.on("request", (req) => {
    if (req.url().includes(REMOTE_HOST)) {
      remote.push(req.url());
    }
  });

  await openSvgPr(page);
  await previewsDecoded(page);

  const escaped = await page.evaluate(
    () => (window as unknown as { __svgEscaped?: true }).__svgEscaped
  );
  expect(escaped).toBeUndefined();
  expect(remote).toEqual([]);
});
