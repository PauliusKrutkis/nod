/**
 * jsdom (v29) does not implement <dialog>'s modal machinery or layout
 * scrolling; SearchPane mounts through useModalDialog (showModal on mount)
 * and keeps its selection in view with scrollIntoView. The shims mirror only
 * the observable contract the components rely on: showModal opens, close
 * closes and fires "close", scrollIntoView is a no-op because jsdom has no
 * scroll geometry at all.
 */

if (typeof HTMLDialogElement.prototype.showModal !== "function") {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
}

if (typeof Element.prototype.scrollIntoView !== "function") {
  Element.prototype.scrollIntoView = function scrollIntoView() {
    return;
  };
}

if (typeof HTMLDialogElement.prototype.close !== "function") {
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
}
