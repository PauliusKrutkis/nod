import { avatarEntry } from "./avatar.fixtures.ts";
import { badgeEntry } from "./badge.fixtures.ts";
import { buttonEntry } from "./button.fixtures.ts";
import type { CatalogEntry } from "./fixtures.ts";
import { highlightIndicesEntry } from "./highlight.fixtures.ts";
import { kbdEntry } from "./kbd.fixtures.ts";
import { searchPaneEntry } from "./search-pane.fixtures.ts";
import { spinnerEntry } from "./spinner.fixtures.ts";

// biome-ignore lint/suspicious/noExplicitAny: heterogeneous registry; each entry is fully typed at its definition site
export const catalog: Record<string, CatalogEntry<any>> = {
  avatar: avatarEntry,
  badge: badgeEntry,
  button: buttonEntry,
  "highlight-indices": highlightIndicesEntry,
  kbd: kbdEntry,
  "search-pane": searchPaneEntry,
  spinner: spinnerEntry,
};
