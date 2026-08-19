/**
 * Host wiring for the review screen's right panel: the right-dock shell
 * (tabs, widen/close, the docked-or-overlay seating) around the catalogued
 * PR drawer content in frameless mode. The dock owns the chrome and the
 * focus traffic; the drawer content keeps everything it always did — the
 * merged conversation, the thread index, the draft-never-lost composer.
 * What stays on this side is everything that reaches the app: the store
 * reads for the issue-tracker base and the active login, the Tauri opener
 * behind every link out, the provider-aware "Open on …" label, the app's
 * Markdown pipeline (kramdown stripping, authenticated uploads), and the
 * review screen's mutations. The dock asks for focus back through
 * onFocusExit when it closes, and the diff's scroll host is where this
 * screen seats it. RightPanelHandle is the drawer's own handle re-exported,
 * so the review screen's shift+c hotkey keeps its name for the composer.
 */

import { CiChecks } from "@nod/ui/ci-checks";
import { PrDrawer, type PrDrawerHandle } from "@nod/ui/pr-drawer";
import { RightDock, type RightDockTab } from "@nod/ui/right-dock";
import type { Ref } from "react";
import { openExternal } from "../../lib/open-external.ts";
import { openOnProviderLabel } from "../../lib/provider.ts";
import { useAppStore } from "../../store/app-store.ts";
import type {
  ChangedFile,
  ChatRegion,
  CiStatus,
  IssueComment,
  PullRequest,
  ReviewComment,
  ReviewSummary,
} from "../../types.ts";
import { Markdown } from "../markdown-loader.tsx";
import { ChatTab } from "./chat-tab.tsx";

export type { PrDrawerHandle as RightPanelHandle } from "@nod/ui/pr-drawer";

/** The Checks tab exists only when the PR carries per-check rows, and its
 *  dot repeats the pill's verdict so a red build is visible from any tab. */
function dockTabs(ci: CiStatus | undefined): RightDockTab[] {
  const tabs: RightDockTab[] = [{ id: "info", kbd: "mod+i", label: "Info" }];
  if (ci && ci.state !== "none" && (ci.checks?.length ?? 0) > 0) {
    tabs.push({
      id: "checks",
      indicator: ci.state,
      kbd: "mod+j",
      label: "Checks",
    });
  }
  tabs.push({ id: "chat", kbd: "mod+l", label: "Chat" });
  return tabs;
}

interface RightPanelProps {
  chatFocusSeq: number;
  ci: CiStatus | undefined;
  dockWidth: number | null;
  conversation: IssueComment[];
  fileCount: number;
  files: readonly ChangedFile[];
  inlineComments: ReviewComment[];
  addIssueCommentPending: boolean;
  onAddIssueComment: (body: string) => Promise<void>;
  onClose: () => void;
  onDeleteIssueComment: (a: { commentId: number }) => Promise<void>;
  onEditIssueComment: (a: { commentId: number; body: string }) => Promise<void>;
  onDockResize: (width: number) => void;
  onJumpToThread: (path: string, rootId: number) => void;
  onOpenPr: () => void;
  onRevealRegion: (region: ChatRegion) => void;
  onSelectTab: (id: string) => void;
  open: boolean;
  overlay: boolean;
  pr: PullRequest;
  ref?: Ref<PrDrawerHandle>;
  reviews: ReviewSummary[];
  tab: "chat" | "checks" | "info";
}

/** Focus lands back on the diff's scroll host when the panel closes, so the
 *  Esc ladder keeps working from wherever the reviewer was. */
function focusScrollHost() {
  document
    .querySelector<HTMLElement>(".qf-scrollhost")
    ?.focus({ preventScroll: true });
}

export function RightPanel({
  ref,
  chatFocusSeq,
  ci,
  dockWidth,
  pr,
  fileCount,
  files,
  onDockResize,
  onRevealRegion,
  conversation,
  reviews,
  inlineComments,
  open,
  overlay,
  tab,
  onClose,
  onSelectTab,
  addIssueCommentPending,
  onAddIssueComment,
  onDeleteIssueComment,
  onEditIssueComment,
  onJumpToThread,
  onOpenPr,
}: RightPanelProps) {
  const trackerBase = useAppStore((s) =>
    s.activeAccountId ? s.issueTrackers[s.activeAccountId] : undefined
  );
  const ownLogin = useAppStore(
    (s) => s.accounts.find((a) => a.id === s.activeAccountId)?.login
  );

  const renderMarkdown = (body: string) => (
    <Markdown owner={pr.owner} repo={pr.name}>
      {body}
    </Markdown>
  );

  const tabs = dockTabs(ci);
  const hasChecksTab = tabs.some((dockTab) => dockTab.id === "checks");
  const activeTab = tab === "checks" && !hasChecksTab ? "info" : tab;

  return (
    <RightDock
      activeTab={activeTab}
      onClose={onClose}
      onFocusExit={focusScrollHost}
      onResize={onDockResize}
      onSelectTab={onSelectTab}
      open={open}
      overlay={overlay}
      tabs={tabs}
      width={dockWidth}
    >
      <div className="qf-dock-tabpane" hidden={activeTab !== "info"}>
        <PrDrawer
          addCommentPending={addIssueCommentPending}
          callbacks={{
            onAddComment: onAddIssueComment,
            onClose,
            onDeleteComment: onDeleteIssueComment,
            onEditComment: onEditIssueComment,
            onJumpToThread,
            onOpenCiUrl: openExternal,
            onOpenPr,
            onOpenTicket: openExternal,
            onShowChecks: hasChecksTab
              ? () => onSelectTab("checks")
              : undefined,
          }}
          ci={ci}
          conversation={conversation}
          fileCount={fileCount}
          frameless
          inlineComments={inlineComments}
          open={open}
          openLabel={openOnProviderLabel(pr.url)}
          ownLogin={ownLogin}
          pr={pr}
          ref={ref}
          renderMarkdown={renderMarkdown}
          reviews={reviews}
          trackerBase={trackerBase}
        />
      </div>
      {hasChecksTab && (
        <div className="qf-dock-tabpane" hidden={activeTab !== "checks"}>
          <CiChecks checks={ci?.checks} onOpen={openExternal} />
        </div>
      )}
      <div className="qf-dock-tabpane" hidden={activeTab !== "chat"}>
        <ChatTab
          files={files}
          focusSeq={chatFocusSeq}
          onRevealRegion={onRevealRegion}
          pr={pr}
        />
      </div>
    </RightDock>
  );
}
