/**
 * Clipboard writes are fire-and-forget everywhere in this app: the surfaces
 * that copy (file path, PR link, branch name, comment body) all show their own
 * "Copied" feedback, so a rejected promise — the user denied permission, or
 * the API is missing — must not surface as an unhandled rejection.
 */
export function copyTextToClipboard(text: string): void {
  navigator.clipboard?.writeText(text).catch(() => undefined);
}
