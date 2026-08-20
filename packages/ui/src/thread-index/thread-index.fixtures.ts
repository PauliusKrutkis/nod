/**
 * Every row is two unbounded strings (a path and a comment's first line) plus
 * a line number that is sometimes absent, so the cases walk that: no threads
 * at all (the section renders nothing, which is the contract), one thread, the
 * 40-thread PR, an outdated thread with no line to jump to, a resolved one,
 * and the unbreakable path/snippet pair that must ellipsize inside the row
 * rather than widen the drawer.
 *
 * Snippets arrive already folded to one line by the host; `newline-snippet`
 * pins what a row does with a body that was never folded — the row must stay
 * one line high either way. Authors ride every row now that rows read as
 * comments; `typical` carries a handle long enough to force the ellipsis.
 */
import { defineEntry } from "../fixtures/fixtures.ts";
import { ThreadIndex, type ThreadIndexRow } from "./thread-index.tsx";

const noop = () => {
  return;
};

const UNBREAKABLE = "x".repeat(2000);

function thread(
  overrides: Partial<ThreadIndexRow> & { id: number }
): ThreadIndexRow {
  return {
    createdAt: "2025-06-03T10:00:00Z",
    line: 42,
    path: "src/components/review/right-panel.tsx",
    replyCount: 0,
    snippet: "This derivation belongs in the container, not the view.",
    user: "maya",
    userAvatarUrl: "",
    ...overrides,
  };
}

const typical: ThreadIndexRow[] = [
  thread({ id: 1, replyCount: 2 }),
  thread({
    createdAt: "2025-06-03T14:25:00Z",
    id: 2,
    line: 118,
    path: "packages/ui/src/file-sidebar/file-sidebar.tsx",
    replyCount: 1,
    snippet: "Can we keep the original index on the row instead?",
    user: "jt-osaka",
  }),
  thread({
    createdAt: "2025-06-02T08:00:00Z",
    id: 3,
    line: null,
    path: "apps/desktop/src/quiet.css",
    snippet: "Outdated after the rebase, but worth keeping for the record.",
    user: "priya",
  }),
  thread({
    createdAt: "2025-06-04T19:41:00Z",
    id: 4,
    line: 7,
    path: "README.md",
    replyCount: 11,
    resolved: true,
    snippet: "Fixed in 9de693c.",
    user: "a-very-long-github-handle-that-must-ellipsize",
  }),
];

const crowd: ThreadIndexRow[] = Array.from({ length: 40 }, (_, i) =>
  thread({
    id: 100 + i,
    line: i === 0 ? null : i * 17,
    path: `packages/core/src/module-${String(i).padStart(2, "0")}/index.ts`,
    replyCount: i % 4,
    resolved: i % 6 === 0,
    snippet: `Thread ${i + 1}: this one asks about the boundary between the two modes.`,
  })
);

export const threadIndexEntry = defineEntry(ThreadIndex, {
  "crowd-40": {
    props: { onJump: noop, threads: crowd },
  },
  empty: {
    props: { onJump: noop, threads: [] },
    rendersNothing: true,
  },
  "markup-as-text": {
    props: {
      onJump: noop,
      threads: [
        thread({
          id: 9,
          path: "src/<img onerror=alert(1) src=x>.ts",
          snippet: "<img onerror=alert(1) src=x>",
        }),
      ],
    },
  },
  "newline-snippet": {
    props: {
      onJump: noop,
      threads: [
        thread({
          id: 10,
          snippet: "First line of the body\nsecond line that must not show",
        }),
      ],
    },
  },
  outdated: {
    props: {
      onJump: noop,
      threads: [thread({ id: 11, line: null, replyCount: 1 })],
    },
  },
  overflow: {
    props: {
      onJump: noop,
      threads: [
        thread({
          id: 12,
          line: 999_999,
          path: `packages/platform/services/review/${UNBREAKABLE}.ts`,
          replyCount: 128,
          snippet: UNBREAKABLE,
        }),
      ],
    },
  },
  resolved: {
    props: {
      onJump: noop,
      threads: [thread({ id: 13, replyCount: 1, resolved: true })],
    },
  },
  single: {
    props: { onJump: noop, threads: [thread({ id: 14 })] },
  },
  typical: {
    props: { onJump: noop, threads: typical },
  },
  unicode: {
    props: {
      onJump: noop,
      threads: [
        thread({
          id: 15,
          path: "ソース/コンポーネント/レビュー/右パネル.tsx",
          replyCount: 3,
          snippet: "この派生はコンテナに置くべきです 👀",
        }),
        thread({
          id: 16,
          line: null,
          path: "مصدر/مكونات/مراجعة/اللوحة-اليمنى.tsx",
          resolved: true,
          snippet: "تم إصلاح هذا في الإصدار السابق",
        }),
      ],
    },
  },
});
