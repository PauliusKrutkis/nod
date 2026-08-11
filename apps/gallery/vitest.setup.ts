/**
 * jsdom (v29) does not implement <dialog>'s modal machinery or layout
 * scrolling; dialog-shaped catalog entries mount through useModalDialog
 * (showModal on mount) and keep selection in view with scrollIntoView. The
 * shims mirror only the observable contract the components rely on; the
 * localStorage stand-in exists because jsdom v29 no longer ships one and
 * the gallery persists its zoom factor through it.
 */

if (typeof globalThis.localStorage?.getItem !== "function") {
  const store = new Map<string, string>();
  const ls: Storage = {
    clear: () => store.clear(),
    getItem: (k: string) => store.get(k) ?? null,
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    setItem: (k: string, v: string) => {
      store.set(k, String(v));
    },
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: ls,
    writable: true,
  });
  if (typeof window !== "undefined") {
    Object.defineProperty(window, "localStorage", {
      value: ls,
      writable: true,
    });
  }
}

if (typeof HTMLDialogElement !== "undefined") {
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
