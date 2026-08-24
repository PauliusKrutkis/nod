/**
 * One sentence with an inline button, so the cases are about the container
 * rather than the content: the sidebar width is where "Read more" is most
 * likely to orphan onto its own line, and RTL is where an inline button
 * inside a sentence usually goes wrong.
 */
import { defineEntry } from "../fixtures/fixtures.ts";
import { OrgAccessHint } from "./org-access-hint.tsx";

const noop = () => {
  return;
};

export const orgAccessHintEntry = defineEntry(OrgAccessHint, {
  typical: { props: { onOrgAccessHelp: noop } },
  /** Named for the narrow capture: the sentence wraps hardest in the
   *  280px sidebar, where the trailing button can orphan. */
  overflow: { props: { onOrgAccessHelp: noop } },
});
