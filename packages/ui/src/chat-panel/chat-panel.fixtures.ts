/**
 * The panel's space is the conversation's shapes: empty (the hint), a
 * typical exchange, every in-flight state (spinner before the first delta,
 * a growing partial, the tool-activity line), a settled error, and the
 * footer's states (pending chips, the proposals summary, a draft in the
 * composer). Hostile corners: a 10k-character partial that must scroll
 * rather than widen, an unclosed code fence mid-stream (the fallback
 * renderer shows it literally — markup is read, never executed), RTL and
 * CJK text, thirty chips, and an unbreakable token in a chip label. No
 * fixture supplies renderMarkdown, so answers full of markup prove the
 * literal fallback. Timestamps do not exist here; ids are opaque strings.
 */

import { defineEntry } from "../fixtures/fixtures.ts";
import {
  ChatPanel,
  type ChatPanelProps,
  type ChatRegionChip,
} from "./chat-panel.tsx";

const noop = () => undefined;

const chip = (over: Partial<ChatRegionChip>): ChatRegionChip => ({
  code: "const x = 1;",
  filePath: "src/lib/fuzzy.ts",
  lineRange: "12–18",
  side: "RIGHT",
  ...over,
});

const base = (over: Partial<ChatPanelProps>): ChatPanelProps => ({
  chips: [],
  composerValue: "",
  focusSeq: 0,
  onChangeComposer: noop,
  onEscape: noop,
  onRemoveChip: noop,
  onSend: noop,
  onStop: noop,
  pending: false,
  proposals: null,
  suggestions: null,
  turns: [],
  ...over,
});

const CONVERSATION: ChatPanelProps["turns"] = [
  {
    id: "u1",
    kind: "user",
    regions: [chip({})],
    text: "Is this retry loop safe against a wake from sleep?",
  },
  {
    error: null,
    id: "a1",
    kind: "assistant",
    partial: "",
    text: "Yes — the ladder position rides in the ledger (src/lib/poll.ts:41), so a wake resumes where it left off instead of resetting the backoff.",
    toolNote: null,
  },
  {
    id: "u2",
    kind: "user",
    regions: [],
    text: "What happens when the cursor key is stale?",
  },
  {
    error: null,
    id: "a2",
    kind: "assistant",
    partial: "",
    text: "The poll refetches from scratch: getCursor (src/lib/poll.ts:58) treats a stale key as absent.",
    toolNote: null,
  },
];

const LONG_TOKEN = `req_${"9f8e7d6c".repeat(250)}`;

export const chatPanelEntry = defineEntry(ChatPanel, {
  "chips-crowd": {
    props: base({
      chips: Array.from({ length: 30 }, (_, i) =>
        chip({ filePath: `src/module-${i}/handler.ts`, lineRange: `${i + 1}` })
      ),
      composerValue: "Compare these hot paths.",
    }),
  },
  "draft-and-chips": {
    props: base({
      chips: [
        chip({}),
        chip({ filePath: "src/store/app-store.ts", lineRange: "306–315" }),
      ],
      composerValue: "Why do these two disagree about the pending key?",
      turns: CONVERSATION,
    }),
  },
  empty: {
    props: base({}),
  },
  error: {
    props: base({
      turns: [
        CONVERSATION[0],
        {
          error: "AI provider error (402): insufficient credits",
          id: "a1",
          kind: "assistant",
          partial: "",
          text: null,
          toolNote: null,
        },
      ],
    }),
  },
  "fence-mid-stream": {
    props: base({
      pending: true,
      turns: [
        CONVERSATION[0],
        {
          error: null,
          id: "a1",
          kind: "assistant",
          partial:
            "The guard lives here:\n```ts\nif (stale(cursor)) {\n  return refetch(",
          text: null,
          toolNote: null,
        },
      ],
    }),
  },
  "markup-as-text": {
    props: base({
      turns: [
        {
          id: "u1",
          kind: "user",
          regions: [chip({ filePath: "<b>not/markup</b>.ts", lineRange: "7" })],
          text: 'Check <img src="./x.png" onerror="alert(1)"> handling.',
        },
        {
          error: null,
          id: "a1",
          kind: "assistant",
          partial: "",
          text: "<script>alert(2)</script> stays text, as does <svg onload=alert(3)>.",
          toolNote: null,
        },
      ],
    }),
  },
  overflow: {
    props: base({
      chips: [chip({ filePath: LONG_TOKEN, lineRange: "" })],
      turns: [
        CONVERSATION[0],
        {
          error: null,
          id: "a1",
          kind: "assistant",
          partial: "",
          text: `Reproduced with request id ${LONG_TOKEN} which never wraps on its own.`,
          toolNote: null,
        },
      ],
    }),
  },
  "partial-10k": {
    props: base({
      pending: true,
      turns: [
        CONVERSATION[0],
        {
          error: null,
          id: "a1",
          kind: "assistant",
          partial: `The loop has three exits. ${"Each exit re-arms the ladder before yielding, so the next tick observes a consistent cursor. ".repeat(100)}`,
          text: null,
          toolNote: null,
        },
      ],
    }),
  },
  proposals: {
    props: base({
      proposals: { count: 3, onAcceptAll: noop, onDiscardAll: noop },
      turns: [
        CONVERSATION[0],
        {
          error: null,
          id: "a1",
          kind: "assistant",
          partial: "",
          text: "I staged 3 suggested comments in the diff — review them at their anchors.",
          toolNote: null,
        },
      ],
    }),
  },
  thinking: {
    props: base({
      pending: true,
      turns: [
        CONVERSATION[0],
        {
          error: null,
          id: "a1",
          kind: "assistant",
          partial: "",
          text: null,
          toolNote: null,
        },
      ],
    }),
  },
  "tool-activity": {
    props: base({
      pending: true,
      turns: [
        CONVERSATION[0],
        {
          error: null,
          id: "a1",
          kind: "assistant",
          partial: "",
          text: null,
          toolNote: 'Searching for "backoff"',
        },
      ],
    }),
  },
  typical: {
    props: base({ turns: CONVERSATION }),
  },
  unicode: {
    props: base({
      chips: [chip({ filePath: "src/検索/一致.ts", lineRange: "3–9" })],
      turns: [
        {
          id: "u1",
          kind: "user",
          regions: [],
          text: "この分岐は空配列で落ちますか？",
        },
        {
          error: null,
          id: "a1",
          kind: "assistant",
          partial: "",
          text: "لا — الحارس في السطر ٤١ يعيد مصفوفة فارغة. 🙏",
          toolNote: null,
        },
      ],
    }),
  },
});
