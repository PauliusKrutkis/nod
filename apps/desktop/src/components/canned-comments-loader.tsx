/**
 * The host half of the canned-comments dialog: it owns the storage the list
 * lives in, so the dialog can stay a pure render of whatever it is handed.
 * Mounted only while open, which is also what resets its draft and armed row
 * between visits.
 */
import { CannedCommentsDialog } from "@nod/ui/canned-comments-dialog";
import { useCannedComments } from "../hooks/use-canned-comments.ts";
import { setCannedComments } from "../lib/canned-comments.ts";

export function CannedCommentsLoader({
  open,
  onClose,
}: {
  onClose: () => void;
  open: boolean;
}) {
  const comments = useCannedComments();

  if (!open) {
    return null;
  }

  const add = (text: string) => {
    setCannedComments([...comments, text]);
  };

  const remove = (index: number) => {
    setCannedComments(comments.filter((_, i) => i !== index));
  };

  const onOpenChange = (next: boolean) => {
    if (!next) {
      onClose();
    }
  };

  return (
    <CannedCommentsDialog
      comments={comments}
      onAdd={add}
      onOpenChange={onOpenChange}
      onRemove={remove}
      open
    />
  );
}
