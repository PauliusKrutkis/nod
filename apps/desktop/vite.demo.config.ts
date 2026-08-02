import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * Builds the real frontend + mocked bridge (demo/) as a static bundle into
 * the marketing site's public/demo/, where the landing page embeds it as
 * the driveable hero. Separate from vite.config.ts because the two builds
 * differ in every top-level knob (root, base, outDir) and the dev-server
 * settings there are Tauri-specific. The output directory is gitignored;
 * the site's build script regenerates it on every build.
 */

export default defineConfig({
  base: "/demo/",
  build: {
    emptyOutDir: true,
    outDir: "../../web/public/demo",
  },
  plugins: [
    react({
      babel: {
        plugins: [["babel-plugin-react-compiler", {}]],
      },
    }),
    tailwindcss(),
  ],
  resolve: {
    dedupe: ["react", "react-dom", "zustand"],
  },
  root: "demo",
});
