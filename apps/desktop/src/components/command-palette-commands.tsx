import { CommandPalette, type PaletteCommand } from "@nod/ui/command-palette";
import { useKeyboard } from "../keyboard/keyboard-provider.tsx";
import type { KeyboardContextValue } from "../keyboard/types.ts";
import { useHotkeys } from "../keyboard/use-hotkeys.ts";
import { useAppStore } from "../store/app-store.ts";

/**
 * Store, registry and hotkey wiring for the ⌘K palette; the view is
 * command-palette, catalogued in @nod/ui. Flattening the live bindings here is
 * what keeps the palette honest — it offers whatever the current scope has
 * registered, so the legend, the cheatsheet and the palette can never drift —
 * while leaving the view renderable from a fixture alone. Bindings marked
 * hidden are dialog plumbing keys and stay out of the list; a binding with
 * several keys shows the first, which is the one the UI advertises. Running a
 * command synthesizes the keydown its handler expects; closing the palette
 * afterwards belongs to the view.
 */

function firstKey(keys: string | string[]): string | undefined {
  return Array.isArray(keys) ? keys[0] : keys;
}

function buildCommands(
  baseScope: string,
  getBindings: KeyboardContextValue["getBindings"]
): PaletteCommand[] {
  const out: PaletteCommand[] = [];
  for (const b of getBindings(baseScope)) {
    if (b.hidden) {
      continue;
    }
    out.push({
      group: b.group,
      icon: b.icon,
      keyCombo: firstKey(b.keys),
      label: b.description,
      run: () => b.run(new KeyboardEvent("keydown")),
    });
  }
  return out;
}

export function CommandPaletteCommands({ baseScope }: { baseScope: string }) {
  const paletteOpen = useAppStore((s) => s.paletteOpen);
  const closePalette = useAppStore((s) => s.closePalette);
  const { getBindings } = useKeyboard();

  useHotkeys(
    "palette",
    [
      {
        description: "Close palette",
        hidden: true,
        keys: "esc",
        run: () => closePalette(),
      },
    ],
    { enabled: paletteOpen }
  );

  const setOpen = (v: boolean) => {
    if (!v) {
      closePalette();
    }
  };

  return (
    <CommandPalette
      commands={paletteOpen ? buildCommands(baseScope, getBindings) : []}
      onOpenChange={setOpen}
      open={paletteOpen}
    />
  );
}
