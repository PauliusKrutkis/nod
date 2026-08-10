/**
 * The overflow case is the one that matters: the spinner's label sits inside
 * panes as narrow as the 280px sidebar, and an unbreakable token is how real
 * branch names arrive.
 */
import { defineEntry } from "./fixtures.ts";
import { Spinner } from "./spinner.tsx";

const UNBROKEN_LABEL = `refs/heads/${"very-long-segment-".repeat(30)}`;

export const spinnerEntry = defineEntry(Spinner, {
  bare: { props: {} },
  labelled: { props: { label: "Loading review…" } },
  overflow: { props: { label: UNBROKEN_LABEL } },
});
