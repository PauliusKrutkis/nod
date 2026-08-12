/**
 * Every face of the card, and every way each of them can be mid-flight:
 * offered, installing, offered-but-unlicensed, waiting on the browser and
 * failed. The two packaged fixtures are the .deb/.rpm build, which has no
 * install button at all — and its lapsed pair, where the license CTA has to
 * stay primary while the copy still admits the swap is manual. There is
 * deliberately no "downloading, 43%" fixture — the install is a single
 * backend command that ends in a relaunch and reports no progress, so a
 * progress bar here would be a picture of something the app does not know.
 *
 * Versions are the unbounded strings: they come from a release feed, land in
 * the header chip, the lede and the notes at once, and a pre-release tag can
 * be arbitrarily long. Fixed literals throughout — no clock, no Date.now.
 */
import { defineEntry } from "../fixtures/fixtures.ts";
import { UpdatePrompt } from "./update-prompt.tsx";

const noop = () => {
  return;
};

const base = {
  currentVersion: "1.3.2",
  eligible: true,
  error: null,
  installing: false,
  notes: null,
  onBuyLicense: noop,
  onDismiss: noop,
  onInstall: noop,
  onOpenDownloads: noop,
  price: "$59",
  purchasing: false,
  selfInstallable: true,
  version: "1.4.0",
};

export const updatePromptEntry = defineEntry(UpdatePrompt, {
  error: {
    props: {
      ...base,
      error:
        "Update failed: signature verification did not match the release key.",
    },
  },
  ineligible: { props: { ...base, eligible: false } },
  "ineligible-purchasing": {
    props: { ...base, eligible: false, purchasing: true },
  },
  installing: { props: { ...base, installing: true } },
  overflow: {
    props: {
      ...base,
      notes: `Rebuilt-the-diff-engine-${"and-then-some".repeat(60)}`,
      version: `1.4.0-rc.${"1".repeat(200)}`,
    },
    provenance:
      "caught the version chip pushing straight through the card's right edge — it had no ellipsis floor",
  },
  packaged: { props: { ...base, selfInstallable: false } },
  "packaged-ineligible": {
    props: { ...base, eligible: false, selfInstallable: false },
  },
  "ready-to-restart": { props: base },
  "with-notes": {
    props: {
      ...base,
      notes: "Faster diffs, a calmer inbox, and Astro syntax highlighting.",
    },
  },
});
