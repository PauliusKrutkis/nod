/**
 * A 380px column holding two unbounded lists and a title that is a commit
 * subject, so the hostile cases are the pane refusing to be small: forty
 * files with monorepo-length paths, an unbreakable path token, a
 * provenance list that is one giant squash, both lists empty at once (a
 * topic can be fully approval-covered yet still selected), and markup
 * arriving as text. `no-story` pins the title fallback when the leading
 * subject is empty — the topic name carries the head alone.
 */
import { defineEntry } from "../fixtures/fixtures.ts";
import { type LedgerTopic, LedgerTopicDetail } from "./ledger-topic-detail.tsx";

const UNBREAKABLE = "x".repeat(2000);

function topic(overrides: Partial<LedgerTopic>): LedgerTopic {
  return {
    deltaSince: null,
    files: [
      { lines: 128, path: "apps/desktop/src/components/chat/chat-tab.tsx" },
      { lines: 64, path: "packages/ui/src/chat-panel/chat-panel.tsx" },
      { lines: 12, path: "docs/AI.md" },
    ],
    lines: 204,
    provenance: [
      { label: "#348", subject: "feat(chat): the AI chat panel" },
      { label: "#358", subject: "feat(chat): suggested comments" },
      { label: "4e43d2a", subject: "fix chat scroll pinning" },
    ],
    regions: 12,
    subject: "feat(chat): the AI chat panel — chat, skills, and suggestions",
    topic: "chat-panel",
    ...overrides,
  };
}

export const ledgerTopicDetailEntry = defineEntry(LedgerTopicDetail, {
  delta: {
    props: {
      topic: topic({
        deltaSince: { actor: "paulius", sha: "319aa0f" },
      }),
    },
  },
  "empty-lists": {
    props: {
      topic: topic({ files: [], lines: 0, provenance: [], regions: 0 }),
    },
  },
  "file-flood": {
    props: {
      topic: topic({
        files: Array.from({ length: 40 }, (_, i) => ({
          lines: i * 37,
          path: `apps/desktop/src/components/review/deeply/nested/path/segment-${i}/component-${i}.tsx`,
        })),
      }),
    },
  },
  "markup-as-text": {
    props: {
      topic: topic({
        provenance: [
          { label: "#1", subject: '<script>alert("x")</script> as text' },
        ],
        subject: '<img src=x onerror="alert(1)"> stays text',
      }),
    },
  },
  "no-story": {
    props: { topic: topic({ subject: "" }) },
  },
  overflow: {
    props: {
      topic: topic({
        files: [{ lines: 12_438, path: UNBREAKABLE }],
        lines: 12_438,
        subject: UNBREAKABLE,
        topic: UNBREAKABLE,
      }),
    },
  },
  singular: {
    props: {
      topic: topic({
        files: [{ lines: 1, path: "a.ts" }],
        lines: 1,
        provenance: [{ label: "#1", subject: "one" }],
        regions: 1,
      }),
    },
  },
  typical: {
    props: { topic: topic({}) },
  },
  unicode: {
    props: {
      topic: topic({
        provenance: [
          { label: "藤本さ", subject: "محمد الأمين merged the stack 👨‍👩‍👧‍👦" },
        ],
        subject: "藤本 さくら の機能 — bidi محمد mix 🎉",
      }),
    },
  },
});
