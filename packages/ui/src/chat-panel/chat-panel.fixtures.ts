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
  onOpenSkills: noop,
  skillCount: 2,
  onRevealChip: noop,
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
    at: "2025-06-03T09:59:00Z",
    id: "u1",
    kind: "user",
    regions: [chip({})],
    text: "Is this retry loop safe against a wake from sleep?",
  },
  {
    at: "2025-06-03T10:00:00Z",
    error: null,
    id: "a1",
    kind: "assistant",
    partial: "",
    text: "Yes — the ladder position rides in the ledger (src/lib/poll.ts:41), so a wake resumes where it left off instead of resetting the backoff.",
    workedMs: 4200,
    activity: ["Reading the diff", 'Searching for "ladder"'],
    reasoning:
      "The ledger write happens before the yield, so a wake reads a consistent cursor.",
  },
  {
    at: "2025-06-03T10:01:00Z",
    id: "u2",
    kind: "user",
    regions: [],
    text: "What happens when the cursor key is stale?",
  },
  {
    at: "2025-06-03T10:02:00Z",
    error: null,
    id: "a2",
    kind: "assistant",
    partial: "",
    text: "The poll refetches from scratch: getCursor (src/lib/poll.ts:58) treats a stale key as absent.",
    activity: [],
    reasoning: "",
    workedMs: 1400,
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
          activity: [],
          reasoning: "",
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
          activity: [],
          reasoning: "",
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
          activity: [],
          reasoning: "",
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
          activity: [],
          reasoning: "",
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
          activity: [],
          reasoning: "",
        },
      ],
    }),
  },
  "model-picker": {
    props: base({
      composerValue: "Which model answers this?",
      model: {
        current: "anthropic.claude-sonnet-4-5 (eu-west1)",
        models: [
          {
            contextLength: 200_000,
            id: "anthropic.claude-sonnet-4-5 (eu-west1)",
          },
          { contextLength: 128_000, id: "gpt-4o" },
        ],
        onPick: noop,
      },
      turns: [CONVERSATION[0]],
    }),
  },
  "pasted-and-note": {
    props: base({
      chips: [
        chip({
          code: "const a = 1;\nconst b = 2;",
          filePath: "",
          lineRange: "",
          side: "",
        }),
      ],
      contextNote:
        "Preparing the repository snapshot — repo-wide tools arrive when it's ready.",
      turns: [CONVERSATION[0]],
    }),
  },
  "skill-chip": {
    props: base({
      chips: [chip({})],
      composerValue: "Focus on the retry loop.",
      skill: "pr-validity",
      turns: [
        {
          id: "u0",
          kind: "user",
          regions: [],
          skill: "security-pass",
          text: "Run the security pass.",
        },
        {
          error: null,
          id: "a0",
          kind: "assistant",
          partial: "",
          text: "Nothing alarming; two nits staged.",
          activity: [],
          reasoning: "",
        },
      ],
    }),
  },
  "slash-suggestions": {
    props: base({
      composerValue: "/pr",
      suggestions: {
        items: ["pr-validity", "pr-summary"],
        onDismiss: noop,
        onMove: noop,
        onPick: noop,
        query: "pr",
        selected: 0,
      },
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
          activity: [],
          reasoning: "",
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
          activity: [],
          reasoning: "",
        },
      ],
    }),
  },
  threads: {
    props: base({
      threads: {
        active: "t2",
        items: [
          { id: "t1", title: "Is this retry loop safe against a wake…" },
          { id: "t2", title: "Review the error paths" },
        ],
        onNew: noop,
        onPick: noop,
        onRemove: noop,
      },
      turns: CONVERSATION.slice(2),
    }),
  },
  "trail-open": {
    props: base({
      turns: [
        CONVERSATION[0],
        {
          activity: ["Reading the diff", 'Searching for "retry"'],
          at: "2025-06-03T10:00:00Z",
          error: null,
          id: "a1",
          kind: "assistant",
          partial: "",
          reasoning:
            "Two call sites share the ladder; the second one resets it, which is the bug the reviewer is asking about.",
          text: "The reset in `poll.ts:58` is the one to fix.",
          workedMs: 12_400,
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
          activity: ['Searching for "backoff"'],
          reasoning: "Weighing the two call sites.",
          startedAt: -4000,
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
          activity: [],
          reasoning: "",
        },
      ],
    }),
  },
});
