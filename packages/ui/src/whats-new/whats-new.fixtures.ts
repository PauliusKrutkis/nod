/**
 * Release notes are the least controlled text in the app: they are whatever
 * someone typed into a GitHub release body, in any script, at any length,
 * including markup. So the fixtures cover the empty feed (the card still has
 * to say something), one note, a skipped-versions changelog long enough to
 * scroll, a version string no release process would ever produce, unicode,
 * and a body that looks like markup and must arrive as text.
 *
 * Versions and tags are fixed literals rather than anything derived from the
 * clock — a capture that moves on its own is not a baseline.
 *
 * `renderNotes` stands in for the app's markdown pipeline. Here it is a bare
 * paragraph per note: the pipeline has its own home and its own tests, and
 * what this card owes the reader is the column those nodes land in.
 */
import { createElement } from "react";
import { defineEntry } from "../fixtures/fixtures.ts";
import { WhatsNew } from "./whats-new.tsx";

const noop = () => {
  return;
};

const renderNotes = (notes: string) => createElement("p", null, notes);

const base = {
  onDismiss: noop,
  onShowHistory: noop,
  releases: [],
  renderNotes,
  version: "1.4.0",
};

const LONG_CHANGELOG = [
  "## Highlights",
  "",
  "- Diff rendering is roughly 40% faster on the largest pull requests we could find, because the highlighter no longer re-tokenizes lines that scrolled out of view and back.",
  "- The inbox keeps its scroll position across a refetch.",
  "- `mod+k` opens the palette from every screen, including the review pane.",
  "",
  "### Fixes",
  "",
  "1. Comment drafts survive switching files mid-sentence.",
  "2. Occurrence highlighting no longer misses matches inside collapsed hunks.",
  "3. https://github.com/nod/nod/releases/tag/v1.4.0-full-changelog-with-an-unhelpfully-long-anchor",
].join("\n");

export const whatsNewEntry = defineEntry(WhatsNew, {
  "markup-as-text": {
    props: {
      ...base,
      releases: [
        { notes: '<img src="x" onerror="alert(1)"> shipped', tag: "v1.4.0" },
      ],
    },
  },
  "no-notes": { props: base },
  "one-note": {
    props: {
      ...base,
      releases: [{ notes: "Sharper diffs and a calmer inbox.", tag: "v1.4.0" }],
    },
  },
  overflow: {
    props: {
      ...base,
      releases: [
        { notes: LONG_CHANGELOG, tag: "v1.4.0" },
        { notes: "Faster startup.", tag: "v1.3.0" },
        { notes: null, tag: "v1.2.0" },
      ],
    },
  },
  "overflow-version": {
    props: {
      ...base,
      version: `1.4.0-nightly.${"0".repeat(180)}1+build.metadata.that.never.ends`,
    },
  },
  unicode: {
    props: {
      ...base,
      releases: [
        {
          notes: "レビューが速くなりました 🎉 — الآن مع دعم أفضل للغة العربية.",
          tag: "v1.4.0-リリース",
        },
      ],
    },
  },
});
