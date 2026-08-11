import { useEffect, useRef } from "react";
import { useLatest } from "./use-latest.ts";

function isBackdropPointer(
  dialog: HTMLDialogElement,
  event: { clientX: number; clientY: number }
): boolean {
  const rect = dialog.getBoundingClientRect();
  return (
    event.clientX < rect.left ||
    event.clientX > rect.right ||
    event.clientY < rect.top ||
    event.clientY > rect.bottom
  );
}

/**
 * The element to place initial focus on when the dialog opens: an explicitly
 * requested target (e.g. a search input) when the dialog has one, otherwise the
 * panel itself. Focusing the panel — never an arbitrary first control — is what
 * keeps the app's armed-ring dialogs (release history, watch repos)
 * consistent: on open nothing looks focused, and Tab arms the close/actions
 * rather than the caret already resting on a button.
 */
function initialFocusTarget(
  dialog: HTMLDialogElement,
  requested: HTMLElement | null
): HTMLElement {
  return requested ?? dialog;
}

/**
 * Open a native `<dialog>` modally on mount and close it when the backdrop is
 * clicked. Backdrop clicks are drag-safe: the pointer must go down *and* up
 * outside the panel's border box, so a text selection that drags out of the
 * panel never dismisses it. There is no explicit close on unmount:
 * React removes the element from the DOM, which the browser treats as closing
 * it (and releases the top layer). Calling `dialog.close()` ourselves would be
 * worse than useless — its `close` event is dispatched on a queued task, so
 * under StrictMode's mount→unmount→remount it fires *after* the remount and
 * bounces back into `onClose`, closing the owner the instant it opens.
 *
 * `showModal()` traps Tab within the dialog subtree for us. On top of that this
 * hook gives every dialog the same focus lifecycle: focus moves inside on open
 * (to `initialFocusRef` when supplied, else the panel itself) and is restored
 * to the previously focused element on close, so no dialog leaves the caret
 * stranded on the page behind it.
 *
 * `options.modal: false` opens with `show()` instead — no top layer, no tab
 * trap, no backdrop — for hosts that embed the dialog in normal flow (the
 * gallery's inline specimens); everything else behaves identically.
 */
export function useModalDialog(
  onClose: () => void,
  initialFocusRef?: React.RefObject<HTMLElement | null>,
  options?: { modal?: boolean }
) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const onCloseRef = useLatest(onClose);
  const initialFocusRefLatest = useLatest(initialFocusRef);
  const modal = options?.modal !== false;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    if (!dialog.open) {
      if (modal) {
        dialog.showModal();
      } else {
        dialog.show();
      }
    }
    requestAnimationFrame(() => {
      if (!dialog.isConnected) {
        return;
      }
      initialFocusTarget(
        dialog,
        initialFocusRefLatest.current?.current ?? null
      ).focus();
    });

    let downOnBackdrop = false;
    const onPointerDown = (e: PointerEvent) => {
      downOnBackdrop = isBackdropPointer(dialog, e);
    };
    const onClick = (e: MouseEvent) => {
      if (downOnBackdrop && isBackdropPointer(dialog, e)) {
        onCloseRef.current();
      }
      downOnBackdrop = false;
    };
    dialog.addEventListener("pointerdown", onPointerDown);
    dialog.addEventListener("click", onClick);
    return () => {
      dialog.removeEventListener("pointerdown", onPointerDown);
      dialog.removeEventListener("click", onClick);
      previouslyFocused?.focus();
    };
  }, [onCloseRef, initialFocusRefLatest, modal]);

  const onDialogClose = () => {
    onClose();
  };

  const onDialogCancel = (e: React.SyntheticEvent<HTMLDialogElement>) => {
    e.preventDefault();
    onClose();
  };

  return { dialogRef, onDialogCancel, onDialogClose };
}
