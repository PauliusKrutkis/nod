/**
 * Tags, dates and notes all come from a release feed nobody on this side
 * controls, so the cases are its shapes: still loading, failed with nothing
 * cached, nothing shipped, exactly one (the spine must vanish, not stub), the
 * long tail that has to scroll, a body of raw markdown, a release with no
 * notes at all, and CJK/RTL/emoji copy. `overflow` is the pair that has bitten
 * this layout before — an unbroken tag and an unbroken note token, which push
 * the timeline spine off the panel unless both break.
 *
 * Every date and version is fixed, never derived from the clock: `currentTag`
 * marks the "you are here" dot by exact tag, so a capture taken next year is
 * the same image as one taken today.
 */
import { defineEntry } from "../fixtures/fixtures.ts";
import { type Release, ReleaseHistory } from "./release-history.tsx";

const noop = () => {
  return;
};

const shared = { onOpenChange: noop, open: true };

const MONTHS = [
  "01",
  "02",
  "03",
  "04",
  "05",
  "06",
  "07",
  "08",
  "09",
  "10",
  "11",
  "12",
];

const many: Release[] = Array.from({ length: 24 }, (_, i) => ({
  notes: `- Fixed the thing that broke in ${1 + i}\n- Made the diff a little faster`,
  publishedAt: `20${24 + Math.floor(i / 12)}-${MONTHS[i % 12]}-09T09:00:00Z`,
  tag: `v1.${23 - i}.0`,
}));

const MARKDOWN_NOTES = `## Highlights

**Review flow** got a real keyboard story: \`n\` and \`p\` walk changed files,
\`v\` marks one viewed, and the composer no longer steals the caret.

- Diffs render incrementally, so a 12,000-line file paints in one frame
- Suggestions come through as cards you can copy in a click
- The inbox remembers which tab you were on per account

### Fixes

1. Comment threads on renamed files resolve against the right path
2. The update prompt stops re-appearing after a skipped version
3. \`prefers-reduced-motion\` now silences the dialog pop everywhere

> Upgrading from 1.2 or older? The token store moves to the OS keychain on
> first launch; nothing to do, but the first start takes a beat longer.

See the [full changelog](https://example.com/changelog) for the rest.`;

export const releaseHistoryEntry = defineEntry(
  ReleaseHistory,
  {
    "crowd-24": {
      props: { ...shared, currentTag: "v1.23.0", releases: many },
    },
    empty: { props: { ...shared, releases: [] } },
    failed: { props: { ...shared, releases: null } },
    loading: { props: { ...shared, releases: undefined } },
    markdown: {
      props: {
        ...shared,
        currentTag: "v1.4.0",
        releases: [
          {
            notes: MARKDOWN_NOTES,
            publishedAt: "2026-07-06T12:00:00Z",
            tag: "v1.4.0",
          },
        ],
      },
    },
    "no-notes": {
      props: {
        ...shared,
        releases: [
          { notes: null, publishedAt: "2026-07-06T12:00:00Z", tag: "v1.4.0" },
          { notes: "", publishedAt: null, tag: "v1.3.1" },
          {
            notes: "Sharper diffs.",
            publishedAt: "not-a-date",
            tag: "v1.3.0",
          },
        ],
      },
    },
    overflow: {
      props: {
        ...shared,
        currentTag: `v2.0.0-${"release-candidate-".repeat(12)}final`,
        releases: [
          {
            notes: `Reverts ${"deploy-segment-".repeat(40)}x`,
            publishedAt: "2026-07-06T12:00:00Z",
            tag: `v2.0.0-${"release-candidate-".repeat(12)}final`,
          },
        ],
      },
    },
    single: {
      props: {
        ...shared,
        currentTag: "v1.0.0",
        releases: [
          {
            notes: "First release. It reviews pull requests.",
            publishedAt: "2026-01-09T09:00:00Z",
            tag: "v1.0.0",
          },
        ],
      },
    },
    unicode: {
      props: {
        ...shared,
        currentTag: "v1.5.0",
        releases: [
          {
            notes: "差分の描画を高速化しました 🚀\n藤本 さくらによるレビュー",
            publishedAt: "2026-05-09T09:00:00Z",
            tag: "v1.5.0",
          },
          {
            notes: "إصلاح لوحة البحث وتحسين الأداء 👨‍👩‍👧‍👦",
            publishedAt: "2026-04-09T09:00:00Z",
            tag: "v1.4.0",
          },
          {
            notes: "<img src=x onerror=alert(1)> stays text",
            publishedAt: "2026-03-09T09:00:00Z",
            tag: "v1.3.0",
          },
        ],
      },
    },
  },
  { dialog: true }
);
