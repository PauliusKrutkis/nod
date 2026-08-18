/**
 * The mixed fixture is the component's whole argument: rows arrive in host
 * order and must render failures first, then running, then passes — so the
 * fixture hands them over deliberately shuffled. Empty and missing render
 * nothing; both are the contract for hosts that only report a rollup.
 *
 * The overflow fixture carries a matrix job's concatenated parameter list,
 * the one unbounded text a row holds — it must ellipsize instead of wrapping
 * or widening the drawer.
 */
import { defineEntry } from "../fixtures/fixtures.ts";
import { CiChecks } from "./ci-checks.tsx";

const noop = () => {
  return;
};

const URL = "https://github.com/nod/nod/actions/runs/98";

export const ciChecksEntry = defineEntry(CiChecks, {
  "all-green": {
    props: {
      checks: [
        { name: "Lint", state: "success", url: URL },
        { name: "Desktop", state: "success", url: URL },
        { name: "Packages", state: "success", url: URL },
      ],
      onOpen: noop,
    },
  },
  empty: { props: { checks: [], onOpen: noop }, rendersNothing: true },
  missing: { props: { checks: undefined, onOpen: noop }, rendersNothing: true },
  mixed: {
    props: {
      checks: [
        { name: "Lint", state: "success", url: URL },
        { name: "E2E", state: "failure", url: `${URL}/e2e` },
        { name: "Gallery shots", state: "pending", url: URL },
        { name: "Rust", state: "failure", url: `${URL}/rust` },
        { name: "Web", state: "success", url: URL },
      ],
      onOpen: noop,
    },
  },
  overflow: {
    props: {
      checks: [
        {
          name: `e2e (chromium, ubuntu-22.04, shard ${"3/16, node 22.14, ".repeat(24)}retry 2)`,
          state: "failure",
          url: URL,
        },
        { name: "Lint", state: "success", url: URL },
      ],
      onOpen: noop,
    },
  },
  "single-pipeline": {
    props: {
      checks: [
        {
          name: "Pipeline",
          state: "pending",
          url: "https://gitlab.com/nod/nod/-/pipelines/9001",
        },
      ],
      onOpen: noop,
    },
  },
});
