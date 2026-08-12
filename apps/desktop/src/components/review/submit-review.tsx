import { SubmitReviewModal } from "@nod/ui/submit-review-modal";
import { useHotkeys } from "../../keyboard/use-hotkeys.ts";
import type { ReviewEvent } from "../../types.ts";

/**
 * Hotkey wiring for the submit-review modal; the view is submit-review-modal,
 * catalogued in @nod/ui. Registering the scope while the modal is open is what
 * suspends the review screen's own bindings underneath it, so a key pressed in
 * the summary field can never also archive the PR.
 */
export function SubmitReview({
  open,
  busy,
  error,
  ownPr,
  pendingCount,
  onClose,
  onSubmit,
}: {
  open: boolean;
  busy: boolean;
  error?: string | null;
  ownPr: boolean;
  pendingCount: number;
  onClose: () => void;
  onSubmit: (event: ReviewEvent, body: string) => void;
}) {
  useHotkeys(
    "submit",
    [{ description: "Close", hidden: true, keys: "esc", run: () => onClose() }],
    { enabled: open }
  );

  const onOpenChange = (next: boolean) => {
    if (!next) {
      onClose();
    }
  };

  return (
    <SubmitReviewModal
      busy={busy}
      error={error}
      onOpenChange={onOpenChange}
      onSubmit={onSubmit}
      open={open}
      ownPr={ownPr}
      pendingCount={pendingCount}
    />
  );
}
