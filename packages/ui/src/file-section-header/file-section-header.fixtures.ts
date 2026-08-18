/**
 * The band holds one unbounded string (the path, two of them on a rename) and
 * two counts against three optional controls, so the fixtures are mostly about
 * what the path does to the rest of the row: a monorepo path that has to
 * ellipsize without pushing the controls off, a file at the repo root (no
 * directory to dim), a name with no extension, non-Latin and bidi path
 * segments, and a rename where the old path is the long one.
 *
 * Counts go to five figures because generated files exist and the churn pair
 * is mono, so it is the widest fixed element on the row.
 *
 * `unknown-status` is a forge word this app has never seen: it must fall back
 * to the modified glyph rather than render an empty square. `crowd` is every
 * optional control at once — updated chip, expand, viewed, copied
 * acknowledgement — which is the narrowest the path ever gets.
 */

import { defineEntry } from "../fixtures/fixtures.ts";
import { FileSectionHeader } from "./file-section-header.tsx";

const DEEP =
  "apps/desktop/src/components/review/internals/virtualization/review-list-item-renderer.tsx";

export const fileSectionHeaderEntry = defineEntry(FileSectionHeader, {
  added: {
    props: {
      additions: 312,
      deletions: 0,
      expandable: true,
      fileIndex: 1,
      filename: "packages/ui/src/diff-row/diff-row.tsx",
      status: "added",
    },
  },
  "delta-mode": {
    props: {
      additions: 9,
      deletions: 2,
      deltaBadge: {
        label: "since your review",
        title:
          "Showing what changed since the review you submitted on Aug 12. Rows you already reviewed are dimmed; files that did not move are folded. Press d to show everything.",
      },
      expandable: true,
      fileIndex: 0,
      filename: "apps/desktop/src/lib/review-items.ts",
      status: "modified",
    },
  },
  copied: {
    props: {
      additions: 12,
      copied: true,
      deletions: 3,
      fileIndex: 0,
      filename: "apps/desktop/src/lib/review-items.ts",
      status: "modified",
    },
  },
  crowd: {
    props: {
      active: true,
      additions: 12_438,
      copied: true,
      deletions: 9871,
      expandable: true,
      expanding: true,
      fileIndex: 4,
      filename: DEEP,
      status: "modified",
      updated: true,
      viewed: true,
    },
  },
  expanded: {
    props: {
      additions: 40,
      deletions: 12,
      expandable: true,
      expanded: true,
      fileIndex: 0,
      filename: "apps/desktop/src/quiet.css",
      status: "modified",
    },
  },
  expanding: {
    props: {
      additions: 40,
      deletions: 12,
      expandable: true,
      expanding: true,
      fileIndex: 0,
      filename: "apps/desktop/src/quiet.css",
      status: "modified",
    },
  },
  "markup-as-text": {
    props: {
      additions: 1,
      deletions: 1,
      fileIndex: 0,
      filename: 'src/<img src=x onerror="alert(1)">.ts',
      status: "modified",
    },
  },
  minimal: {
    props: {
      additions: 0,
      deletions: 0,
      fileIndex: 0,
      filename: "LICENSE",
      status: "modified",
    },
  },
  "no-viewed-control": {
    props: {
      additions: 24,
      deletions: 0,
      fileIndex: 0,
      filename: "packages/ledger/src/derive/session.ts",
      status: "modified",
      viewable: false,
    },
  },
  "no-extension": {
    props: {
      additions: 2,
      deletions: 2,
      fileIndex: 0,
      filename: ".github/workflows/Dockerfile",
      status: "modified",
    },
  },
  overflow: {
    props: {
      active: true,
      additions: 12_438,
      deletions: 9871,
      expandable: true,
      fileIndex: 3,
      filename: DEEP,
      status: "modified",
    },
  },
  removed: {
    props: {
      additions: 0,
      deletions: 1204,
      fileIndex: 2,
      filename: "apps/design-lab/src/theme.ts",
      status: "removed",
    },
  },
  renamed: {
    props: {
      additions: 8,
      deletions: 8,
      fileIndex: 5,
      filename: "packages/ui/src/hunk-row/hunk-row.tsx",
      previousFilename:
        "apps/desktop/src/components/review/internals/hunk-header-row.tsx",
      status: "renamed",
    },
  },
  root: {
    props: {
      additions: 3,
      deletions: 1,
      expandable: true,
      fileIndex: 0,
      filename: "README.md",
      status: "modified",
      viewed: true,
    },
  },
  unicode: {
    props: {
      additions: 21,
      deletions: 4,
      fileIndex: 0,
      filename: "文書/レビュー/محمد-الأمين/🦊-fixtures.ts",
      status: "modified",
    },
  },
  "unknown-status": {
    props: {
      additions: 5,
      deletions: 5,
      fileIndex: 0,
      filename: "apps/desktop/src/types.ts",
      status: "changed",
    },
  },
  updated: {
    props: {
      additions: 9,
      deletions: 2,
      fileIndex: 0,
      filename: "apps/desktop/src/store/app-store.ts",
      status: "modified",
      updated: true,
      viewed: true,
    },
  },
  viewed: {
    props: {
      additions: 9,
      deletions: 2,
      fileIndex: 0,
      filename: "apps/desktop/src/store/app-store.ts",
      status: "modified",
      viewed: true,
    },
  },
});
