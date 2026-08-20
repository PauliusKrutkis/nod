---
name: fast-loop
description: Fast development and prototyping loop — validate changes with only the fast checks (ultracite lint, tsc, unit tests, cargo check) scoped to the packages actually touched, and never run e2e suites or gallery shots locally. Use when the user wants to move fast, prototype, iterate across many PRs or tasks, or asks for a quick check instead of the full gate.
---

# fast-loop

Keep the local loop short: lint, typecheck, and unit tests for the packages the change touches — nothing else. E2e and gallery shots are CI's job (and CI already runs the cheap variants on PRs); paying for them locally on every iteration is the failure mode this skill removes.

## Two tiers

**While iterating** (after each meaningful edit, before showing the user):

1. `pnpm check` — ultracite over the repo. It is the CI lint gate and stricter than `biome check`; a plain biome pass is not a substitute.
2. Typecheck only the affected packages (map below).
3. Unit tests only for the affected packages — or narrower, `pnpm --filter <pkg> exec vitest run <file>` for the specs covering what changed.
4. If `apps/desktop/src-tauri/` changed: `cargo check` in that directory.

**Before pushing** (once per branch, not per edit):

1. Everything above, plus full `pnpm --filter <pkg> test` for each touched package (not just the narrowed specs).
2. `pnpm knip` — skip it during iteration (it flags not-yet-wired prototype exports as dead code), but CI's lint workflow runs it, so an unwired export pushed to a PR is a red check.
3. If Rust changed: `cargo test` in `apps/desktop/src-tauri/`.
4. Sweep out prototyping shortcuts before they leave the machine: `as any`, commented-out blocks, stray `console.log`, debug flags.

## Path → check map

| Changed path | Typecheck | Unit tests |
| --- | --- | --- |
| `apps/desktop/src/` | `pnpm --filter @nod/desktop typecheck` | `pnpm --filter @nod/desktop test` |
| `apps/desktop/src-tauri/` | `cargo check` | `cargo test` |
| `packages/ui/` | `pnpm --filter @nod/desktop typecheck` and `pnpm --filter @nod/gallery typecheck` (both consume it) | `pnpm --filter @nod/ui test` |
| `packages/tokens/` | same two consumers as ui | `pnpm --filter @nod/tokens test` |
| `packages/ledger/` | — | `pnpm --filter @nod/ledger test` |
| `apps/gallery/` | `pnpm --filter @nod/gallery typecheck` | `pnpm --filter @nod/gallery test` |
| `apps/web/` | `pnpm --filter @nod/web run check`; add `run typecheck:functions` if `apps/web/functions/` changed | `pnpm --filter @nod/web test` |

Root-level `pnpm typecheck` / `pnpm test` fan out across every package — use them only when the change genuinely spans the monorepo (lockfile bumps, shared config).

## Never run locally in this loop

- `pnpm e2e`, `pnpm e2e:web`, or any Playwright suite. The one exception stands from pr-validity: a diff that **adds or edits** an e2e spec runs just that spec (`pnpm --filter @nod/desktop exec playwright test <spec> --project=chromium`).
- Gallery shots. 900+ cells, sharded in CI for a reason; darwin renders don't match the committed linux baselines anyway.
- Webkit or perf projects of any suite — those run on push to main only.

## What CI still guards (so fast ≠ unguarded)

PR CI is already tiered: chromium-only e2e on desktop/ui/tokens changes, gallery shots when ui/tokens/gallery/quiet-css paths are touched, webkit-perf and prod-perf deferred to main. So skipping e2e locally defers it, it doesn't waive it — after pushing, check the PR's checks before calling the task done, and expect ui/tokens changes to pay the gallery-shots cost in CI. If a shot legitimately changed, the baseline update flows through the workflow's published artifacts, not a local darwin render.

## Prototyping posture

While the user is exploring an idea, don't gold-plate: skip knip, skip exhaustive edge-case tests, accept a narrower vitest scope. But the three iteration checks (ultracite, scoped tsc, scoped unit tests) always run — they're seconds each, and a prototype that doesn't compile wastes more of the user's time than the checks do. When the prototype graduates into a real PR, run the pre-push tier and hand findings to the pr-validity skill if a review is wanted.
