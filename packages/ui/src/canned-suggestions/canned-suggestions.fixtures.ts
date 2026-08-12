/**
 * The panel takes already-matched lines, so the hostile payloads are the
 * saved lines themselves — reviewers write these, and nothing validates them
 * on the way into storage.
 *
 * `query` is a prefix of every item in each fixture, because matchCanned
 * cannot produce anything else; a fixture that broke that would be shooting a
 * state the component can never be in. `empty` pins the render-nothing
 * contract: no matches is the common case on most keystrokes, and the panel
 * has to leave the composer's geometry untouched when it has nothing to say.
 */

import { defineEntry } from "../fixtures/fixtures.ts";
import { CannedSuggestions } from "./canned-suggestions.tsx";

const noop = (_text: string) => {
  return;
};

const shared = { onPick: noop, selected: 0 };

const PARAGRAPH =
  "Not blocking, but this is the third place that reimplements the same retry loop, and the next one to touch it will not know the other two exist — worth pulling out before it spreads again.";

export const cannedSuggestionsEntry = defineEntry(CannedSuggestions, {
  empty: {
    props: { ...shared, items: [], query: "zz" },
    rendersNothing: true,
  },
  full: {
    props: {
      ...shared,
      items: [
        "nit: naming",
        "nit: this reads better as an early return",
        "nit: unused import",
        "nit: spelling",
        "nit: prefer const",
        "nit: stray console.log",
      ],
      query: "nit",
    },
  },
  "markup-as-text": {
    props: {
      ...shared,
      items: [
        "Needs a test — see `<Foo onError={() => {}} />` above",
        "Needs a <script>alert(1)</script> guard here",
      ],
      query: "Needs a",
    },
  },
  minimal: {
    props: { ...shared, items: ["nit: naming"], query: "nit" },
  },
  overflow: {
    props: { ...shared, items: [PARAGRAPH], query: "Not blocking" },
  },
  "query-nearly-whole-line": {
    props: {
      ...shared,
      items: ["Prefer an early return here."],
      query: "Prefer an early return here",
    },
  },
  "second-selected": {
    props: {
      ...shared,
      items: [
        "Worth a comment explaining why.",
        "Worth a test for the empty case.",
      ],
      query: "Worth a",
      selected: 1,
    },
  },
  typical: {
    props: {
      ...shared,
      items: [
        "Needs a test.",
        "Needs a changelog entry.",
        "Needs a migration for the existing rows.",
      ],
      query: "Needs a",
    },
  },
  unicode: {
    props: {
      ...shared,
      items: ["これはテストが必要です。", "これは移行スクリプトが必要です。"],
      query: "これは",
    },
  },
});
