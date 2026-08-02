/**
 * Playwright entry to the mocked Tauri bridge. The bridge itself lives in
 * bridge-install.ts so the browser demo bundle can install the identical
 * mock; here it is serialized into an init script so it runs before the app
 * module loads on every navigation.
 */

import type { AppOptions } from "./bridge-install.ts";
import { buildBridgeConfig, installBridge } from "./bridge-install.ts";
import type { Page } from "./types.ts";

export type { AppOptions } from "./bridge-install.ts";

export async function setupApp(page: Page, opts: AppOptions = {}) {
  await page.addInitScript(installBridge, buildBridgeConfig(opts));
  await page.goto("/");
}
