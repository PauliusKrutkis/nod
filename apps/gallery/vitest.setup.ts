/**
 * jsdom (v29) does not implement <dialog>'s modal machinery or layout
 * scrolling; dialog-shaped catalog entries mount through useModalDialog
 * (showModal on mount) and keep selection in view with scrollIntoView. The
 * shims mirror only the observable contract the components rely on.
 */

if (typeof HTMLDialogElement !== "undefined") {
  if (typeof HTMLDialogElement.prototype.showModal !== "function") {
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.setAttribute("open", "");
    };
  }
  if (typeof HTMLDialogElement.prototype.close !== "function") {
    HTMLDialogElement.prototype.close = function close() {
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    };
  }
}

if (
  typeof Element !== "undefined" &&
  typeof Element.prototype.scrollIntoView !== "function"
) {
  Element.prototype.scrollIntoView = function scrollIntoView() {
    return;
  };
}
