/**
 * One free-text field, so every fixture is a string an operator could paste:
 * nothing set, an ordinary Jira browse root, a `{id}` template, a value the
 * validator rejects (the error renders on first paint — no interaction to
 * script), a URL long enough to fight the 480px panel, a non-http scheme, and
 * a unicode host. `markup-as-text` is the security case: the field must show
 * the tag, never mount it.
 */
import { defineEntry } from "../fixtures/fixtures.ts";
import { IssueTrackerDialog } from "./issue-tracker-dialog.tsx";

const noop = () => {
  return;
};

const shared = { onOpenChange: noop, onSave: noop, open: true };

export const issueTrackerDialogEntry = defineEntry(
  IssueTrackerDialog,
  {
    configured: {
      props: { ...shared, value: "https://yourco.atlassian.net/browse/" },
    },
    "id-template": {
      props: { ...shared, value: "https://linear.app/nod/issue/{id}/overview" },
    },
    invalid: { props: { ...shared, value: "yourco.atlassian.net/browse" } },
    "markup-as-text": {
      props: { ...shared, value: '<img src=x onerror="alert(1)">' },
    },
    overflow: {
      props: {
        ...shared,
        value: `https://tracker.example.com/${"very-long-path-segment/".repeat(30)}browse/{id}`,
      },
    },
    unicode: {
      props: { ...shared, value: "https://課題.example.jp/チケット/{id}" },
    },
    unset: { props: { ...shared, value: "" } },
    "unsupported-scheme": {
      props: { ...shared, value: "jira://browse/{id}" },
    },
  },
  { dialog: true }
);
