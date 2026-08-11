/**
 * The dialog that motivated cataloguing views: it broke on real inbox data.
 * Fixtures are whole inbox shapes — none, the typical eight, a crowd, and
 * payloads with the string classes that break layout (CJK/RTL titles, an
 * unbreakable branch ref). updatedAt values are fixed dates far in the past
 * so relative times stay stable across capture runs.
 */
import { defineEntry } from "../fixtures.ts";
import { type SearchablePr, SearchPane } from "./search-pane.tsx";

const noop = () => {
  return;
};

function pr(
  overrides: Partial<SearchablePr> & { number: number }
): SearchablePr {
  return {
    author: "paulius",
    authorAvatarUrl: null,
    draft: false,
    headRef: "feat/gallery-route",
    merged: false,
    repo: "nod/nod",
    title: "Make the gallery the source of truth",
    updatedAt: "2024-06-01T00:00:00Z",
    ...overrides,
  };
}

const shared = { onOpen: noop, onOpenChange: noop, open: true };

export const searchPaneEntry = defineEntry(
  SearchPane<SearchablePr>,
  {
    badges: {
      props: {
        ...shared,
        prs: [
          pr({ draft: true, number: 11, title: "Draft: rework the rail" }),
          pr({ merged: true, number: 12, title: "Merged: token parity test" }),
        ],
      },
    },
    "crowd-200": {
      props: {
        ...shared,
        prs: Array.from({ length: 200 }, (_, i) =>
          pr({ number: i + 1, title: `Change number ${i + 1}` })
        ),
      },
    },
    empty: { props: { ...shared, prs: [] } },
    overflow: {
      props: {
        ...shared,
        prs: [
          pr({
            headRef: `refs/heads/${"deploy-segment-".repeat(20)}x`,
            number: 4242,
            title: `fix(${"very-".repeat(30)}long): unbroken token`,
          }),
        ],
      },
    },
    typical: {
      props: {
        ...shared,
        prs: [
          pr({
            number: 269,
            title: "feat(tokens): one palette instead of three",
          }),
          pr({ number: 270, title: "feat(ui): extract props-pure primitives" }),
          pr({
            number: 271,
            title: "feat(desktop): dev-only component gallery",
          }),
          pr({ number: 272, title: "test(desktop): webkit screenshot suite" }),
        ],
      },
    },
    unicode: {
      props: {
        ...shared,
        prs: [
          pr({ author: "藤本 さくら", number: 21, title: "レビューの高速化" }),
          pr({ author: "محمد الأمين", number: 22, title: "إصلاح لوحة البحث" }),
          pr({ number: 23, title: "🦊 emoji in a title 🚀" }),
        ],
      },
    },
  },
  { dialog: true }
);
