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
 *
 * `dialog` marks entries that mount a modal <dialog>: they render in the top
 * layer rather than inside any frame, so the gallery manages their open state
 * and the screenshot suite captures the viewport instead of the frame.
 *
 * A sequence fixture renders a RUN of specimens as stacked siblings in one
 * cell, for components whose bugs live between rows rather than inside one
 * (a diff is add/del pairs, context runs, a hunk band mid-file — never a
 * lone row). The run container in the app is the desktop's review-list — a
 * store-fed virtuoso surface no fixture can express — and its `.qf-diff`
 * wrapper is app CSS, so steps stack bare: each row declares its own type
 * (see diff-row.css), which is what makes bare stacking honest. Each step
 * names its component through `defineStep`, so one mechanism also covers
 * heterogeneous runs (a hunk band between diff rows) without special-casing
 * any entry. Every consumer renders a sequence through `sequenceElement`,
 * keeping the jsdom walk and the gallery pixel-identical in structure.
 */
import {
  type ComponentType,
  createElement,
  Fragment,
  type ReactElement,
} from "react";

export interface PropsFixture<P> {
  props: P;
  rendersNothing?: boolean;
  provenance?: string;
}

export interface SequenceStep<Q> {
  component: ComponentType<Q>;
  props: Q;
}

export interface SequenceFixture {
  // biome-ignore lint/suspicious/noExplicitAny: heterogeneous run; each step is fully typed by defineStep at its definition site
  sequence: readonly SequenceStep<any>[];
  provenance?: string;
}

export type Fixture<P> = PropsFixture<P> | SequenceFixture;

export interface CatalogEntry<P> {
  component: ComponentType<P>;
  fixtures: Record<string, Fixture<P>>;
  dialog?: boolean;
}

export function defineEntry<P>(
  component: ComponentType<P>,
  fixtures: Record<string, Fixture<P>>,
  options: { dialog?: boolean } = {}
): CatalogEntry<P> {
  return { component, fixtures, ...options };
}

export function defineStep<Q>(
  component: ComponentType<Q>,
  props: Q
): SequenceStep<Q> {
  return { component, props };
}

export function isSequence<P>(fixture: Fixture<P>): fixture is SequenceFixture {
  return "sequence" in fixture;
}

export function sequenceElement(fixture: SequenceFixture): ReactElement {
  return createElement(
    Fragment,
    null,
    fixture.sequence.map((step, index) =>
      createElement(step.component, { key: index, ...step.props })
    )
  );
}
