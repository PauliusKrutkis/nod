/**
 * Three verdicts × a summary × a pending-comment count, so the cases are the
 * combinations that change what the modal says or lets you do: each verdict
 * selected, the count wording at 0 / 1 / many, the own-PR restriction that
 * leaves Comment the only choice, the busy state that must keep a second ⌘↵
 * from sending a second review, and a failure the submit came back with.
 *
 * `comment` doubles as the disabled-submit case — a comment review with no
 * pending comments and an empty body carries nothing, so Submit stays off.
 * `overflow` is the narrow-panel case: an unbreakable token in the body and a
 * forge error long enough to fight the footer for its row. `markup-as-text` is
 * the security case — a summary that looks like a tag must render as text.
 */
import { defineEntry } from "../fixtures/fixtures.ts";
import { SubmitReviewModal } from "./submit-review-modal.tsx";

const noop = () => {
  return;
};

const shared = {
  busy: false,
  onOpenChange: noop,
  onSubmit: noop,
  open: true,
  pendingCount: 0,
};

const LONG_BODY = `Overall this is close, but the caching layer needs another pass before it ships.

The parse cache is keyed on the patch string, which is right, but nothing clears it when a PR is closed, so a long session grows it without bound. Suggest capping it the way the highlight cache is capped, or keying it on the file sha instead.

Second, the retry in fetchDetail swallows the abort error. That turns a cancelled navigation into a silent empty state, which is exactly the bug we chased for two days last month. Rethrow when the signal is aborted.

Everything else — the naming, the tests, the new fixtures — reads well. Happy to approve once those two are addressed.`;

export const submitReviewModalEntry = defineEntry(
  SubmitReviewModal,
  {
    approve: {
      props: {
        ...shared,
        initialEvent: "APPROVE",
        initialBody: "Ship it — the caching fix reads well.",
        pendingCount: 3,
      },
    },
    busy: {
      props: {
        ...shared,
        busy: true,
        initialBody: "Two small things, otherwise good.",
        pendingCount: 2,
      },
    },
    comment: { props: { ...shared } },
    error: {
      props: {
        ...shared,
        error:
          "GitHub rejected the review: pull request was closed before it could be submitted.",
        initialBody: "Left a few notes inline.",
        pendingCount: 2,
      },
    },
    "long-body": {
      props: { ...shared, initialBody: LONG_BODY, pendingCount: 7 },
    },
    "markup-as-text": {
      props: {
        ...shared,
        initialBody: '<img src=x onerror="alert(1)"> looks suspicious here.',
        pendingCount: 1,
      },
    },
    overflow: {
      props: {
        ...shared,
        error: `Request failed: ${"unbreakable-error-token-".repeat(12)}`,
        initialBody: `signature=${"a1b2c3d4e5".repeat(120)}`,
        initialEvent: "REQUEST_CHANGES",
        pendingCount: 1,
      },
    },
    "own-pr": {
      props: { ...shared, ownPr: true, pendingCount: 4 },
    },
    "pending-many": {
      props: { ...shared, initialEvent: "APPROVE", pendingCount: 128 },
    },
    "pending-one": {
      props: { ...shared, pendingCount: 1 },
    },
    "request-changes": {
      props: {
        ...shared,
        initialBody: "The abort path still swallows the error.",
        initialEvent: "REQUEST_CHANGES",
        pendingCount: 2,
      },
    },
    unicode: {
      props: {
        ...shared,
        initialBody:
          "藤本 さくら: この変更は問題ありません。\nمحمد الأمين: شكرا لك 👍🏽",
        initialEvent: "APPROVE",
        pendingCount: 2,
      },
    },
  },
  { dialog: true }
);
