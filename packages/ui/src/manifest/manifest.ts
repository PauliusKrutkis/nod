/**
 * The catalog's shape as pure data — no component imports, so consumers that
 * cannot process CSS-importing modules (the Playwright screenshot spec) can
 * still enumerate every cell. Hand-maintained on purpose and held to the
 * real catalog by a parity block in catalog.test.tsx: add a fixture without
 * updating this and the suite fails naming the entry.
 */
export interface ManifestEntry {
  fixtures: string[];
  dialog?: boolean;
}

export const catalogManifest: Record<string, ManifestEntry> = {
  avatar: {
    fixtures: [
      "cjk-name",
      "emoji-name",
      "empty-name",
      "image",
      "initials",
      "large",
      "rtl-name",
      "silent",
      "single-name",
      "whitespace-name",
    ],
  },
  badge: {
    fixtures: [
      "accent",
      "danger",
      "default",
      "markup-as-text",
      "muted",
      "overflow",
      "success",
      "warning",
    ],
  },
  button: {
    fixtures: [
      "busy",
      "combo",
      "danger",
      "disabled",
      "ghost",
      "markup-as-text",
      "overflow",
      "primary",
      "quiet",
    ],
  },
  "ci-pill": {
    fixtures: [
      "failure",
      "failure-overflow",
      "missing",
      "none",
      "pending",
      "single-check",
      "success",
    ],
  },
  "highlight-indices": {
    fixtures: ["cjk", "empty-text", "every", "none", "out-of-range", "typical"],
  },
  kbd: {
    fixtures: [
      "chord",
      "combo",
      "empty-string",
      "missing",
      "named",
      "single",
      "unknown-word",
    ],
  },
  "search-pane": {
    dialog: true,
    fixtures: [
      "badges",
      "crowd-200",
      "empty",
      "overflow",
      "typical",
      "unicode",
    ],
  },
  spinner: {
    fixtures: ["bare", "labelled", "overflow"],
  },
  "ticket-title": {
    fixtures: [
      "id-template",
      "markup-as-text",
      "multiple-tickets",
      "near-miss",
      "no-ticket",
      "no-tracker",
      "one-ticket",
      "overflow",
      "trailing-slash",
      "unicode",
    ],
  },
  tooltip: {
    fixtures: [
      "anchored",
      "combo",
      "markup-as-text",
      "overflow",
      "rtl",
      "short",
    ],
  },
};
