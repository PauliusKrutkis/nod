/**
 * Every string here is a body a host could serve, so the hostile cases are
 * the ordinary ones. Two groups carry weight beyond layout:
 *
 * The `sanitize-*` fixtures are the standing evidence that rehype-raw is
 * paired with rehype-sanitize. Each one is a payload that executes if the
 * sanitizer is ever dropped or reordered, and its provenance names the attack
 * it stands for. They are screenshots as well as renders on purpose: a
 * stripped <script> should leave no visible residue, and a defused link
 * should still read as a link.
 *
 * The overflow group exists because prose is where unbreakable tokens land —
 * a base64 blob, a Java stack frame, a signed URL. At the 280px sidebar width
 * any of them can set the block's min-content width and prise the pane open,
 * which is a layout failure no jsdom test can see.
 *
 * Fixtures are rendered without `openExternal`, which is the safe default:
 * the anchor still cancels its own click, so no capture can navigate.
 */

import { createElement } from "react";
import { defineEntry } from "../fixtures/fixtures.ts";
import { Markdown, type MarkdownImageProps } from "./markdown.tsx";

const UNBREAKABLE = `sk-live-${"nod0".repeat(500)}`;

function svgUrl(markup: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
}

const SHOT = svgUrl(
  '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="300"><rect width="900" height="300" fill="midnightblue"/><circle cx="150" cy="150" r="70" fill="mediumpurple"/><rect x="270" y="120" width="520" height="24" rx="12" fill="slategray"/><rect x="270" y="176" width="360" height="24" rx="12" fill="dimgray"/></svg>'
);

const MISSING = "/assets/deleted-attachment.png";

const TYPICAL = [
  "Rework the retry knob so the default lives in the client, not at every",
  "call site. `resolveRetry` is the only reader now.",
  "",
  "Worth a look: the backoff table still has five entries and we only take",
  "three, so the last two are dead configuration.",
].join("\n");

const HEADINGS = [
  "# Heading one",
  "## Heading two",
  "### Heading three",
  "#### Heading four",
  "##### Heading five",
  "###### Heading six",
  "",
  "Body copy after the ladder, so the trailing margin is visible.",
].join("\n");

const LISTS = [
  "- Top level item",
  "- Another item",
  "  - Nested item",
  "  - Nested sibling",
  "    - Third level, which is as deep as review threads ever go",
  "",
  "1. Ordered one",
  "2. Ordered two",
  "   1. Ordered nested",
  "   2. Ordered nested sibling",
].join("\n");

const TABLE = [
  "| Package | Was | Now | Notes |",
  "| --- | --- | --- | --- |",
  "| `@tanstack/react-query` | 5.62.0 | 5.66.4 | patch only |",
  "| `react-markdown` | 9.0.1 | 9.1.0 | adds the `node` prop to components |",
  "| `rehype-sanitize` | 6.0.0 | 6.0.0 | unchanged, listed for completeness |",
].join("\n");

const CODE_FENCE = [
  "Guard the parse instead of trusting the header:",
  "",
  "```ts",
  "const parsed = safeParse(schema, body);",
  "if (!parsed.ok) {",
  "  return problem(400, parsed.error);",
  "}",
  "```",
  "",
  "That keeps the 400 in one place.",
].join("\n");

const SUGGESTION = [
  "This can go through the shared helper:",
  "",
  "```suggestion",
  "  if (!parsed.ok) {",
  "    return problem(400, parsed.error);",
  "  }",
  "```",
].join("\n");

const SUGGESTION_REPEATED = [
  "Close both branches the same way:",
  "",
  "```suggestion",
  "  }",
  "",
  "  }",
  "",
  "```",
].join("\n");

const TASK_LIST = [
  "- [x] Lift the Tauri opener to a prop",
  "- [x] Keep the sanitizer with the component",
  "- [ ] Port comment-item",
  "- [ ] Port review-diff-pane",
].join("\n");

const UNICODE = [
  "# 藤本 さくら のレビュー",
  "",
  "مرحبا، هذا تعليق مكتوب من اليمين إلى اليسار مع رقم 42 في وسطه.",
  "",
  "- 한국어 항목",
  "- Ελληνικά",
  "- Ру́сский текст",
].join("\n");

const EMOJI = [
  "Shipped 🎉 — thanks 👩‍💻👨‍👩‍👧‍👦 for the review!",
  "",
  "- ✅ tests green",
  "- 🚧 docs still to do",
  "- 🇯🇵 locale check pending",
].join("\n");

const RAW_HTML = [
  "Raw HTML that the allowlist keeps: <b>bold</b>, <i>italic</i>, <kbd>Esc</kbd>",
  "and <code>inline code</code>.",
  "",
  "<details><summary>Release notes (collapsed)</summary>",
  "",
  "The collapsible is why the schema is widened past the default.",
  "",
  "</details>",
  "",
  "Raw HTML the allowlist drops: <style>body{display:none}</style>",
  '<iframe src="https://example.com"></iframe> and <form><input /></form>.',
].join("\n");

const OVERFLOW = [
  "# A heading long enough that it has nowhere to break before the pane ends",
  "",
  `The host echoed the token back verbatim: ${UNBREAKABLE}`,
  "",
  `\`${UNBREAKABLE.slice(0, 400)}\``,
  "",
  `<https://example.com/${"segment".repeat(60)}>`,
].join("\n");

const SUGGESTION_OVERFLOW = [
  "Inline the credential the scanner flagged:",
  "",
  "```suggestion",
  `  const token = "${UNBREAKABLE.slice(0, 300)}";`,
  "```",
].join("\n");

export const markdownEntry = defineEntry(Markdown, {
  blockquote: {
    props: {
      children: [
        "> The point of the drawer is that the description is readable without",
        "> leaving the diff.",
        ">",
        "> > And a nested quote, which review threads produce constantly.",
        "",
        "Reply under the quote.",
      ].join("\n"),
    },
  },
  "code-fence": { props: { children: CODE_FENCE } },
  emoji: { props: { children: EMOJI } },
  empty: { props: { children: "" }, rendersNothing: true },
  headings: { props: { children: HEADINGS } },
  image: {
    props: {
      children: `An attachment the host no longer serves, so the alt text carries it:\n\n![Screenshot of the review pane](${MISSING})\n\nA pasted data: URL, which the sanitizer's src allowlist drops outright:\n\n![Pasted screenshot](${SHOT})\n\nAnd one with no alt text at all:\n\n![](${MISSING})`,
    },
    provenance:
      "only http(s) and relative image sources survive sanitisation — a pasted data: URL renders as nothing, which is why hosts resolve their own uploads through renderImage",
  },
  "image-slot": {
    props: {
      children: `A host upload, resolved through the seam:\n\n![Pasted screenshot](/uploads/9f8e7d/screen.png)\n\nA plain image the host declines to intercept:\n\n![Plain](${MISSING})`,
      renderImage: ({ src, alt }: MarkdownImageProps) =>
        src?.startsWith("/uploads/")
          ? createElement("img", { alt, height: 300, src: SHOT, width: 900 })
          : null,
    },
    provenance:
      "the seam the desktop uses to swap GitLab upload paths for authenticated blobs; returning null must fall through to a plain image, and the resolved one must still clamp to the column",
  },
  "inline-code": {
    props: {
      children:
        "Call `resolveRetry(options)` before `client.send()`; the old `attempts` field is gone, and `maxAttempts` defaults to `3`.",
    },
  },
  link: {
    props: {
      children:
        "See [the architecture note](https://example.invalid/docs/ARCHITECTURE.md), the bare autolink https://example.invalid/pulls/280, and a [relative one](../docs/AI.md).",
    },
  },
  lists: { props: { children: LISTS } },
  overflow: {
    props: { children: OVERFLOW },
    provenance:
      "an unbreakable 2,000-character token: without overflow-wrap it set the block's min-content width and prised the pane open",
  },
  "raw-html": {
    props: { children: RAW_HTML },
    provenance:
      "the allowlist's two halves in one body — <b>/<kbd>/<details> survive, <style>/<iframe>/<form> are dropped",
  },
  rule: {
    props: {
      children:
        "Above the rule.\n\n---\n\nBelow the rule, with a second one after this line.\n\n***\n\nAnd the tail.",
    },
  },
  "sanitize-img-onerror": {
    props: {
      children: `A source that is certain to fail, so the error event certainly fires:\n\n<img src="${MISSING}" onerror="alert(1)" alt="onerror probe">\n\nAnd the same attributes on a markdown-authored image:\n\n<img src="${MISSING}" onload="alert(2)" onclick="alert(3)" alt="onload probe">`,
    },
    provenance:
      "event-handler XSS: the attributes must never reach the DOM, so a failed image load stays a failed image load",
  },
  "sanitize-javascript-href": {
    props: {
      children:
        '<a href="javascript:alert(1)">defused link</a> and [a markdown one](javascript:alert(2)) plus <a href="data:text/html,<script>alert(3)</script>">a data: URL</a>.',
    },
    provenance:
      "scheme XSS: only the allowlisted protocols survive, so the href is dropped and the text stays readable",
  },
  "sanitize-script": {
    props: {
      children:
        'Before.\n\n<script>alert(1)</script>\n\n<script src="https://example.invalid/x.js"></script>\n\n<svg onload="alert(2)"><script>alert(3)</script></svg>\n\nAfter.',
    },
    provenance:
      "script injection: rehype-raw would execute these if the sanitizer were ever dropped or reordered",
  },
  suggestion: { props: { children: SUGGESTION } },
  "suggestion-overflow": {
    props: { children: SUGGESTION_OVERFLOW },
    provenance:
      "the card's header is inline-flex and its lines are host code — the pairing that has to hold at the 280px sidebar width",
  },
  "suggestion-repeated-lines": {
    props: { children: SUGGESTION_REPEATED },
    provenance:
      "identical lines in one suggestion — keying the rows by their own text gave them the same React key, which warned and left the rows free to duplicate or drop",
  },
  table: { props: { children: TABLE } },
  "task-list": { props: { children: TASK_LIST } },
  typical: { props: { children: TYPICAL } },
  unicode: { props: { children: UNICODE } },
});
