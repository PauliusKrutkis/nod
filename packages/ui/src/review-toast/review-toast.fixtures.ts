/**
 * The card is 340px of chrome wrapped around two unbounded strings and a
 * number, so the fixtures are mostly about the title and the author refusing
 * to be small: an unbreakable token, a machine account's name, and a PR
 * number long past six digits. The "+N more" line has its own boundary —
 * absent at 0, singular at 1, plural above — and each is pinned, because the
 * pluralisation is the kind of thing a refactor silently inverts. The reply
 * face repeats that boundary on its own noun ("reply"/"replies"), since it
 * pluralises separately from "review request".
 */
import { defineEntry } from "../fixtures/fixtures.ts";
import { type ReviewRequest, ReviewToast } from "./review-toast.tsx";

const noop = () => {
  return;
};

const AVATAR = "https://example.test/a.png";
const UNBREAKABLE = "x".repeat(2000);

function request(overrides: Partial<ReviewRequest>): ReviewRequest {
  return {
    author: "paulius",
    authorAvatarUrl: AVATAR,
    number: 274,
    title: "Make the gallery the source of truth",
    ...overrides,
  };
}

export const reviewToastEntry = defineEntry(ReviewToast, {
  cjk: {
    props: {
      onDismiss: noop,
      onOpen: noop,
      request: request({
        author: "藤本 さくら",
        title: "ギャラリーを唯一の情報源にする",
      }),
    },
  },
  "huge-number": {
    props: {
      extraCount: 12,
      onDismiss: noop,
      onOpen: noop,
      request: request({ number: 999_999 }),
    },
  },
  "markup-as-text": {
    props: {
      onDismiss: noop,
      onOpen: noop,
      request: request({
        author: '<img src=x onerror="alert(1)">',
        title: 'Fix <img src=x onerror="alert(1)"> in the header',
      }),
    },
  },
  minimal: {
    props: {
      onDismiss: noop,
      onOpen: noop,
      request: { author: "a", number: 1, title: "x" },
    },
  },
  "no-avatar": {
    props: {
      onDismiss: noop,
      onOpen: noop,
      request: request({ author: "renovate[bot]", authorAvatarUrl: null }),
    },
  },
  "one-more": {
    props: {
      extraCount: 1,
      onDismiss: noop,
      onOpen: noop,
      request: request({}),
    },
  },
  overflow: {
    props: {
      extraCount: 128,
      onDismiss: noop,
      onOpen: noop,
      request: request({
        author: "a-very-long-machine-account-name-for-continuous-delivery",
        title: `Bump ${UNBREAKABLE}`,
      }),
    },
  },
  reply: {
    props: {
      kind: "response" as const,
      onDismiss: noop,
      onOpen: noop,
      request: request({ author: "alice", title: "Tighten the retry backoff" }),
    },
  },
  "reply-many": {
    props: {
      extraCount: 9,
      kind: "response" as const,
      onDismiss: noop,
      onOpen: noop,
      request: request({ author: "alice", title: "Tighten the retry backoff" }),
    },
  },
  "reply-one-more": {
    props: {
      extraCount: 1,
      kind: "response" as const,
      onDismiss: noop,
      onOpen: noop,
      request: request({ author: "alice", title: "Tighten the retry backoff" }),
    },
  },
  rtl: {
    props: {
      onDismiss: noop,
      onOpen: noop,
      request: request({
        author: "محمد الأمين",
        title: "إصلاح ترتيب الأعمدة في لوحة المراجعة",
      }),
    },
  },
  typical: {
    props: { onDismiss: noop, onOpen: noop, request: request({}) },
  },
});
