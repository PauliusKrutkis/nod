/**
 * Opening a URL on the host, as a void call. The catalogued components take
 * an onOpen-style callback instead of importing Tauri themselves — that is
 * what keeps @nod/ui renderable from a fixture — and none of them can await,
 * so a rejected open (no opener handler, an unsupported scheme) is swallowed
 * here rather than surfacing as an unhandled rejection.
 */
import { openPath, openUrl } from "@tauri-apps/plugin-opener";

export function openExternal(url: string): void {
  openUrl(url).catch(() => undefined);
}

/** Reveal a folder in the host's file manager, same swallow-and-move-on
 *  contract as openExternal. */
export function revealFolder(path: string): void {
  openPath(path).catch(() => undefined);
}
