/**
 * jsdom (v29) does not implement <dialog>'s machinery, layout scrolling, or
 * ResizeObserver; SearchPane mounts through useModalDialog (showModal on
 * mount), ReviewToast opens non-modally with show(), both keep content in
 * view with scrollIntoView, and PrDrawer watches its body with a
 * ResizeObserver to decide the footer divider. The shims mirror only the
 * observable contract the components rely on: show/showModal open, close
 * closes and fires "close", scrollIntoView is a no-op because jsdom has no
 * scroll geometry at all, and the observer never fires for the same reason.
 */

if (typeof HTMLDialogElement.prototype.showModal !== "function") {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
}

if (typeof HTMLDialogElement.prototype.show !== "function") {
  HTMLDialogElement.prototype.show = function show() {
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

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserverShim {
    observe(): void {
      return;
    }
    unobserve(): void {
      return;
    }
    disconnect(): void {
      return;
    }
  } as unknown as typeof ResizeObserver;
}
