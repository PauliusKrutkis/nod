/**
 * The composer stays uncontrolled — its draft is the DOM — but `initialPieces`
 * seeds the field once on mount, the way `initialMarkdown` seeds the comment
 * composer. That is what lets these fixtures pin the states that actually
 * broke during the chat work: a chip on the prose baseline, a skill and a
 * code chip in one sentence, and a path long enough to need its middle cut.
 */

import { defineEntry } from "../fixtures/fixtures.ts";
import {
  ChatComposer,
  type ChatComposerPiece,
  type ChatComposerProps,
} from "./chat-composer.tsx";

const noop = () => undefined;

const base = (over: Partial<ChatComposerProps>): ChatComposerProps => ({
  onSend: noop,
  placeholder: "Ask about this pull request…",
  ...over,
});

const region = (filePath: string, lineRange: string): ChatComposerPiece => ({
  kind: "code",
  region: { code: "const backoff = 200;", filePath, lineRange, side: "RIGHT" },
});

const pasted: ChatComposerPiece = {
  kind: "code",
  region: {
    code: "if (!ready) {\n  return null;\n}",
    filePath: "",
    lineRange: "",
    side: "",
  },
};

export const chatComposerEntry = defineEntry(ChatComposer, {
  /** A skill, prose, and an attached region in the order they were put
   *  there — the ordering the whole inline-chip design exists for. */
  "draft-with-chips": {
    props: base({
      initialPieces: [
        { kind: "skill", name: "pr-validity" },
        { kind: "text", text: "focus on " },
        region("src/lib/review-items.ts", "88–140"),
        { kind: "text", text: " and whether it rebuilds per render" },
      ],
    }),
  },
  /** Pasted code has no path, so its chip counts lines instead — and it
   *  sits beside a long path that has to lose its middle. */
  "draft-with-pasted-code": {
    props: base({
      initialPieces: [
        { kind: "text", text: "does " },
        pasted,
        { kind: "text", text: " match " },
        region(
          "apps/desktop/src/components/review/review-screen.tsx",
          "941–988"
        ),
        { kind: "text", text: "?" },
      ],
    }),
  },
  overflow: {
    props: base({
      placeholder: `Ask about ${"this-unbreakable-placeholder".repeat(8)}`,
    }),
  },
  reply: {
    props: base({ placeholder: "Reply…" }),
  },
  typical: {
    props: base({}),
  },
  unicode: {
    props: base({ placeholder: "このプルリクエストについて質問する…" }),
  },
});
