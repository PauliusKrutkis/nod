import { QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./app.tsx";
import { KeyboardProvider } from "./keyboard/keyboard-provider.tsx";
import { api } from "./lib/api.ts";
import { queryClient } from "./lib/query-client.ts";
import { normalizeViewedMap } from "./lib/viewed-fingerprint.ts";
import { useAppStore } from "./store/app-store.ts";

import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";
import "@fontsource-variable/geist-mono";

import "./index.css";

/**
 * Hydrate persisted viewed-file state into the store once, at startup, before
 * React mounts. The Rust side persists opaque JSON, so older installs may hold
 * the legacy `prKey -> string[]` shape — normalizeViewedMap migrates either.
 *
 * #/gallery mounts the component gallery instead of the app, dev builds
 * only: the import.meta.env.DEV guard is statically false in production, so
 * the dynamic import (and the whole gallery chunk) is tree-shaken out of
 * release bundles. The gallery is store-free, so hydration is skipped too.
 * mod+shift+g toggles between the app and the gallery (a reload, because
 * they are different roots by design), which is also how the Tauri dev
 * window reaches it — see the gallery:desktop script.
 */
const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
);

if (import.meta.env.DEV) {
  window.addEventListener("keydown", (event) => {
    if (
      (event.metaKey || event.ctrlKey) &&
      event.shiftKey &&
      event.key.toLowerCase() === "g"
    ) {
      const inGallery = window.location.hash.startsWith("#/gallery");
      window.location.hash = inGallery ? "" : "#/gallery";
      window.location.reload();
    }
  });
}

if (import.meta.env.DEV && window.location.hash.startsWith("#/gallery")) {
  import("./gallery/gallery.tsx").then(({ Gallery }) => {
    root.render(
      <React.StrictMode>
        <Gallery />
      </React.StrictMode>
    );
  });
} else {
  api
    .getViewedMap()
    .then((map) => useAppStore.getState().setViewed(normalizeViewedMap(map)))
    .catch(() => undefined);

  root.render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <KeyboardProvider>
          <App />
        </KeyboardProvider>
      </QueryClientProvider>
    </React.StrictMode>
  );
}
