/**
 * The coverage ratchet. Every component file under src/components must be
 * exactly one of: catalogued in @nod/ui, a CONTAINER (wiring by design — the
 * exemption carries its reason), or PENDING (real view, not yet catalogued).
 * coverage.test.ts enforces the partition, so a new component fails CI by
 * name until someone classifies it, and a catalogued one must leave PENDING.
 * The gallery rail derives its "not catalogued yet" section from PENDING —
 * the list on screen is the list that gates, never a hand-maintained copy.
 */
const componentModules = import.meta.glob(
  "../../desktop/src/components/**/*.tsx"
);

const names: string[] = [];
for (const path of Object.keys(componentModules)) {
  if (!path.endsWith(".test.tsx")) {
    names.push(path.split("/").pop()?.replace(".tsx", "") ?? "");
  }
}

export const desktopComponentNames = names.sort();

export const CONTAINERS: Record<string, string> = {
  "global-search":
    "store and query wiring only; its view is search-pane, catalogued in @nod/ui",
  "image-diff-loader":
    "blob fetching only; its view is image-diff, catalogued in @nod/ui",
};

export const PENDING = [
  "add-comment-box",
  "ai-setup-dialog",
  "command-palette",
  "comment-item",
  "comment-thread",
  "composer-editor",
  "file-sidebar",
  "help-overlay",
  "inbox",
  "issue-tracker-dialog",
  "markdown",
  "pr-list-item",
  "pr-search",
  "purchase-prompt",
  "release-history",
  "review-diff-pane",
  "review-header",
  "review-list",
  "review-notifier",
  "review-screen",
  "review-screen-pending",
  "right-panel",
  "submit-review-modal",
  "token-gate",
  "update-prompt",
  "watch-repos-dialog",
  "whats-new",
];
