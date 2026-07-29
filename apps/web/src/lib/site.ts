/**
 * Strings that appear on more than one page. The repo slug was previously
 * written out in five places (both pages, the footer, and the releases API
 * URL), which a repo rename would have had to find all of; the Homebrew tap
 * name is deliberately separate because it is lowercased and not derived from
 * the slug.
 */
export const REPO_SLUG = "PauliusKrutkis/pr-flow";

export const REPO_URL = `https://github.com/${REPO_SLUG}`;

export const BREW_COMMAND = "brew install pauliuskrutkis/tap/nod";
