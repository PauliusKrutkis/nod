/**
 * The dock is chrome, so the fixtures walk the chrome's space: one tab
 * (renders the static title, which is the old drawer head), two tabs with
 * either one active, the wide seat, and the hostile corners — an unbreakable
 * tab label that must not widen the head, and CJK/RTL labels. Content is a
 * plain scrollable stand-in; the real surfaces (pr-drawer, chat-panel) carry
 * their own catalog entries. Every fixture is `embedded` and `open` for the
 * same reason the pr-drawer's are: the dock is the app's panel, and only
 * normal flow gives a frameless host something to measure.
 */

import { createElement } from "react";
import { defineEntry } from "../fixtures/fixtures.ts";
import { RightDock, type RightDockProps } from "./right-dock.tsx";

const noop = () => undefined;

const content = (label: string) =>
  createElement(
    "div",
    { style: { minHeight: 120, padding: 18 } },
    createElement("p", { style: { margin: 0 } }, label)
  );

const base = (over: Partial<RightDockProps>): RightDockProps => ({
  activeTab: "info",
  children: content("Panel content stands in here."),
  embedded: true,
  onClose: noop,
  onFocusExit: noop,
  onSelectTab: noop,
  open: true,
  overlay: false,
  tabs: [{ id: "info", label: "Pull request" }],
  ...over,
});

const TWO_TABS = [
  { id: "info", kbd: "mod+i", label: "Info" },
  { id: "chat", kbd: "mod+l", label: "Chat" },
];

export const rightDockEntry = defineEntry(RightDock, {
  "chat-active": {
    props: base({
      activeTab: "chat",
      children: content("The chat surface renders here."),
      tabs: TWO_TABS,
    }),
  },
  overflow: {
    props: base({
      tabs: [
        { id: "info", label: "Info" },
        { id: "chat", label: `chat${"verylong".repeat(12)}` },
      ],
    }),
  },
  "single-tab": {
    props: base({}),
  },
  "two-tabs": {
    props: base({ tabs: TWO_TABS }),
  },
  unicode: {
    props: base({
      tabs: [
        { id: "info", label: "プルリクエスト" },
        { id: "chat", label: "محادثة" },
      ],
    }),
  },
});
