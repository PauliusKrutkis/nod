---
name: quiet-component
description: Create or retrofit a Quiet component with props-pure structure, interaction states, hostile fixtures that try to break it, and tests derived from those fixtures. Use when adding a UI component, adding fixtures to an existing one, or turning a data-shaped rendering bug into a permanent fixture.
---

# Quiet component with fixtures

Build components so they can be rendered from a fixture file alone, then write
the fixtures an adversary would pick. The gallery, the derived tests, and the
capture harness all consume the same fixtures export — there is no separate
registration step anywhere.

## Ground rules (this repo)

- **Props-pure.** The component renders from props alone: no `useAppStore`, no
  `api`, no hook that reaches the network. Store reads live in a thin container
  at the call site (`review-screen.tsx` and friends), the pure component below
  it. If it cannot be rendered from a fixture, restructure until it can.
- **Tokens only.** Every color resolves through a custom property from
  `apps/desktop/src/index.css`. A hex literal in a component or in new
  `quiet.css` rules is a defect — it is what breaks theme switching silently.
- **Quiet conventions.** `q-` class prefix, one focus-ring style, ≤150ms
  color-only motion, `prefers-reduced-motion` respected, zero new dependencies
  (no Radix/shadcn — hand-rolled is the rule here, see docs/ARCHITECTURE.md).
- **States are part of the component, not an afterthought.** Interactive
  components define rest / hover / focus-visible / active / disabled from the
  start. Non-interactive components deliberately have none — don't fake them.
- Comments follow docs/ARCHITECTURE.md: contracts and why, at the top; never
  what-the-next-line-does.

## Files

For a component `foo-pill`:

```
foo-pill.tsx           the component (props-pure)
foo-pill.fixtures.ts   named cases, typed against the real props
foo-pill.test.tsx      only for behavior fixtures can't express (see below)
```

The fixtures file is the contract:

```ts
import type { ComponentProps } from "react";
import type { FooPill } from "./foo-pill.tsx";

type Fixtures<T extends (props: never) => unknown> = Record<
  string,
  ComponentProps<T>
>;

export const fixtures = {
  typical: { ... },
  empty: { ... },
  overflow: { ... },
} satisfies Fixtures<typeof FooPill>;
```

`satisfies` is load-bearing: when the props change, every stale fixture is a
compile error, which is the whole point.

## The hostile fixture checklist

Walk the props and add every case that applies. Name fixtures for what they
probe (`overflow`, `crowd-40`, `unknown-state`), not `test1`.

- **Strings:** empty `""` · one char · a ~2,000-char value with no spaces (an
  unbreakable token, worse than long prose) · CJK (`藤本 さくら`) · RTL with
  bidi (`محمد الأمين`) · emoji incl. ZWJ sequences · content that looks like
  markup (`<img onerror=…>` must render as text — this is also a security
  fixture).
- **Arrays:** `[]` · exactly one · the typical count · the largest count seen
  in production (40 reviewers, 14 checks) · 10× that.
- **Numbers:** `0` · negative where the type allows it · large enough to need
  formatting (`12438` → `12,438`) · the boundary the UI claims (`max`, `+N`).
- **Unions/enums:** every member, plus one value outside the union delivered
  as `string` — GitHub's API grows states we haven't seen (`"reopened"`), and
  the fallback rendering is a real code path that deserves a fixture.
- **Dates:** just now · years old · in the future · an invalid/missing value
  if the type is a string from an API.
- **Optionals:** one fixture with every optional prop omitted at once.
- **Combinations:** the worst string inside the smallest container — overflow
  fixtures matter most at the narrowest pane width (280px sidebar).

**Provenance rule:** when a component breaks on real data, the fix lands with
the actual payload as a fixture named after the issue (`"bug-238": {...}`),
with a one-line comment saying what it regressed. Fixtures harvested from
reality outrank fixtures from imagination; over time the file becomes the
regression corpus.

## Tests are derived, not written

One spec enumerates all fixture files and asserts the universal truths — do
not write per-component render tests that repeat it:

```tsx
// gallery.derived.test.tsx — walks every *.fixtures.ts via import.meta.glob
for (const [name, props] of Object.entries(fixtures)) {
  it(`${component}/${name} renders`, () => {
    const { container } = render(<Component {...props} />);
    expect(container).not.toBeEmptyDOMElement();
  });
}
```

Per component × fixture it asserts: renders without throwing · output is
non-empty · interactive elements have an accessible name · markup-looking
strings appear as text (`queryByRole("img")` finds nothing injected) ·
`disabled`/`busy` props reach the DOM as real attributes.

Write a hand-rolled `foo-pill.test.tsx` only for what fixtures can't express:
number formatting assertions, fallback-path behavior for out-of-union values,
callback wiring. Follow the house style — a contract comment at the top,
mocked hooks at the edge (see `purchase-prompt.test.tsx`).

**Know the boundary:** jsdom performs no layout. Truncation, overflow,
wrapping, and z-order regressions are invisible to these tests — they belong
to the screenshot layer below. Never add a brittle `scrollWidth` assertion to
fake it.

## Screenshot tests (the layer that catches layout)

The bug class that motivated all of this — "renders fine until the data
changes" — is a *layout* failure, so the real gate is pixels in a real
browser, and the tests are again derived from the same fixtures export:

```ts
// gallery.visual.spec.ts — Playwright, project: webkit ONLY
for (const { comp, fx, theme, width } of enumerateCatalog()) {
  test(`${comp}/${fx}/${theme}/${width}`, async ({ page }) => {
    await page.goto(`/#/gallery/${comp}/${fx}/${theme}/${width}`);
    await expect(page.locator("[data-frame]")).toHaveScreenshot();
  });
}
```

- **Engine: `webkit`, never chromium.** Nod ships on WebKitGTK; the backlog
  already records that Chromium-only checks hid engine-shaped lag. Playwright's
  webkit build is the everyday CI proxy; the existing capture harness driving
  the real Tauri window stays the ground truth for on-demand/nightly sweeps.
- **Determinism or nothing.** The gallery route must freeze animation under
  `prefers-reduced-motion` (spinners paused at a fixed angle), use no
  timestamps/randomness in fixtures, and wait for fonts (`document.fonts.ready`)
  before capture. Screenshots are compared in one pinned Linux CI image —
  cross-OS font antialiasing makes macOS-vs-CI diffs pure noise, so local runs
  regenerate rather than compare.
- **Snapshots live in the repo.** A token or component change shows up in the
  PR as changed images — a reviewable pixel diff across every affected
  fixture. `--update-snapshots` is the deliberate "yes, this is intended" act.
- One deep-linkable hash per component × fixture × theme × width is what makes
  this enumerable — keep the gallery's URL scheme stable.

## Definition of done

1. Component renders from props alone; container owns any store/api reads.
2. Zero hex literals; every color is a `var(--…)`.
3. Fixtures file passes the hostile checklist, `satisfies`-typed.
4. Derived tests pass: `pnpm --filter nod test`, and the webkit screenshot
   suite has baseline images for every new fixture.
5. Interaction states defined (or deliberately absent) incl. focus-visible
   and reduced-motion.
6. Lint gate: `pnpm exec ultracite check` (stricter than plain biome).
7. If this work started from a bug: the triggering payload is a `bug-<issue>`
   fixture.
