/**
 * Kbd's contract includes rendering NOTHING for a missing combo — that case
 * is a fixture, not a skip, so the derived test asserts the emptiness. The
 * rest walk the descriptor grammar: named caps, single letters, multi-cap
 * chords, and words the cap map has never heard of.
 */
import { defineEntry } from "./fixtures.ts";
import { Kbd } from "./kbd.tsx";

export const kbdEntry = defineEntry(Kbd, {
  chord: { props: { combo: "mod+shift+backspace" } },
  combo: { props: { combo: "mod+k" } },
  "empty-string": { props: { combo: "" }, rendersNothing: true },
  missing: { props: {}, rendersNothing: true },
  named: { props: { combo: "esc" } },
  single: { props: { combo: "k" } },
  "unknown-word": { props: { combo: "hyper" } },
});
