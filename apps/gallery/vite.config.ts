import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { galleryNotes } from "./notes/plugin.ts";

/**
 * The gallery is a dev-only app and is never deployed; the fixed port keeps
 * the same no-borrowed-server guarantee as the desktop configs, and it is
 * the address the desktop's gallery:desktop script points the Tauri shell
 * at for WebKitGTK viewing.
 *
 * galleryNotes is the composer's write path — it edits packages/ui on disk
 * and is serve-only, so it exists for exactly as long as the dev server does.
 */
export default defineConfig({
  plugins: [react(), galleryNotes()],
  server: {
    port: 1430,
    strictPort: true,
  },
});
