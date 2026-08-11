/**
 * A tooltip is invisible until someone hovers or focuses its trigger, so every
 * fixture renders a real trigger button and the cell shows that button — the
 * tip itself appears on interaction (hover the specimen in the gallery), which
 * is also why the screenshot baselines capture the trigger, not the tip.
 *
 * The hostile cases are all label-shaped, because the label is the only string
 * the component owns: an unbreakable one that no viewport can fit, bidi text
 * that must not reorder the keycap slot, and markup that must stay text. The
 * anchor case covers the flex-layout escape hatch call sites need when the
 * wrapper replaces the child as the row's flex item.
 */
import { createElement } from "react";
import { Button } from "../button/button.tsx";
import { defineEntry } from "../fixtures/fixtures.ts";
import { Tooltip } from "./tooltip.tsx";

const trigger = (label: string) =>
  createElement(Button, { variant: "quiet" }, label);

const LONG_LABEL = `origin/${"feature-branch-".repeat(30)}head`;

export const tooltipEntry = defineEntry(Tooltip, {
  anchored: {
    props: {
      anchorClassName: "q-mono",
      children: trigger("Anchored"),
      label: "The wrapper carries the row's own layout class",
    },
  },
  combo: {
    props: {
      children: trigger("Close"),
      combo: "mod+shift+k",
      label: "Close the find bar",
    },
  },
  "markup-as-text": {
    props: {
      children: trigger("Escaped"),
      label: '<img src=x onerror="alert(1)">',
    },
  },
  overflow: {
    props: { children: trigger("Long label"), label: LONG_LABEL },
    provenance:
      "a label longer than the viewport used to render a 2700px tip that ran off the right edge; the tip is capped and wraps",
  },
  rtl: {
    props: { children: trigger("مراجعة"), label: "محمد الأمين · مراجعة" },
  },
  short: {
    props: { children: trigger("Watch"), label: "Watch" },
  },
});
