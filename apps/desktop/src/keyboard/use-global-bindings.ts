/**
 * Every binding that works wherever you are: the palette and help, the two
 * canned comments, search, zoom, notifications, the settings dialogs and the
 * account switcher. They live here rather than in App because App renders routes and
 * chrome — this is a list of what the keyboard can do, and it is long enough
 * that keeping it inline buried the render.
 *
 * The hook reads the store itself for everything the bindings act on, so the
 * caller only passes what App alone owns: the three dialogs held in its local
 * state. Bindings with `keys: []` are palette-only — reachable by name, with
 * no chord to remember.
 */
import {
  Bell,
  Command as CommandIcon,
  HelpCircle,
  History,
  MessageSquareQuote,
  Search,
  Sparkles,
  Ticket,
  User,
  UserPlus,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useLicenseCommand } from "../hooks/use-license-command.ts";
import { applyZoom, clampZoom, loadZoom, ZOOM_STEP } from "../lib/zoom.ts";
import { useAppStore } from "../store/app-store.ts";
import type { Binding } from "./types.ts";
import { useHotkeys } from "./use-hotkeys.ts";

export function useGlobalBindings(dialogs: {
  openCanned: () => void;
  openHistory: () => void;
  openTracker: () => void;
  toggleNotifications: () => void;
}): void {
  const setRoute = useAppStore((s) => s.setRoute);
  const accounts = useAppStore((s) => s.accounts);
  const activeAccountId = useAppStore((s) => s.activeAccountId);
  const switchAccount = useAppStore((s) => s.switchAccount);
  const licenseCommand = useLicenseCommand();
  const { openCanned, openHistory, openTracker, toggleNotifications } = dialogs;

  const accountBindings: Binding[] = [
    ...accounts.slice(0, 9).map(
      (a, i): Binding => ({
        description:
          a.id === activeAccountId
            ? `Account: ${a.login} · ${a.provider} (current)`
            : `Switch to ${a.login} · ${a.provider}`,
        global: true,
        group: "Accounts",
        icon: User,
        keys: `mod+${i + 1}`,
        run: () => switchAccount(a.id),
      })
    ),
    {
      description: "Add account (GitHub / GitLab)",
      global: true,
      group: "Accounts",
      icon: UserPlus,
      keys: "mod+shift+a",
      run: () => setRoute({ name: "token" }),
    },
  ];

  useHotkeys(
    "global",
    [
      {
        description: "Open command palette",
        global: true,
        group: "General",
        icon: CommandIcon,
        keys: "mod+k",
        run: () => useAppStore.getState().togglePalette(),
      },
      {
        description: "Show keyboard shortcuts",
        global: true,
        group: "General",
        icon: HelpCircle,
        keys: "?",
        run: () => useAppStore.getState().toggleHelp(),
      },
      {
        description: "Canned comments…",
        global: true,
        group: "Comments",
        icon: MessageSquareQuote,
        keys: "mod+;",
        run: openCanned,
      },
      {
        description: "Search pull requests",
        global: true,
        group: "General",
        icon: Search,
        keys: "/",
        run: () => useAppStore.setState({ searchOpen: true }),
      },
      {
        description: "Zoom in",
        global: true,
        group: "View",
        icon: ZoomIn,
        keys: ["mod+=", "mod++"],
        run: () => {
          applyZoom(clampZoom(loadZoom() + ZOOM_STEP));
        },
      },
      {
        description: "Zoom out",
        global: true,
        group: "View",
        icon: ZoomOut,
        keys: "mod+-",
        run: () => {
          applyZoom(clampZoom(loadZoom() - ZOOM_STEP));
        },
      },
      {
        description: "Reset zoom",
        global: true,
        group: "View",
        icon: Search,
        keys: "mod+0",
        run: () => {
          applyZoom(1);
        },
      },
      {
        description: "Issue tracker links (Jira)…",
        global: true,
        group: "General",
        icon: Ticket,
        keys: [],
        run: openTracker,
      },
      {
        description: "Ask about code · AI settings…",
        global: true,
        group: "General",
        icon: Sparkles,
        keys: [],
        run: () => useAppStore.getState().openAiSetup(),
      },
      licenseCommand,
      {
        description: "Release history · what's new",
        global: true,
        group: "General",
        icon: History,
        keys: [],
        run: openHistory,
      },
      {
        description: "Notifications · what you were told about",
        global: true,
        group: "General",
        icon: Bell,
        keys: "mod+shift+n",
        run: toggleNotifications,
      },
      ...accountBindings,
    ],
    { activate: false }
  );
}
