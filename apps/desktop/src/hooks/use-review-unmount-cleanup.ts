/**
 * Unmount cleanup for the review screen's timer and rAF handles. One effect
 * owns all six refs deliberately — several hooks write them, and clearing
 * them piecemeal from their owners would race the screen teardown (see the
 * hazards note in BACKLOG § Tech debt). Mount-only by design: the deps are
 * all refs, so the cleanup runs exactly once, on unmount.
 */
import type React from "react";
import { useEffect } from "react";

export function useReviewUnmountCleanup(refs: {
  copyTimerRef: React.RefObject<ReturnType<typeof setTimeout> | null>;
  cursorRafRef: React.RefObject<number | null>;
  fileRafRef: React.RefObject<number | null>;
  flashTimerRef: React.RefObject<ReturnType<typeof setTimeout> | null>;
  saveStateTimerRef: React.RefObject<ReturnType<typeof setTimeout> | null>;
  threadFlashRef: React.RefObject<ReturnType<typeof setTimeout> | null>;
}): void {
  const {
    copyTimerRef,
    cursorRafRef,
    fileRafRef,
    flashTimerRef,
    saveStateTimerRef,
    threadFlashRef,
  } = refs;
  useEffect(
    () => () => {
      const flashTimer = flashTimerRef.current;
      const threadFlash = threadFlashRef.current;
      const copyTimer = copyTimerRef.current;
      const saveStateTimer = saveStateTimerRef.current;
      const fileRaf = fileRafRef.current;
      const cursorRaf = cursorRafRef.current;
      if (flashTimer) {
        clearTimeout(flashTimer);
      }
      if (threadFlash) {
        clearTimeout(threadFlash);
      }
      if (copyTimer) {
        clearTimeout(copyTimer);
      }
      if (saveStateTimer) {
        clearTimeout(saveStateTimer);
      }
      if (fileRaf !== null) {
        cancelAnimationFrame(fileRaf);
      }
      if (cursorRaf !== null) {
        cancelAnimationFrame(cursorRaf);
      }
    },
    [
      copyTimerRef,
      cursorRafRef,
      fileRafRef,
      flashTimerRef,
      saveStateTimerRef,
      threadFlashRef,
    ]
  );
}
