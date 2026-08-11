import type { Page } from "./types.ts";

/**
 * Viewport-centre of `token`'s first occurrence within a real (non-hunk) diff
 * code line of file section `section` — so the mouse can click the exact
 * word, wherever hljs tokenization put it.
 */
export async function tokenCenter(page: Page, section: number, token: string) {
  const rect = await page.evaluate(
    ({ section: fileSection, token: wordToken }) => {
      const codes = document.querySelectorAll(
        `.qf-row[data-file-index="${fileSection}"]:not(.qf-row-hunk) .qf-code`
      );
      for (const code of codes) {
        const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          const node = walker.currentNode as Text;
          const i = node.data.indexOf(wordToken);
          if (i === -1) {
            continue;
          }
          const range = document.createRange();
          range.setStart(node, i);
          range.setEnd(node, i + wordToken.length);
          const r = range.getBoundingClientRect();
          return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        }
      }
      return null;
    },
    { section, token }
  );
  if (!rect) {
    throw new Error(`token not found in diff: ${token}`);
  }
  return rect;
}

/** Single-click a token (settling the hover first, like a real pointer). */
export async function clickToken(page: Page, section: number, token: string) {
  const { x, y } = await tokenCenter(page, section, token);
  await page.mouse.move(x, y);
  await page.waitForTimeout(100);
  await page.mouse.click(x, y);
}

/** Double-click a token (settling the hover first, like a real pointer). */
export async function dblclickToken(
  page: Page,
  section: number,
  token: string
) {
  const { x, y } = await tokenCenter(page, section, token);
  await page.mouse.move(x, y);
  await page.waitForTimeout(100);
  await page.mouse.dblclick(x, y);
}

export const updateCard = (page: Page) =>
  page.getByRole("status").filter({ hasText: "Update available" });
