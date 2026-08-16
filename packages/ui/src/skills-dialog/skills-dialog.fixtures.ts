/**
 * The dialog's space is the list it shows: nothing yet, a repo's own set, a
 * mix of both sources with a name clash the repo wins, and the crowd a
 * plugin-heavy checkout produces. Hostile corners are the strings — an
 * unbreakable name, a description longer than the panel, CJK and RTL — and
 * the invalid new-skill name, which renders its error on first paint because
 * the field is seeded, not typed.
 */

import { defineEntry } from "../fixtures/fixtures.ts";
import { SkillsDialog, type SkillsDialogProps } from "./skills-dialog.tsx";

const noop = () => undefined;

const base = (over: Partial<SkillsDialogProps>): SkillsDialogProps => ({
  inline: true,
  onCreate: noop,
  onOpenChange: noop,
  onOpenFolder: noop,
  open: true,
  skills: [
    {
      description: "Review against this repo's conventions",
      name: "pr-validity",
      source: "repo",
    },
    {
      description: "My generic pass: error paths, naming, dead code",
      name: "quick-pass",
      source: "personal",
    },
  ],
  ...over,
});

export const skillsDialogEntry = defineEntry(
  SkillsDialog,
  {
    crowd: {
      props: base({
        skills: Array.from({ length: 14 }, (_, i) => ({
          description: `What skill number ${i + 1} reviews for`,
          name: `skill-${i + 1}`,
          source: i % 3 === 0 ? ("repo" as const) : ("personal" as const),
        })),
      }),
    },
    empty: {
      props: base({ skills: [] }),
    },
    overflow: {
      props: base({
        skills: [
          {
            description: `Reviews ${"everything-in-one-unbreakable-word".repeat(4)}`,
            name: `skill-${"long".repeat(20)}`,
            source: "personal",
          },
        ],
      }),
    },
    "repo-only": {
      props: base({
        skills: [
          {
            description: "Review against this repo's conventions",
            name: "pr-validity",
            source: "repo",
          },
        ],
      }),
    },
    typical: {
      props: base({}),
    },
    unicode: {
      props: base({
        skills: [
          {
            description: "空配列とRTLの境界値を確認する",
            name: "検索-確認",
            source: "personal",
          },
          {
            description: "مراجعة الأمان",
            name: "أمان",
            source: "repo",
          },
        ],
      }),
    },
  },
  { dialog: true }
);
