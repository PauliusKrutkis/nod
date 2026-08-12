/**
 * The palette is only ever as good as the bindings it is handed, and those are
 * data: labels come from feature code, groups and combos from a registry that
 * grows. So the hostile cases are shape-of-data cases — nothing registered, a
 * single action, the whole real set, an unbreakable label beside a group tag
 * long enough to shove the key cap off the panel, ten times the production
 * count, and CJK/RTL/emoji labels. `initialQuery` covers the states that are
 * otherwise a keystroke away: a query that matches many (highlight spans) and
 * one that matches nothing.
 *
 * The registry has no disabled bindings — a command the current scope cannot
 * run is simply not registered — so there is deliberately no disabled fixture
 * to write; `no-hints` covers the optional-everything row instead.
 */
import {
  Archive,
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  CornerDownLeft,
  Eye,
  History,
  Link,
  MessageSquarePlus,
  Search,
  Sparkles,
  Ticket,
  Undo2,
  User,
} from "lucide-react";
import { defineEntry } from "../fixtures/fixtures.ts";
import { CommandPalette, type PaletteCommand } from "./command-palette.tsx";

const noop = () => {
  return;
};

const shared = { onOpenChange: noop, open: true };

const command = (
  label: string,
  keyCombo?: string,
  group?: string,
  icon?: PaletteCommand["icon"]
): PaletteCommand => ({ group, icon, keyCombo, label, run: noop });

const fullSet: PaletteCommand[] = [
  command("Next PR", "j", "Navigation", ArrowDown),
  command("Previous PR", "k", "Navigation", ArrowUp),
  command("Open PR", "enter", "Navigation", CornerDownLeft),
  command("Archive until it updates", "e", "Navigation", Archive),
  command("Undo archive", "u", "Navigation", Undo2),
  command("Copy PR link", "y", "Navigation", Link),
  command("Next / previous tab", "tab", "Tabs", ArrowLeftRight),
  command("Watch repositories…", "mod+shift+w", "Tabs", Eye),
  command(
    "Comment on the pull request",
    "shift+c",
    "Comments",
    MessageSquarePlus
  ),
  command("Search pull requests", "/", "General", Search),
  command("Issue tracker links (Jira)…", "mod+shift+j", "General", Ticket),
  command("Ask about code · AI settings…", "mod+shift+i", "General", Sparkles),
  command("Release history · what's new", "mod+shift+h", "General", History),
  command("Switch account", "mod+shift+a", "Accounts", User),
];

const crowd: PaletteCommand[] = Array.from({ length: 140 }, (_, i) =>
  command(
    `Jump to changed file ${i + 1}`,
    i < 9 ? `mod+${i + 1}` : undefined,
    "Files"
  )
);

export const commandPaletteEntry = defineEntry(
  CommandPalette,
  {
    "crowd-140": { props: { ...shared, commands: crowd } },
    empty: { props: { ...shared, commands: [] } },
    full: { props: { ...shared, commands: fullSet } },
    "markup-as-text": {
      props: {
        ...shared,
        commands: [
          command(
            "<img src=x onerror=alert(1)> stays text",
            "x",
            "<script>alert(1)</script>"
          ),
          command("Plain neighbour", "p", "Safe"),
        ],
      },
    },
    "matches-many": {
      props: { ...shared, commands: fullSet, initialQuery: "co" },
    },
    "no-hints": {
      props: {
        ...shared,
        commands: [
          command("Sign out"),
          command("Reset every preference"),
          command("Rebuild the local cache"),
        ],
      },
    },
    "no-matches": {
      props: { ...shared, commands: fullSet, initialQuery: "zzqq" },
    },
    overflow: {
      props: {
        ...shared,
        commands: [
          command(
            `Archive-${"and-then-notify-".repeat(120)}every-reviewer`,
            "mod+shift+alt+ctrl+backspace",
            "Navigation-that-never-ends-and-keeps-going",
            Archive
          ),
          command(
            "Toggle the diff between unified and split, remembering the choice per repository so a project that reviews wide files is never asked twice",
            "d",
            "View"
          ),
        ],
      },
    },
    "overflow-query": {
      props: {
        ...shared,
        commands: fullSet,
        initialQuery: "q".repeat(400),
      },
    },
    single: {
      props: {
        ...shared,
        commands: [command("Archive", "e", "Inbox", Archive)],
      },
    },
    unicode: {
      props: {
        ...shared,
        commands: [
          command("次のプルリクエスト", "j", "ナビゲーション", ArrowDown),
          command("藤本 さくらに割り当てる", "a", "レビュー"),
          command("الانتقال إلى الملف السابق", "p", "الملفات", ArrowUp),
          command("🗄️ Archive 👨‍👩‍👧‍👦", "e", "Inbox", Archive),
        ],
      },
    },
  },
  { dialog: true }
);
