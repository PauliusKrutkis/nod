/**
 * One fixture per tone keeps the tone→pill-class map honest, and the two
 * hostile cases cover the real payloads a badge carries: an unbounded label
 * string, and content that looks like markup and must stay text. `dot` gets
 * its own cell because the leading dot is what state pills (open, draft,
 * merged) wear and nothing else does.
 */

import { defineEntry } from "../fixtures/fixtures.ts";
import { Badge } from "./badge.tsx";

const UNBROKEN_LABEL = "changed-".repeat(40);

export const badgeEntry = defineEntry(Badge, {
  accent: { props: { children: "Commented", tone: "accent" } },
  danger: { props: { children: "Changes requested", tone: "danger" } },
  default: { props: { children: "Draft" } },
  dot: { props: { children: "Open", dot: true, tone: "success" } },
  "dot-overflow": { props: { children: UNBROKEN_LABEL, dot: true } },
  "markup-as-text": {
    props: { children: '<img src=x onerror="alert(1)">' },
  },
  muted: { props: { children: "Archived", tone: "muted" } },
  overflow: { props: { children: UNBROKEN_LABEL } },
  success: { props: { children: "Open", tone: "success" } },
  warning: { props: { children: "Draft", tone: "warning" } },
});
