/**
 * One prop, and it is a string from a forge, so the fixtures are the four
 * statuses that have their own tile, the one that shares the rename tile, and
 * two the app has never been sent: a word GitHub added after this map was
 * written, and the empty string an incomplete payload yields. Both must land
 * on modified rather than an empty square.
 */

import { defineEntry } from "../fixtures/fixtures.ts";
import { FileStatusGlyph } from "./file-status-glyph.tsx";

export const fileStatusGlyphEntry = defineEntry(FileStatusGlyph, {
  added: { props: { status: "added" } },
  copied: { props: { status: "copied" } },
  "empty-status": { props: { status: "" } },
  modified: { props: { status: "modified" } },
  removed: { props: { status: "removed" } },
  renamed: { props: { status: "renamed" } },
  "unknown-status": { props: { status: "changed" } },
});
