/**
 * A comment row is one author string and one markdown body, both written by
 * strangers, so the fixtures are mostly those two refusing to be small: an
 * author with no spaces in it, a body that is one 2,000-character token, a
 * body that is only an image, and the bidi and CJK cases that decide whether
 * the head reorders around the timestamp.
 *
 * createdAt values are fixed timestamps, never Date.now(): the label is
 * relative, so a capture of "3m ago" expires within the hour. Far-past dates
 * (matching pr-list-item's fixtures) sit inside a year bucket, the future
 * date pins "just now" permanently, and the empty string is the API value
 * that yields no label at all.
 *
 * Which handlers arrive is what says "this comment is mine", so the strip's
 * own power set stays comment-tools' business and only the two ends appear
 * here. `no-tools` is the surface hiding the strip while a composer is open.
 *
 * Two states no fixture can reach: the composer that replaces the body while
 * editing is a host slot (a rich text editor the package does not own, still
 * uncatalogued), and the "Copied"/"Delete?" flashes inside the strip are its
 * internal state. The desktop e2e specs own both.
 */

import { defineEntry } from "../fixtures/fixtures.ts";
import { CommentItem } from "./comment-item.tsx";

const noop = () => {
  return;
};

const AT = "2024-08-01T00:00:00Z";

const SHORT = "Nice — that reads much better.";

const LONG = [
  "This is the third place we rebuild the same retry policy, and the three",
  "copies have already drifted: this one backs off linearly, the client's",
  "backs off exponentially, and the poller doesn't back off at all. None of",
  "that is visible from any single file, which is why it survived review",
  "twice.",
  "",
  "What I'd like instead is one policy object created next to the client and",
  "passed down, so a change to the schedule is a change in one place. It also",
  "gives us something to test: right now the only way to observe the backoff",
  "is to watch the clock in an integration test, which is why we don't.",
  "",
  "Not a blocker for this PR — but if you're touching the poller anyway, this",
  "is the moment where it costs the least.",
].join("\n");

const CODE_FENCE = [
  "The parse loses the sign on negative offsets:",
  "",
  "```ts",
  "export function parseHunkHeader(line: string): HunkRange {",
  "  const m = /^@@ -(\\d+),?(\\d*) \\+(\\d+),?(\\d*) @@/.exec(line);",
  "  if (!m) {",
  '    throw new Error("unparseable hunk header: " + line);',
  "  }",
  "  return { count: Number(m[2] || 1), start: Number(m[1]) };",
  "}",
  "```",
  "",
  '`m[2]` is `"0"` for an empty hunk, and `Number("0" || 1)` is 1.',
].join("\n");

const SUGGESTION = [
  "Guard the empty case before the loop runs:",
  "",
  "```suggestion",
  "  if (rows.length === 0) {",
  "    return null;",
  "  }",
  "  for (const row of rows) {",
  "```",
  "",
  "Then the null check below can go.",
].join("\n");

const MARKUP = [
  'Careful: `<img src=x onerror="alert(1)">` in a title still reaches the',
  "notification body. <script>alert(document.cookie)</script> should read as",
  "text here, not run.",
].join("\n");

const UNBREAKABLE = `Failing request id: req_${"a1b2c3d4".repeat(250)}`;

const IMAGE_ONLY =
  "![Before and after the change](data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22640%22%20height%3D%22200%22%3E%3Crect%20width%3D%22640%22%20height%3D%22200%22%20fill%3D%22midnightblue%22%2F%3E%3Crect%20x%3D%2224%22%20y%3D%2240%22%20width%3D%22260%22%20height%3D%22120%22%20rx%3D%2210%22%20fill%3D%22slategray%22%2F%3E%3Crect%20x%3D%22356%22%20y%3D%2240%22%20width%3D%22260%22%20height%3D%22120%22%20rx%3D%2210%22%20fill%3D%22mediumpurple%22%2F%3E%3C%2Fsvg%3E)";

const CJK = [
  "この関数は空の配列を受け取ると null を返しますが、呼び出し側はそれを",
  "期待していません。境界値のテストを追加しておきます。",
].join("\n");

const RTL = [
  "لا أرى داعياً لهذا الشرط الإضافي — القيمة مضمونة من الدالة السابقة.",
  "",
  "Mixed with English and a `code span` to force the bidi run to break.",
].join("\n");

export const commentItemEntry = defineEntry(CommentItem, {
  "author-overflow": {
    props: {
      body: SHORT,
      commentId: 11,
      createdAt: AT,
      user: `renovate-${"bot".repeat(60)}[bot]`,
    },
  },
  "body-overflow": {
    props: {
      body: UNBREAKABLE,
      commentId: 12,
      createdAt: AT,
      user: "ci-runner",
    },
  },
  cjk: {
    props: {
      body: CJK,
      commentId: 13,
      createdAt: AT,
      user: "藤本 さくら",
    },
  },
  "code-fence": {
    props: {
      body: CODE_FENCE,
      commentId: 14,
      createdAt: AT,
      user: "priya",
    },
  },
  "empty-body": {
    props: {
      body: "   \n  ",
      commentId: 15,
      createdAt: AT,
      user: "sam",
    },
  },
  "image-only": {
    props: {
      body: IMAGE_ONLY,
      commentId: 16,
      createdAt: AT,
      user: "design-review",
    },
  },
  long: {
    props: {
      body: LONG,
      commentId: 17,
      createdAt: "2016-03-04T09:00:00Z",
      user: "torvalds",
    },
  },
  "markup-as-text": {
    props: {
      body: MARKUP,
      commentId: 18,
      createdAt: AT,
      user: "security",
    },
  },
  "no-timestamp": {
    props: {
      body: SHORT,
      commentId: 20,
      createdAt: "",
      user: "unknown",
    },
  },
  "no-tools": {
    props: {
      body: SHORT,
      commentId: 19,
      createdAt: AT,
      tools: false,
      user: "maya",
    },
  },
  own: {
    props: {
      body: SHORT,
      commentId: 21,
      createdAt: AT,
      editKbd: "shift+e",
      onDelete: noop,
      onStartEdit: noop,
      user: "you",
    },
  },
  reply: {
    props: {
      body: "Agreed — pushed a fix in the last commit.",
      commentId: 22,
      createdAt: "2099-01-01T00:00:00Z",
      reply: true,
      user: "maya",
    },
  },
  rtl: {
    props: {
      body: RTL,
      commentId: 23,
      createdAt: AT,
      user: "محمد الأمين",
    },
  },
  suggestion: {
    props: {
      body: SUGGESTION,
      commentId: 24,
      createdAt: AT,
      onDelete: noop,
      onStartEdit: noop,
      user: "reviewer",
    },
  },
  typical: {
    props: {
      body: SHORT,
      commentId: 25,
      createdAt: AT,
      user: "kai",
      userAvatarUrl: "",
    },
  },
});
