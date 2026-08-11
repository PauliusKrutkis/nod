/**
 * Every state the pill has a rendering for, plus the two ways it renders
 * nothing (the "none" state and no status at all) — those are the contract,
 * so they are fixtures with rendersNothing rather than cases left untested.
 *
 * The counts are the hostile axis: a matrix-expanded pipeline reports failures
 * in the thousands, and the resulting count string is the only unbounded text
 * the pill carries. That is the fixture that must ellipsize inside the pill
 * instead of pushing the header row wide.
 */
import { defineEntry } from "../fixtures/fixtures.ts";
import { CiPill } from "./ci-pill.tsx";

const noop = () => {
  return;
};

const URL = "https://github.com/nod/nod/pull/272/checks";

export const ciPillEntry = defineEntry(CiPill, {
  failure: {
    props: {
      ci: { failed: 1, state: "failure", total: 4, url: URL },
      onOpen: noop,
    },
  },
  "failure-overflow": {
    props: {
      ci: { failed: 1287, state: "failure", total: 4096, url: URL },
      onOpen: noop,
    },
  },
  missing: { props: { ci: undefined, onOpen: noop }, rendersNothing: true },
  none: {
    props: {
      ci: { failed: 0, state: "none", total: 0, url: "" },
      onOpen: noop,
    },
    rendersNothing: true,
  },
  pending: {
    props: {
      ci: { failed: 0, state: "pending", total: 9, url: URL },
      onOpen: noop,
    },
  },
  "single-check": {
    props: {
      ci: { failed: 0, state: "success", total: 1, url: URL },
      onOpen: noop,
    },
  },
  success: {
    props: {
      ci: { failed: 0, state: "success", total: 14, url: URL },
      onOpen: noop,
    },
  },
});
