/**
 * The header is a single row that has to survive everything a PR can be, so
 * the cases are the extremes of each slot at once: `minimal` is a bare PR with
 * every optional prop omitted, `everything` wears draft + failing CI + both
 * verdict rosters + drafts waiting + a conversation count, and `overflow`
 * combines an unbreakable title token with a release-branch name that no
 * window is wide enough for.
 *
 * CI state is a plain string, not a union of the three states the dot knows:
 * providers grow states, and the fallback (no dot at all, a generic tooltip)
 * is a real code path — `ci-unknown` pins it next to `ci-none`.
 *
 * Nothing here reads the clock: the header shows no timestamps, which is why
 * it has no date fixtures at all while pr-summary next door is full of them.
 */
import { defineEntry } from "../fixtures/fixtures.ts";
import type { Reviewer } from "../review-verdicts/review-verdicts.tsx";
import { type HeaderPullRequest, ReviewHeader } from "./review-header.tsx";

const noop = () => {
  return;
};

const AVATAR = "https://example.test/a.png";
const UNBREAKABLE = "x".repeat(2000);

const handlers = {
  onCopyBranch: noop,
  onOpenSubmit: noop,
  onOpenTicket: noop,
  onToggleRightPanel: noop,
  onToggleSidebar: noop,
};

function pr(overrides: Partial<HeaderPullRequest> = {}): HeaderPullRequest {
  return {
    author: "paulius",
    authorAvatarUrl: AVATAR,
    baseRef: "main",
    draft: false,
    headRef: "feat/port-review-chrome",
    merged: false,
    number: 279,
    repo: "nod/nod",
    state: "open",
    title: "SCR-2891 Port the review chrome into @nod/ui",
    ...overrides,
  };
}

const reviewers: Reviewer[] = [
  { user: "asta", userAvatarUrl: AVATAR },
  { user: "brynn", userAvatarUrl: AVATAR },
  { user: "cai", userAvatarUrl: null },
  { user: "dilnoza", userAvatarUrl: AVATAR },
];

export const reviewHeaderEntry = defineEntry(ReviewHeader, {
  "ci-failure": {
    props: {
      ...handlers,
      changesRequested: reviewers.slice(0, 1),
      ciState: "failure",
      convoCount: 12,
      pr: pr(),
      rightOpen: true,
    },
  },
  "ci-none": {
    props: { ...handlers, ciState: "none", pr: pr() },
  },
  "ci-unknown": {
    props: { ...handlers, ciState: "queued", convoCount: 3, pr: pr() },
  },
  everything: {
    props: {
      ...handlers,
      approved: reviewers.slice(0, 2),
      changesRequested: reviewers.slice(2),
      ciState: "pending",
      convoCount: 148,
      pendingCount: 7,
      pr: pr({ draft: true }),
      showSidebarToggle: true,
      trackerBase: "https://tracker.test/browse/",
    },
  },
  "huge-counts": {
    props: {
      ...handlers,
      approved: reviewers,
      ciState: "success",
      convoCount: 12_438,
      pendingCount: 999,
      pr: pr({ number: 1_048_576 }),
    },
  },
  merged: {
    props: {
      ...handlers,
      approved: reviewers.slice(0, 3),
      ciState: "success",
      convoCount: 4,
      pr: pr({ merged: true, state: "closed" }),
    },
  },
  minimal: {
    props: {
      ...handlers,
      pr: {
        author: "a",
        draft: false,
        merged: false,
        number: 1,
        repo: "n/n",
        state: "open",
        title: "x",
      },
    },
  },
  overflow: {
    props: {
      ...handlers,
      approved: reviewers,
      ciState: "failure",
      convoCount: 99,
      pendingCount: 3,
      pr: pr({
        baseRef: "release/2026.08-lts-maintenance-track-with-a-very-long-name",
        headRef: `feature/${UNBREAKABLE}`,
        title: `SCR-2891 ${UNBREAKABLE}`,
      }),
      showSidebarToggle: true,
      trackerBase: "https://tracker.test/browse/",
    },
  },
  "unknown-state": {
    props: {
      ...handlers,
      pr: pr({ state: "reopened" }),
    },
  },
  unicode: {
    props: {
      ...handlers,
      approved: [{ user: "藤本 さくら", userAvatarUrl: AVATAR }],
      changesRequested: [{ user: "محمد الأمين", userAvatarUrl: null }],
      ciState: "success",
      convoCount: 9,
      pr: pr({
        author: "محمد الأمين",
        baseRef: "الرئيسية",
        headRef: "機能/レビュー画面",
        repo: "株式会社/設計システム",
        title: "レビュー画面のヘッダーを @nod/ui に移す 👩‍💻",
      }),
    },
  },
  "markup-as-text": {
    props: {
      ...handlers,
      pr: pr({
        author: "<script>alert(1)</script>",
        headRef: "<img onerror=alert(1) src=x>",
        title: "<img onerror=alert(1) src=x> in a title",
      }),
    },
  },
});
