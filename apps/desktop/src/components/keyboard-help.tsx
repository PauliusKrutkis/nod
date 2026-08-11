import {
  HelpOverlay as HelpOverlayView,
  type HelpSection,
} from "@nod/ui/help-overlay";
import { useKeyboard } from "../keyboard/keyboard-provider.tsx";
import type { KeyboardContextValue } from "../keyboard/types.ts";
import { useHotkeys } from "../keyboard/use-hotkeys.ts";
import { useAppStore } from "../store/app-store.ts";

/**
 * Store, registry and hotkey wiring for the shortcut sheet; the view is
 * help-overlay, catalogued in @nod/ui. Flattening the live bindings here is
 * what keeps the sheet honest — it renders whatever the registry currently
 * holds, so the legend, the palette and this sheet can never drift — while
 * leaving the view renderable from a fixture alone. Bindings marked hidden
 * are the dialog's own plumbing keys and stay off the sheet; a binding with
 * several keys shows the first, which is the one the UI advertises.
 */

function firstKey(keys: string | string[]): string | undefined {
  return Array.isArray(keys) ? keys[0] : keys;
}

const NOTE: Record<string, string> = {
  global: "Always available",
  inbox: "On the home list",
  review: "When reading a diff",
};

function buildSections(
  baseScope: string,
  getBindings: KeyboardContextValue["getBindings"]
): HelpSection[] {
  const byScope = new Map<string, { combo: string; description: string }[]>();
  for (const b of getBindings(baseScope)) {
    if (b.hidden) {
      continue;
    }
    const list = byScope.get(b.scope) ?? [];
    const combo = firstKey(b.keys);
    if (!combo) {
      continue;
    }
    list.push({ combo, description: b.description });
    byScope.set(b.scope, list);
  }
  const out: HelpSection[] = [];
  const global = byScope.get("global");
  if (global) {
    out.push({
      active: false,
      bindings: global,
      note: NOTE.global,
      scope: "global",
    });
  }
  for (const [scope, bindings] of byScope) {
    if (scope === "global") {
      continue;
    }
    out.push({
      active: scope === baseScope,
      bindings,
      note: NOTE[scope] ?? "",
      scope,
    });
  }
  return out;
}

export function KeyboardHelp({ baseScope }: { baseScope: string }) {
  const helpOpen = useAppStore((s) => s.helpOpen);
  const setHelpOpen = useAppStore((s) => s.setHelpOpen);
  const { getBindings } = useKeyboard();

  useHotkeys(
    "help",
    [
      {
        description: "Close",
        hidden: true,
        keys: "esc",
        run: () => setHelpOpen(false),
      },
    ],
    { enabled: helpOpen }
  );

  const sections = helpOpen ? buildSections(baseScope, getBindings) : [];

  return (
    <HelpOverlayView
      onOpenChange={setHelpOpen}
      open={helpOpen}
      sections={sections}
    />
  );
}
