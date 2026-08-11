import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * The gallery is a dev-only app and is never deployed; the fixed port keeps
 * the same no-borrowed-server guarantee as the desktop configs, and it is
 * the address the desktop's gallery:desktop script points the Tauri shell
 * at for WebKitGTK viewing.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 1430,
    strictPort: true,
  },
});
