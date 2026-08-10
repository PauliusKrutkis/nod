/**
 * The catalog contract: every component this package exports registers here
 * with named fixtures, and one derived test (catalog.test.tsx) walks the lot
 * — there is no per-component registration for tests, the gallery, or the
 * capture harness beyond this file's entries.
 *
 * Fixture naming carries meaning: hostile cases say what they probe
 * ("overflow", "unicode", "markup-as-text"), and payloads harvested from a
 * real breakage are named "bug-<issue>" with `provenance` recording what
 * regressed. `rendersNothing` marks fixtures whose EMPTY render is the
 * contract (e.g. Kbd without a combo), so the derived non-empty assertion
 * inverts instead of being skipped.
 */
import type { ComponentType } from "react";

export interface Fixture<P> {
  props: P;
  rendersNothing?: boolean;
  provenance?: string;
}

export interface CatalogEntry<P> {
  component: ComponentType<P>;
  fixtures: Record<string, Fixture<P>>;
}

export function defineEntry<P>(
  component: ComponentType<P>,
  fixtures: Record<string, Fixture<P>>
): CatalogEntry<P> {
  return { component, fixtures };
}
