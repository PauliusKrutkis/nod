import { addCommentBoxEntry } from "../add-comment-box/add-comment-box.fixtures.ts";
import { aiSetupDialogEntry } from "../ai-setup-dialog/ai-setup-dialog.fixtures.ts";
import { askNoteEntry } from "../ask-note/ask-note.fixtures.ts";
import { avatarEntry } from "../avatar/avatar.fixtures.ts";
import { badgeEntry } from "../badge/badge.fixtures.ts";
import { buttonEntry } from "../button/button.fixtures.ts";
import { ciPillEntry } from "../ci-pill/ci-pill.fixtures.ts";
import { codeCellEntry } from "../code-cell/code-cell.fixtures.ts";
import { commandPaletteEntry } from "../command-palette/command-palette.fixtures.ts";
import { commentItemEntry } from "../comment-item/comment-item.fixtures.ts";
import { commentThreadEntry } from "../comment-thread/comment-thread.fixtures.ts";
import { commentToolsEntry } from "../comment-tools/comment-tools.fixtures.ts";
import { composerEditorEntry } from "../composer-editor/composer-editor.fixtures.ts";
import { findBarEntry } from "../find-bar/find-bar.fixtures.ts";
import type { CatalogEntry } from "../fixtures/fixtures.ts";
import { helpOverlayEntry } from "../help-overlay/help-overlay.fixtures.ts";
import { highlightIndicesEntry } from "../highlight-indices/highlight-indices.fixtures.ts";
import { imageDiffEntry } from "../image-diff/image-diff.fixtures.ts";
import { issueTrackerDialogEntry } from "../issue-tracker-dialog/issue-tracker-dialog.fixtures.ts";
import { kbdEntry } from "../kbd/kbd.fixtures.ts";
import { markdownEntry } from "../markdown/markdown.fixtures.ts";
import { overviewRulerEntry } from "../overview-ruler/overview-ruler.fixtures.ts";
import { prListItemEntry } from "../pr-list-item/pr-list-item.fixtures.ts";
import { prSearchEntry } from "../pr-search/pr-search.fixtures.ts";
import { purchasePromptEntry } from "../purchase-prompt/purchase-prompt.fixtures.ts";
import { releaseHistoryEntry } from "../release-history/release-history.fixtures.ts";
import { reviewScreenPendingEntry } from "../review-screen-pending/review-screen-pending.fixtures.ts";
import { reviewVerdictsEntry } from "../review-verdicts/review-verdicts.fixtures.ts";
import { searchPaneEntry } from "../search-pane/search-pane.fixtures.ts";
import { spinnerEntry } from "../spinner/spinner.fixtures.ts";
import { submitReviewModalEntry } from "../submit-review-modal/submit-review-modal.fixtures.ts";
import { ticketTitleEntry } from "../ticket-title/ticket-title.fixtures.ts";
import { tokenGateEntry } from "../token-gate/token-gate.fixtures.ts";
import { tooltipEntry } from "../tooltip/tooltip.fixtures.ts";
import { updatePromptEntry } from "../update-prompt/update-prompt.fixtures.ts";
import { watchReposDialogEntry } from "../watch-repos-dialog/watch-repos-dialog.fixtures.ts";
import { whatsNewEntry } from "../whats-new/whats-new.fixtures.ts";

// biome-ignore lint/suspicious/noExplicitAny: heterogeneous registry; each entry is fully typed at its definition site
export const catalog: Record<string, CatalogEntry<any>> = {
  "add-comment-box": addCommentBoxEntry,
  "ai-setup-dialog": aiSetupDialogEntry,
  "ask-note": askNoteEntry,
  avatar: avatarEntry,
  badge: badgeEntry,
  button: buttonEntry,
  "ci-pill": ciPillEntry,
  "code-cell": codeCellEntry,
  "command-palette": commandPaletteEntry,
  "comment-item": commentItemEntry,
  "comment-thread": commentThreadEntry,
  "comment-tools": commentToolsEntry,
  "composer-editor": composerEditorEntry,
  "find-bar": findBarEntry,
  "help-overlay": helpOverlayEntry,
  "highlight-indices": highlightIndicesEntry,
  "image-diff": imageDiffEntry,
  "issue-tracker-dialog": issueTrackerDialogEntry,
  kbd: kbdEntry,
  markdown: markdownEntry,
  "overview-ruler": overviewRulerEntry,
  "pr-list-item": prListItemEntry,
  "pr-search": prSearchEntry,
  "purchase-prompt": purchasePromptEntry,
  "release-history": releaseHistoryEntry,
  "review-screen-pending": reviewScreenPendingEntry,
  "review-verdicts": reviewVerdictsEntry,
  "search-pane": searchPaneEntry,
  spinner: spinnerEntry,
  "submit-review-modal": submitReviewModalEntry,
  "ticket-title": ticketTitleEntry,
  "token-gate": tokenGateEntry,
  tooltip: tooltipEntry,
  "update-prompt": updatePromptEntry,
  "watch-repos-dialog": watchReposDialogEntry,
  "whats-new": whatsNewEntry,
};
