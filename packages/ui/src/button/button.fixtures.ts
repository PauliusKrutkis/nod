/**
 * One fixture per variant plus the states that have burned call sites:
 * busy (must disable — a working button firing twice is the bug), an
 * unbreakable overflow label at sidebar width, and the combo cap dialogs
 * put on primary actions.
 */

import { defineEntry } from "../fixtures/fixtures.ts";
import { Button } from "./button.tsx";

const UNBROKEN_LABEL = `Approve-${"and-merge-".repeat(24)}now`;

export const buttonEntry = defineEntry(Button, {
  busy: { props: { busy: true, children: "Submitting…", variant: "primary" } },
  combo: {
    props: {
      children: "Submit review",
      combo: "mod+enter",
      variant: "primary",
    },
  },
  danger: { props: { children: "Remove account", variant: "danger" } },
  disabled: { props: { children: "Submit review", disabled: true } },
  ghost: { props: { children: "Cancel", variant: "ghost" } },
  "markup-as-text": {
    props: { children: '<img src=x onerror="alert(1)">' },
  },
  overflow: { props: { children: UNBROKEN_LABEL, variant: "primary" } },
  primary: { props: { children: "Submit review", variant: "primary" } },
  quiet: { props: { children: "Watch repository" } },
});
