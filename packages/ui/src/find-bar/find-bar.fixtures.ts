/**
 * The bar is a fixed frame around two things that grow without limit: the
 * query the reader typed and the counter the host computed. Fixtures push
 * both — an unbreakable 2,000-character token, a bidi query, and a five-digit
 * "1234/5678" — because the bar floats over the diff with no room to spare,
 * and at the 280px width it is wider than the pane it sits in.
 *
 * The remaining cases are the states the bar owns: nothing typed (blank
 * counter), typed with no hits (red counter, dead arrows), the match-case
 * toggle pressed, and closed, whose contract is rendering nothing at all.
 */
import { defineEntry } from "../fixtures/fixtures.ts";
import { FindBar } from "./find-bar.tsx";

const noop = () => {
  return;
};

const shared = {
  caseSensitive: false,
  focusSeq: 0,
  onClose: noop,
  onNext: noop,
  onPrev: noop,
  onQueryChange: noop,
  onToggleCase: noop,
  open: true,
};

export const findBarEntry = defineEntry(FindBar, {
  "case-sensitive": {
    props: {
      ...shared,
      caseSensitive: true,
      current: 2,
      query: "ReviewList",
      total: 6,
    },
  },
  closed: {
    props: { ...shared, current: 0, open: false, query: "hidden", total: 0 },
    rendersNothing: true,
  },
  "count-4-digit": {
    props: { ...shared, current: 1234, query: "const", total: 5678 },
  },
  "empty-query": {
    props: { ...shared, current: 0, query: "", total: 0 },
  },
  "markup-as-text": {
    props: {
      ...shared,
      current: 0,
      query: "<img src=x onerror=alert(1)>",
      total: 0,
    },
  },
  "no-matches": {
    props: { ...shared, current: 0, query: "notinthisdiff", total: 0 },
  },
  "one-match": {
    props: {
      ...shared,
      current: 1,
      query: "aggregateReviewVerdicts",
      total: 1,
    },
  },
  overflow: {
    props: {
      ...shared,
      current: 1,
      query: `q${"nobreakhere".repeat(180)}`,
      total: 2,
    },
    provenance: "caught the bar shearing 30px off a 280px pane's left edge",
  },
  typical: {
    props: { ...shared, current: 3, query: "fractions", total: 47 },
  },
  unicode: {
    props: { ...shared, current: 1, query: "محمد الأمين 藤本 🦊", total: 4 },
  },
});
