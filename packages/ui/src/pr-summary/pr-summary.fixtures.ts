/**
 * Six unbounded strings and four numbers on three lines, so the cases are the
 * extremes of each: no checks at all, checks failing, a single file, a diff
 * in the tens of thousands, an unbreakable title token next to an unbreakable
 * URL, and CJK/RTL identity.
 *
 * updatedAt values are fixed timestamps, never Date.now() — the label is
 * relative, so a capture of "3m ago" expires within the hour. The far-past one
 * sits inside a year bucket, the future one pins "just now" permanently, and
 * the empty string is the API value that yields no label at all. The URLs
 * resolve nowhere on purpose: no capture may depend on the network.
 */
import type { CiStatus } from "../ci-pill/ci-pill.tsx";
import { defineEntry } from "../fixtures/fixtures.ts";
import { PrSummary, type SummaryPullRequest } from "./pr-summary.tsx";

const noop = () => {
  return;
};

const AVATAR = "https://example.test/a.png";
const UNBREAKABLE = "x".repeat(2000);
/* The title wraps instead of ellipsizing (a drawer is for reading the whole
   title), so its unbreakable token is capped at a few lines: 2,000 characters
   of it would be forty lines that push the CI row and the link out of the
   capture entirely, hiding the rest of the component behind the case. */
const UNBREAKABLE_WRAPPING = "x".repeat(320);

const handlers = {
  onOpenCiUrl: noop,
  onOpenPr: noop,
  onOpenTicket: noop,
};

function pr(overrides: Partial<SummaryPullRequest> = {}): SummaryPullRequest {
  return {
    additions: 412,
    author: "paulius",
    authorAvatarUrl: AVATAR,
    deletions: 96,
    number: 279,
    title: "SCR-2891 Port the review chrome into @nod/ui",
    updatedAt: "2024-08-01T00:00:00Z",
    url: "https://github.test/nod/nod/pull/279",
    ...overrides,
  };
}

const failing: CiStatus = {
  failed: 3,
  state: "failure",
  total: 14,
  url: "https://github.test/nod/nod/pull/279/checks",
};

const passing: CiStatus = {
  failed: 0,
  state: "success",
  total: 6,
  url: "https://github.test/nod/nod/pull/279/checks",
};

export const prSummaryEntry = defineEntry(PrSummary, {
  "ci-failing": {
    props: {
      ...handlers,
      ci: failing,
      fileCount: 23,
      openLabel: "Open on GitLab",
      pr: pr({ url: "https://gitlab.test/nod/nod/-/merge_requests/279" }),
      trackerBase: "https://tracker.test/browse/",
    },
  },
  "ci-none": {
    props: {
      ...handlers,
      ci: { failed: 0, state: "none", total: 0, url: "" },
      fileCount: 1,
      openLabel: "Open on GitHub",
      pr: pr({ additions: 1, deletions: 0 }),
    },
  },
  "huge-diff": {
    props: {
      ...handlers,
      ci: passing,
      fileCount: 1247,
      openLabel: "Open on GitHub",
      pr: pr({ additions: 128_402, deletions: 96_311, number: 1_048_576 }),
    },
  },
  "just-now": {
    props: {
      ...handlers,
      ci: passing,
      fileCount: 4,
      openLabel: "Open on GitHub",
      pr: pr({ updatedAt: "2099-01-01T00:00:00Z" }),
    },
  },
  "markup-as-text": {
    props: {
      ...handlers,
      fileCount: 2,
      openLabel: "Open on GitHub",
      pr: pr({
        author: "<script>alert(1)</script>",
        title: "<img onerror=alert(1) src=x> in a title",
      }),
    },
  },
  "no-date": {
    props: {
      ...handlers,
      fileCount: 0,
      openLabel: "Open on GitHub",
      pr: pr({ additions: 0, deletions: 0, updatedAt: "" }),
    },
  },
  overflow: {
    props: {
      ...handlers,
      ci: failing,
      fileCount: 9,
      openLabel: `Open on ${UNBREAKABLE}`,
      pr: pr({
        title: `SCR-2891 ${UNBREAKABLE_WRAPPING}`,
        url: `https://github.test/nod/nod/pull/${UNBREAKABLE}`,
      }),
      trackerBase: "https://tracker.test/browse/",
    },
  },
  typical: {
    props: {
      ...handlers,
      ci: passing,
      fileCount: 23,
      openLabel: "Open on GitHub",
      pr: pr(),
      trackerBase: "https://tracker.test/browse/",
    },
  },
  unicode: {
    props: {
      ...handlers,
      ci: passing,
      fileCount: 7,
      openLabel: "リポジトリで開く",
      pr: pr({
        author: "محمد الأمين",
        title: "レビュー画面のヘッダーを @nod/ui に移す 👩‍💻",
      }),
    },
  },
  ancient: {
    props: {
      ...handlers,
      fileCount: 3,
      openLabel: "Open on GitHub",
      pr: pr({ updatedAt: "2016-03-04T09:00:00Z" }),
    },
  },
});
