/**
 * The composer is uncontrolled — its draft is the DOM — so a fixture cannot
 * seed one through props. What it can pin is the empty field: the placeholder
 * that stands in for a message, at the widths the dock takes. Everything with
 * content in it is exercised through the panel's own fixtures, where a sent
 * turn shows the same chips inline.
 */

import { defineEntry } from "../fixtures/fixtures.ts";
import { ChatComposer, type ChatComposerProps } from "./chat-composer.tsx";

const noop = () => undefined;

const base = (over: Partial<ChatComposerProps>): ChatComposerProps => ({
  onSend: noop,
  placeholder: "Ask about this pull request…",
  ...over,
});

export const chatComposerEntry = defineEntry(ChatComposer, {
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
