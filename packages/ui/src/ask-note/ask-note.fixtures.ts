/**
 * An exchange is model output, which makes every string case a real one:
 * answers arrive in paragraphs, in fenced code, as an unbroken token the
 * provider echoed back, and as markup that must be read rather than run. The
 * in-flight cases matter as much as the settled ones — a pending ask disables
 * its own input, and the note is on screen for the whole of it.
 *
 * The chip carries a file path with a line range, so `overflow` pairs the
 * longest plausible target with the worst answer: at the 280px sidebar width
 * that pair is what pushed the note open before the chip learned to clip.
 */

import { defineEntry } from "../fixtures/fixtures.ts";
import { AskNote, type AskNoteExchange } from "./ask-note.tsx";

const noop = () => {
  return;
};

const promote = (_text: string) => {
  return;
};

const shared = {
  focusSeq: 0,
  onClose: noop,
  onPromote: promote,
  onSubmit: noop,
  pending: false,
};

function exchange(overrides: Partial<AskNoteExchange>): AskNoteExchange {
  return {
    answer: null,
    error: null,
    id: 1,
    partial: "",
    question: "What does this change do?",
    ...overrides,
  };
}

const LONG_ANSWER = [
  "The patch renames the retry knob from `attempts` to `maxAttempts` and moves the default out of the call site into the client.",
  "Everything that read the old name goes through `resolveRetry`, so the rename is mechanical; the behavioural change is the default itself, which drops from five attempts to three.",
  "Worth checking: the backoff table is indexed by attempt number, and with one fewer attempt the last entry is now unreachable. It is dead configuration rather than a bug, but it will confuse the next reader.",
].join("\n\n");

const CODE_ANSWER =
  "Guard the parse instead of trusting the header:\n\n```ts\nconst parsed = safeParse(schema, body);\nif (!parsed.ok) {\n  return problem(400, parsed.error);\n}\n```\n\nThat keeps the 400 in one place.";

const UNBREAKABLE = `sk-${"nod".repeat(40)}`;

export const askNoteEntry = defineEntry(AskNote, {
  answer: {
    props: {
      ...shared,
      exchanges: [
        exchange({
          answer: "It renames the retry knob and lowers the default to three.",
        }),
      ],
      label: "src/lib/retry.ts:41",
    },
  },
  "answer-with-code": {
    props: {
      ...shared,
      exchanges: [
        exchange({
          answer: CODE_ANSWER,
          question: "How should this handle a malformed body?",
        }),
      ],
      label: "src/routes/upload.ts:88-104",
    },
  },
  conversation: {
    props: {
      ...shared,
      exchanges: [
        exchange({
          answer: "It renames the retry knob and lowers the default to three.",
        }),
        exchange({
          answer:
            "Nothing outside this module reads `attempts`, so the rename is safe.",
          id: 2,
          question: "Does anything else read the old name?",
        }),
        exchange({
          answer: "Yes — the backoff table's last entry is now unreachable.",
          id: 3,
          question: "Anything left over?",
        }),
      ],
      label: "src/lib/retry.ts:41",
    },
  },
  error: {
    props: {
      ...shared,
      exchanges: [
        exchange({
          error:
            "The provider rejected the request: your account is out of credits.",
        }),
      ],
      label: "src/lib/retry.ts:41",
    },
  },
  idle: {
    props: {
      ...shared,
      exchanges: [],
      label: "Whole pull request",
      onPromote: null,
    },
  },
  "long-answer": {
    props: {
      ...shared,
      exchanges: [
        exchange({ answer: LONG_ANSWER, question: "What does this PR do?" }),
      ],
      label: "Whole pull request",
      onPromote: null,
    },
  },
  "markup-as-text": {
    props: {
      ...shared,
      exchanges: [
        exchange({
          answer:
            'The template interpolates unescaped: <img src=x onerror="alert(1)"> reaches the page as markup.',
          question: 'Is <img src=x onerror="alert(1)"> handled here?',
        }),
      ],
      label: "src/render/template.ts:12",
    },
  },
  overflow: {
    props: {
      ...shared,
      exchanges: [
        exchange({
          answer: `The key in the diff is live — rotate it. ${UNBREAKABLE}`,
          question: `Why does the fixture embed ${UNBREAKABLE}?`,
        }),
      ],
      label:
        "packages/integrations/src/providers/github/enterprise/webhooks/handler.ts:1204-1288",
    },
  },
  streaming: {
    props: {
      ...shared,
      exchanges: [
        exchange({
          partial:
            "It renames the retry knob from `attempts` to `maxAttempts`, and the default mov",
        }),
      ],
      label: "src/lib/retry.ts:41",
      pending: true,
    },
  },
  thinking: {
    props: {
      ...shared,
      exchanges: [exchange({})],
      label: "src/lib/retry.ts:41",
      pending: true,
    },
  },
  unicode: {
    props: {
      ...shared,
      exchanges: [
        exchange({
          answer:
            "この行はリトライ回数を三回に減らします。محمد الأمين راجع التغيير ووافق عليه. 🦊‍🔥",
          question: "この変更は何をしますか？",
        }),
      ],
      label: "src/lib/リトライ.ts:41",
    },
  },
});
