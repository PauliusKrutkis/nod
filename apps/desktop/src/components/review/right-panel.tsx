/**
 * Host wiring for the catalogued PR drawer view (@nod/ui/pr-drawer), which
 * owns the whole overlay: the scrim, the head, the merged conversation, the
 * thread index and the docked composer, plus the behavior that used to live
 * here (the draft-never-lost footer, the scroll-divider observation, the
 * armed one-shot reveal of a just-posted comment). What stays on this side
 * is everything that reaches the app: the store reads for the issue-tracker
 * base and the active login, the Tauri opener behind every link out, the
 * provider-aware "Open on …" label, the app's Markdown pipeline (kramdown
 * stripping, authenticated uploads), and the review screen's mutations. The
 * drawer asks for focus back through onFocusExit when it closes, and the
 * diff's scroll host is where this screen seats it. RightPanelHandle is the
 * drawer's own handle re-exported, so the review screen's shift+c hotkey
 * keeps its name for the composer.
 */

import { PrDrawer, type PrDrawerHandle } from "@nod/ui/pr-drawer";
import type { Ref } from "react";
import { openExternal } from "../../lib/open-external.ts";
import { openOnProviderLabel } from "../../lib/provider.ts";
import { useAppStore } from "../../store/app-store.ts";
import type {
  CiStatus,
  IssueComment,
  PullRequest,
  ReviewComment,
  ReviewSummary,
} from "../../types.ts";
import { Markdown } from "../markdown-loader.tsx";

export type { PrDrawerHandle as RightPanelHandle } from "@nod/ui/pr-drawer";

interface RightPanelProps {
  ci: CiStatus | undefined;
  conversation: IssueComment[];
  fileCount: number;
  inlineComments: ReviewComment[];
  addIssueCommentPending: boolean;
  onAddIssueComment: (body: string) => Promise<void>;
  onClose: () => void;
  onDeleteIssueComment: (a: { commentId: number }) => Promise<void>;
  onEditIssueComment: (a: { commentId: number; body: string }) => Promise<void>;
  onJumpToThread: (path: string, rootId: number) => void;
  onOpenPr: () => void;
  onToggleWide: () => void;
  open: boolean;
  pr: PullRequest;
  ref?: Ref<PrDrawerHandle>;
  reviews: ReviewSummary[];
  wide: boolean;
}

export function RightPanel({
  ref,
  ci,
  pr,
  fileCount,
  conversation,
  reviews,
  inlineComments,
  open,
  wide,
  onClose,
  onToggleWide,
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

  const focusScrollHost = () => {
    document
      .querySelector<HTMLElement>(".qf-scrollhost")
      ?.focus({ preventScroll: true });
  };

  return (
    <PrDrawer
      addCommentPending={addIssueCommentPending}
      callbacks={{
        onAddComment: onAddIssueComment,
        onClose,
        onDeleteComment: onDeleteIssueComment,
        onEditComment: onEditIssueComment,
        onFocusExit: focusScrollHost,
        onJumpToThread,
        onOpenCiUrl: openExternal,
        onOpenPr,
        onOpenTicket: openExternal,
        onToggleWide,
      }}
      ci={ci}
      conversation={conversation}
      fileCount={fileCount}
      inlineComments={inlineComments}
      open={open}
      openLabel={openOnProviderLabel(pr.url)}
      ownLogin={ownLogin}
      pr={pr}
      ref={ref}
      renderMarkdown={renderMarkdown}
      reviews={reviews}
      trackerBase={trackerBase}
      wide={wide}
    />
  );
}
