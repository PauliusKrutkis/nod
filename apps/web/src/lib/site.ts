/**
 * Strings the site can't afford to have two versions of. The repo slug was
 * previously written out in five places (both pages, the footer, and the
 * releases API URL), which a repo rename would have had to find all of; the
 * Homebrew tap name is deliberately separate because it is lowercased and not
 * derived from the slug. INSTALL_NOTES_URL carries a README heading anchor, so
 * it breaks on an edit neither page would show.
 *
 * BREW_INSTALL_COMMANDS carries the quarantine step because a Homebrew install
 * on its own produces an app macOS refuses to open — releases aren't notarized
 * yet and Homebrew 6 removed `--no-quarantine`. Anything that prints only the
 * `brew install` half is handing out a broken install, so there is one
 * definition and it is the complete one. The array shape is what CopyCommand
 * renders as separate prompt lines and copies newline-joined; drop the second
 * entry when notarization lands and it becomes a one-liner again.
 */
export const REPO_SLUG = "PauliusKrutkis/nod";

export const REPO_URL = `https://github.com/${REPO_SLUG}`;

export const BREW_INSTALL_COMMANDS = [
  "brew install pauliuskrutkis/tap/nod",
  "xattr -dr com.apple.quarantine /Applications/Nod.app",
];

export const INSTALL_NOTES_URL = `${REPO_URL}#install--auto-updates`;

export const CONTACT_EMAIL = "hello@nodreview.com";

/**
 * Narrows the Cloudflare Web Analytics beacon token to a value worth
 * rendering. Two shapes have to collapse to "no beacon": absent, which is
 * every local and preview build, and present-but-blank, which is what a
 * declared-then-emptied Cloudflare var looks like. Emitting the blank one
 * would load a third-party script on every page that reports to nothing —
 * the worst of both halves of the promise /about makes about measurement.
 */
export function analyticsBeaconToken(raw: unknown): string | null {
  if (typeof raw !== "string") {
    return null;
  }
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}
