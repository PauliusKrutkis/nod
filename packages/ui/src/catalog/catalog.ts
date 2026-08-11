import { avatarEntry } from "../avatar/avatar.fixtures.ts";
import { badgeEntry } from "../badge/badge.fixtures.ts";
import { buttonEntry } from "../button/button.fixtures.ts";
import { ciPillEntry } from "../ci-pill/ci-pill.fixtures.ts";
import type { CatalogEntry } from "../fixtures/fixtures.ts";
import { highlightIndicesEntry } from "../highlight-indices/highlight-indices.fixtures.ts";
import { kbdEntry } from "../kbd/kbd.fixtures.ts";
import { searchPaneEntry } from "../search-pane/search-pane.fixtures.ts";
import { spinnerEntry } from "../spinner/spinner.fixtures.ts";
import { ticketTitleEntry } from "../ticket-title/ticket-title.fixtures.ts";
import { tooltipEntry } from "../tooltip/tooltip.fixtures.ts";

// biome-ignore lint/suspicious/noExplicitAny: heterogeneous registry; each entry is fully typed at its definition site
export const catalog: Record<string, CatalogEntry<any>> = {
  avatar: avatarEntry,
  badge: badgeEntry,
  button: buttonEntry,
  "ci-pill": ciPillEntry,
  "highlight-indices": highlightIndicesEntry,
  kbd: kbdEntry,
  "search-pane": searchPaneEntry,
  spinner: spinnerEntry,
  "ticket-title": ticketTitleEntry,
  tooltip: tooltipEntry,
};
