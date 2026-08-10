import { avatarEntry } from "./avatar.fixtures.ts";
import { badgeEntry } from "./badge.fixtures.ts";
import type { CatalogEntry } from "./fixtures.ts";
import { kbdEntry } from "./kbd.fixtures.ts";
import { spinnerEntry } from "./spinner.fixtures.ts";

// biome-ignore lint/suspicious/noExplicitAny: heterogeneous registry; each entry is fully typed at its definition site
export const catalog: Record<string, CatalogEntry<any>> = {
  avatar: avatarEntry,
  badge: badgeEntry,
  kbd: kbdEntry,
  spinner: spinnerEntry,
};
