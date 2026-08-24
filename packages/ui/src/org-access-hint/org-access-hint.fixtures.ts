/**
 * One sentence and one inline button, with nothing configurable: there is a
 * single cell because a second would render identically. Width is a harness
 * dimension applied to every fixture equally, so an "overflow" case here
 * would have been a duplicate baseline rather than a stress — the wrap that
 * orphans "Read more" is visible in the narrow capture of this one.
 */
import { defineEntry } from "../fixtures/fixtures.ts";
import { OrgAccessHint } from "./org-access-hint.tsx";

const noop = () => {
  return;
};

export const orgAccessHintEntry = defineEntry(OrgAccessHint, {
  typical: { props: { onOrgAccessHelp: noop } },
});
