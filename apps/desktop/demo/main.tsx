/**
 * Browser demo entry: installs the same mocked Tauri bridge the e2e suite
 * uses, then loads the real app. The bridge must be in place before the app
 * module evaluates — @tauri-apps/api reads window.__TAURI_INTERNALS__ at
 * call time from module scope — hence the dynamic import. Built by
 * vite.demo.config.ts into the marketing site's public/demo/, where the
 * landing page embeds it as the driveable hero.
 */

import { buildBridgeConfig, installBridge } from "../e2e/bridge-install.ts";
import { DEMO_DETAILS, DEMO_FILE_BLOBS, DEMO_INBOX } from "./fixtures.ts";

installBridge(
  buildBridgeConfig({
    detailByNumber: DEMO_DETAILS,
    fileBlobs: DEMO_FILE_BLOBS,
    inbox: DEMO_INBOX,
  })
);

await import("../src/main.tsx");
