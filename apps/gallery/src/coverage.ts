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
  "markdown-loader":
    "the Tauri link opener, GitLab source rewriting and the authenticated upload query; its view is markdown, catalogued in @nod/ui",
  "purchase-prompt-loader":
    "license query, activation command and once-per-launch dismissal; its card is purchase-prompt in @nod/ui",
  "review-screen-pending-loader":
    "reads the PR out of the inbox query cache; its shell is review-screen-pending in @nod/ui",
  "update-prompt-loader":
    "update feed, install command and the yield-to-purchase gate; its card is update-prompt in @nod/ui",
  "whats-new-loader":
    "version gate, releases query and markdown pipeline; its card is whats-new in @nod/ui",
  "issue-tracker-settings":
    "reads and writes the per-account tracker URL in the store; its view is issue-tracker-dialog, catalogued in @nod/ui",
  "notification-center-loader":
    "reads the event log and notification channels from the stores and requests the OS permission on change; its view is notification-center, catalogued in @nod/ui",
  "keyboard-help":
    "flattens the live keyboard registry into sections; its view is help-overlay, catalogued in @nod/ui",
  "license-dialog-loader":
    "license-state query, the activation command and the browser-wait latch; its view is license-dialog, catalogued in @nod/ui",
  "release-history-loader":
    "releases and app-version queries, the armed ring, and Markdown notes; its view is release-history, catalogued in @nod/ui",
  "command-palette-commands":
    "flattens the live keyboard registry into commands and owns the palette's open flag; its view is command-palette, catalogued in @nod/ui",
  "token-gate-flow":
    "OAuth round trips, the instance probe and the keychain write (useTokenGate); its screen is token-gate, catalogued in @nod/ui",
  "ai-setup-loader":
    "AI config query, the save/pick/remove commands and which face is showing; its view is ai-setup-dialog, catalogued in @nod/ui",
  "watch-repos-loader":
    "watched-list query, the coalesced write and the debounced provider search; its view is watch-repos-dialog, catalogued in @nod/ui",
  "canned-comments-loader":
    "the localStorage list and its add/remove writes; its view is canned-comments-dialog, catalogued in @nod/ui",
  "diff-search":
    "parses the PR's patches into search rows and lends the app's highlighter; its view is pr-search, catalogued in @nod/ui",
  "submit-review":
    "registers the hotkey scope that suspends the review bindings while the modal is open; its view is submit-review-modal, catalogued in @nod/ui",
  "file-sidebar-loader":
    "viewed files from the store, thread/draft counts, and the remembered tree-vs-flat mode; its view is file-sidebar, catalogued in @nod/ui",
  "review-header-loader":
    "issue tracker, verdict rosters and the conversation count; its view is review-header, catalogued in @nod/ui",
  inbox:
    "inbox and subscribed queries, the archive ledger, tab visibility and the digit hotkeys; its views are inbox-tabs, inbox-zero, inbox-detail and pr-list-item in @nod/ui, leaving it the listbox that arranges them and the query's loading and error states",
  ledger:
    "the ledger status query, the repo-path map in localStorage and the pick/path/queue/session state machine; its views are inbox-zero, spinner and kbd in @nod/ui, leaving it the listbox and clone-path form (dogfood-grade by design, docs/LEDGER.md)",
  "ledger-session":
    "the session query, the cursor slice and sign mutation over the reused review surface; its view is review-diff-pane with capabilities off — no markup of its own beyond the header and footer bands",
  "review-notifier":
    "diffs each inbox poll against a localStorage ledger of announced PRs and owns the 12s expiry and the enter/esc scope; its card is review-toast, catalogued in @nod/ui",
  "review-screen":
    "the review route's whole state surface — detail query, comment mutations, cursor, selection, find, occurrences and every keyboard scope; the only markup it owns is the three-column frame and the sidebar scrim around file-sidebar, review-header, review-diff-pane, right-panel, submit-review-modal and pr-search",
  "review-list":
    "virtuoso group geometry, the imperative scroll handle and the store reads its comment blocks need; its leaves are diff-row, hunk-row and file-section-header in @nod/ui",
  "review-diff-pane":
    "wires the review screen's state onto find-bar, the review-list container and overview-ruler; it owns no view of its own beyond the empty state",
  "right-panel":
    "detail-query payloads, the comment mutations, store reads for trackerBase and ownLogin, the app's Markdown pipeline, the Tauri opener and jump-to-thread routing; its views are right-dock, pr-drawer and the chat-tab container, the first two catalogued in @nod/ui",
  "chat-tab":
    "the chat runtime hook (store slice, ai_chat mutation, streaming listeners) and the app's Markdown pipeline; its view is chat-panel, catalogued in @nod/ui",
};

export const PENDING: string[] = ["org-access-hint", "offline-bar-loader"];
