/**
 * The sheet is only ever as good as the binding text it is handed, and that
 * text is data: descriptions come from feature code, combos from a registry
 * that grows chords. So the hostile cases here are all shape-of-data cases —
 * nothing registered, a single scope, the whole real set, a description with
 * no spaces to break on, a chord long enough to swallow the keys column, and
 * CJK/RTL/emoji labels. `full` mirrors the app's live bindings so the sheet
 * has a specimen at its production density. `filtered` and `no-matches` seed
 * the search through `initialQuery`, since those states are otherwise only
 * reachable by typing.
 */
import { defineEntry } from "../fixtures/fixtures.ts";
import { HelpOverlay } from "./help-overlay.tsx";

const noop = () => {
  return;
};

const shared = { onOpenChange: noop, open: true };

const globalBindings = [
  { combo: "mod+k", description: "Command palette" },
  { combo: "/", description: "Search all pull requests" },
  { combo: "?", description: "Keyboard shortcuts" },
  { combo: "mod+,", description: "Settings" },
  { combo: "mod+shift+a", description: "Switch account" },
];

const inboxBindings = [
  { combo: "j", description: "Next pull request" },
  { combo: "k", description: "Previous pull request" },
  { combo: "enter", description: "Open the review" },
  { combo: "e", description: "Archive" },
  { combo: "r", description: "Refresh the inbox" },
  { combo: "tab", description: "Next tab" },
];

const reviewBindings = [
  { combo: "n", description: "Next changed file" },
  { combo: "p", description: "Previous changed file" },
  { combo: "v", description: "Mark file viewed" },
  { combo: "c", description: "Comment on the selected line" },
  { combo: "mod+enter", description: "Submit the review" },
  { combo: "esc", description: "Back to the inbox" },
];

const fullSections = [
  {
    bindings: globalBindings,
    note: "Always available",
    scope: "global",
  },
  { bindings: inboxBindings, note: "On the home list", scope: "inbox" },
  {
    active: true,
    bindings: reviewBindings,
    note: "When reading a diff",
    scope: "review",
  },
];

export const helpOverlayEntry = defineEntry(
  HelpOverlay,
  {
    empty: { props: { ...shared, sections: [] } },
    filtered: {
      props: { ...shared, initialQuery: "pull", sections: fullSections },
    },
    full: {
      props: {
        ...shared,
        sections: fullSections,
      },
    },
    "long-chord": {
      props: {
        ...shared,
        sections: [
          {
            active: true,
            bindings: [
              {
                combo: "mod+shift+alt+ctrl+backspace",
                description: "Discard every pending comment",
              },
              { combo: "g+g+g+g+g+g+g+g+g+g", description: "Top of the diff" },
              { combo: "enter", description: "Activate" },
            ],
            note: "Chords that outgrow the keys column",
            scope: "review",
          },
        ],
      },
    },
    "markup-as-text": {
      props: {
        ...shared,
        sections: [
          {
            bindings: [
              {
                combo: "x",
                description: "<img src=x onerror=alert(1)> stays text",
              },
            ],
            scope: "<script>alert(1)</script>",
          },
        ],
      },
    },
    "no-matches": {
      props: { ...shared, initialQuery: "zzzz", sections: fullSections },
    },
    "one-section": {
      props: {
        ...shared,
        sections: [
          {
            active: true,
            bindings: [{ combo: "esc", description: "Close" }],
            scope: "help",
          },
        ],
      },
    },
    overflow: {
      props: {
        ...shared,
        sections: [
          {
            active: true,
            bindings: [
              {
                combo: "mod+enter",
                description: `Submit-the-review-${"and-then-".repeat(40)}notify-every-reviewer`,
              },
              {
                combo: "d",
                description:
                  "Toggle the diff between unified and split, remembering the choice per repository so a project that reviews wide files never has to be told twice",
              },
            ],
            note: `note-${"x".repeat(120)}`,
            scope: `scope-${"y".repeat(80)}`,
          },
        ],
      },
    },
    unicode: {
      props: {
        ...shared,
        sections: [
          {
            bindings: [
              { combo: "j", description: "次のプルリクエスト" },
              { combo: "藤", description: "藤本 さくらに割り当てる" },
              { combo: "k", description: "الانتقال إلى الملف السابق" },
              { combo: "e", description: "🗄️ Archive 👨‍👩‍👧‍👦" },
            ],
            note: "スコープ",
            scope: "レビュー",
          },
        ],
      },
    },
  },
  { dialog: true }
);
