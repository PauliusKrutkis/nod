/**
 * Submit-flow actions for the review pane: mark-viewed-and-advance (`e`),
 * toggle-viewed (`v`), opening the submit modal, and the post-submit
 * auto-advance that walks to the next review-requested PR (or the inbox when
 * none is left). Optimistic by design — the modal closes before the mutation
 * resolves; failures surface as a flash.
 */
import type React from "react";
import { copyTextToClipboard } from "../lib/clipboard.ts";
import { queryClient, queryKeys } from "../lib/query-client.ts";
import { nextUnviewedFileIndex } from "../lib/review-cursor.ts";
import { useAppStore } from "../store/app-store.ts";
import type {
  ChangedFile,
  InboxData,
  PendingComment,
  PullRequest,
  ReviewEvent,
} from "../types.ts";
import { prKey } from "../types.ts";
import type { useCommentMutations } from "./use-comments.ts";

export function advanceToNextReview(
  owner: string,
  repo: string,
  number: number,
  goInbox: () => void
): void {
  const inbox = queryClient.getQueryData<InboxData>(queryKeys.inbox);
  const list = inbox?.reviewRequested.prs ?? [];
  const isCurrent = (p: PullRequest) =>
    p.owner === owner && p.name === repo && p.number === number;
  const idx = list.findIndex(isCurrent);
  const next =
    (idx >= 0 ? list.slice(idx + 1).find((p) => !isCurrent(p)) : undefined) ??
    list.find((p) => !isCurrent(p));
  if (next) {
    const store = useAppStore.getState();
    store.openReview(next.owner, next.name, next.number);
    store.markSeen(
      prKey({ name: next.name, number: next.number, owner: next.owner }),
      next.updatedAt
    );
  } else {
    goInbox();
  }
}
export function useReviewSubmitActions(args: {
  activeFile: ChangedFile | undefined;
  activeIndexRef: React.RefObject<number>;
  advanceAfterSubmit: () => void;
  clearPendingComments: (key: string) => void;
  files: ChangedFile[];
  keyValue: string;
  number: number;
  owner: string;
  pending: PendingComment[];
  pr: PullRequest | undefined;
  prUrl: string | undefined;
  repo: string;
  scrollToFile: (i: number) => void;
  setFlash: (msg: string) => void;
  setSubmitOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setToast: (t: { message: string; title: string }) => void;
  submitReview: ReturnType<typeof useCommentMutations>["submitReview"];
  toggleViewedWithFp: (f: ChangedFile) => void;
  viewedSet: Set<string>;
}) {
  const toggleViewedFile = () => {
    if (args.activeFile) {
      args.toggleViewedWithFp(args.activeFile);
    }
  };

  const markViewedAndNext = () => {
    if (!args.activeFile) {
      return;
    }
    const wasViewed = args.viewedSet.has(args.activeFile.filename);
    args.toggleViewedWithFp(args.activeFile);
    if (wasViewed) {
      return;
    }
    const target = nextUnviewedFileIndex(
      args.files,
      args.viewedSet,
      args.activeIndexRef.current
    );
    if (target !== null) {
      args.scrollToFile(target);
    }
  };

  const copyLink = () => {
    if (!args.prUrl) {
      return;
    }
    copyTextToClipboard(args.prUrl);
    args.setToast({ message: args.prUrl, title: "Copied PR link" });
  };

  const copyFilePath = () => {
    if (!args.activeFile) {
      return;
    }
    copyTextToClipboard(args.activeFile.filename);
    args.setToast({
      message: args.activeFile.filename,
      title: "Copied file path",
    });
  };

  const openSubmit = () => {
    args.submitReview.reset();
    args.setSubmitOpen(true);
  };

  const handleSubmitReview = (event: ReviewEvent, body: string) => {
    const payload = {
      body,
      comments: args.pending.map((p) => ({
        body: p.body,
        line: p.line,
        path: p.path,
        side: p.side,
        startLine: p.startLine,
      })),
      commitId: args.pr?.headSha ?? "",
      event,
    };
    args.setSubmitOpen(false);
    args.advanceAfterSubmit();
    args.submitReview
      .mutateAsync(payload)
      .then((res) => {
        if (res.queued) {
          args.setToast({
            message:
              "You're offline. The review is staged and sends only when you press send once the connection returns.",
            title: "Review staged",
          });
          return;
        }
        args.clearPendingComments(args.keyValue);
      })
      .catch((e) => {
        args.setFlash(
          `Review for ${args.owner}/${args.repo}#${args.number} didn't submit. Your comments are still pending. ${String(e)}`
        );
      });
  };

  return {
    copyFilePath,
    copyLink,
    handleSubmitReview,
    markViewedAndNext,
    openSubmit,
    toggleViewedFile,
  };
}
