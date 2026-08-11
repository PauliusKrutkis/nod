/**
 * jsdom (v29) no longer ships localStorage; the store layer persists through
 * it at module load, so install a Map-backed stand-in before anything imports.
 * It also lacks <dialog>'s modal machinery and scroll geometry, which the
 * gallery's dialog-shaped catalog entries hit — the shims mirror only the
 * observable contract: showModal opens, close closes and fires "close",
 * scrollIntoView is a no-op.
 */

if (typeof globalThis.localStorage?.clear !== "function") {
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
