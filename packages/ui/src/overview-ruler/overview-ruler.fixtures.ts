/**
 * Every fixture here is a distribution the ruler has to survive: nothing at
 * all, a single hit, hits piled at both ends (where a tick can escape the
 * track), and 500 hits, which is past the sampling threshold — the crowd case
 * exists to prove the current tick survives sampling and the column still
 * reads as a distribution rather than a solid bar.
 *
 * Negative fractions are not imaginary: the host reports -1 for a match whose
 * row has not been measured yet, so a mixed list and an entirely unmeasured
 * one are both real payloads, and the second must render nothing rather than
 * stack every tick at the top.
 */
import { defineEntry } from "../fixtures/fixtures.ts";
import { OverviewRuler } from "./overview-ruler.tsx";

const crowd = Array.from({ length: 500 }, (_, i) => i / 500);

export const overviewRulerEntry = defineEntry(OverviewRuler, {
  "all-unmeasured": {
    props: { currentIndex: 0, fractions: [-1, -1, -1], kind: "find" },
    rendersNothing: true,
  },
  "crowd-500": {
    props: { currentIndex: 377, fractions: crowd, kind: "find" },
  },
  "current-out-of-range": {
    props: { currentIndex: 99, fractions: [0.2, 0.4, 0.6], kind: "find" },
  },
  edges: {
    props: {
      currentIndex: 3,
      fractions: [0, 0.004, 0.008, 0.992, 0.996, 1],
      kind: "find",
    },
    provenance: "caught a fraction of 1 painting 2px below the track",
  },
  empty: {
    props: { currentIndex: null, fractions: [], kind: "find" },
    rendersNothing: true,
  },
  occurrence: {
    props: {
      currentIndex: null,
      fractions: [0.12, 0.31, 0.44, 0.78],
      kind: "occurrence",
    },
  },
  single: {
    props: { currentIndex: 0, fractions: [0.5], kind: "find" },
  },
  typical: {
    props: {
      currentIndex: 2,
      fractions: [0.05, 0.18, 0.27, 0.35, 0.51, 0.66, 0.74, 0.88, 0.95],
      kind: "find",
    },
  },
  unmeasured: {
    props: { currentIndex: 1, fractions: [0.25, -1, 0.75], kind: "find" },
  },
});
