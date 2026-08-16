/**
 * The card's space: a one-line suggestion, a multi-line one carrying the
 * range chip, a body with a ```suggestion fence (the markdown renderer's
 * apply-shaped card inside the AI material), and the hostile corners — an
 * unbreakable token that must wrap instead of widening the diff column,
 * CJK/RTL text, and markup that must come out inert. No fixture supplies
 * renderMarkdown, so bodies pass through the package's sanitizing Markdown.
 */

import { defineEntry } from "../fixtures/fixtures.ts";
import {
  SuggestedCommentCard,
  type SuggestedCommentCardProps,
} from "./suggested-comment.tsx";

const noop = () => undefined;

const base = (
  over: Partial<SuggestedCommentCardProps>
): SuggestedCommentCardProps => ({
  body: "This constant looks off — `retryLimit` was 3 before the rename; should this stay in sync with the docs?",
  line: 42,
  onAccept: noop,
  onDiscard: noop,
  onEdit: noop,
  ...over,
});

const LONG_TOKEN = `req_${"9f8e7d6c".repeat(250)}`;

export const suggestedCommentEntry = defineEntry(SuggestedCommentCard, {
  "markup-as-text": {
    props: base({
      body: 'Repro: <img src="./x.png" onerror="alert(1)"> and <script>alert(2)</script> stay text.',
    }),
  },
  "multi-line": {
    props: base({ line: 48, startLine: 42 }),
  },
  overflow: {
    props: base({
      body: `Fails only for tokens shaped like ${LONG_TOKEN} which never wrap on their own.`,
    }),
  },
  suggestion: {
    props: base({
      body: "Guard the empty case:\n\n```suggestion\n  if (items.length === 0) return [];\n```",
    }),
  },
  typical: {
    props: base({}),
  },
  unicode: {
    props: base({
      body: "この分岐は空配列で落ちます。 يجب إضافة حارس هنا. 🙏",
    }),
  },
});
