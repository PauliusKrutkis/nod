# Ledger — review coverage for the AI era

Status: draft spec · owner: Paulius · epoch decision pending · 2026-08-13

The problem: AI now writes a large share of merged code, review is the
bottleneck, and teams that merge fast lose the thing pre-merge review used
to guarantee — that a human has read what's on main. Git has no concept of
review state, so once code merges, nothing tracks whether anyone ever
looked at it.

The bet: don't rebuild the review process or the VCS. Add a **ledger** — a
sidecar record of human (and agent) attention, keyed into git — and make
"review coverage of main" a number teams can see, ratchet, and enforce.
Nod becomes the flagship client; the ledger is its own product.

---

## 1. Concept

- **You never review a merged PR.** You review the *current state of main*,
  filtered to what no human has signed. Review state attaches to content
  (hunks on tip), not to diffs in history.
- **Net diffs.** The unit shown to a reviewer is the cumulative diff from
  the last human-signed state of a region to tip — however many PRs it took
  to get there. PRs that rewrite each other collapse; nobody reviews dead
  code.
- **PRs demote to provenance.** They explain *why* code changed; they are
  no longer the unit of work.
- **Coverage ratchet.** "% of post-epoch code on tip that has been
  reviewed" — same contract as diff coverage: we don't claim the past was
  reviewed, we guarantee the future doesn't regress.

## 2. Data model

Two stores, one rule.

**Git is the source of truth for content** — commits, trees, blame, SHAs.
The ledger holds foreign keys into git and derives everything positional
at read time. Nothing is ever written into history.

**The ledger is an append-only fact log.** Facts are immutable; nothing is
edited or deleted. A "wrong" review is answered by a newer fact.

| Entity | Definition |
| ------ | ---------- |
| **Anchor** | A tracked region: content-hash of a hunk + path heuristics, surviving moves/renames the way git's rename detection does. The moved-vs-rewritten boundary is the hard engineering. |
| **Fact** | `(actor, anchor \| topic, verdict, at-sha, at-time)`. Reviews, approvals, flags, topic assignments, boundary corrections — all one shape. Actor may be a human or an agent; the two are never conflated in derived metrics. |
| **Topic** | A named set of anchors with an editable boundary (a feature, a subsystem). AI-proposed, human-corrected; corrections are facts. Approvals attach here at a sha. |
| **Delta** | Derived queue item: net diff from a topic's approval sha (or an anchor's last-reviewed sha) to tip. Spawned by change, closed by a new fact. |

**The invariant: `status = f(facts, tip)`.** Every status anywhere —
reviewed, stale, approved, coverage — is derived at read time from
immutable facts joined against the current tip. Nothing stored can rot,
because staleness is the output of the derivation, never a field.

Consequences:

- "Two devs reviewed this" is permanent history even after the code
  changes; the *status* flips to stale, the facts remain.
- A feature approval is a baseline, not a boolean. Change inside an
  approved topic spawns a delta scoped to that topic, baselined at the
  approval sha. Reviewers see "84 lines changed since you signed", never
  "re-review the feature".

## 3. Classification (the map)

Nobody selects anything at authoring time — that bar is absolute. Hunks
classify at merge time via a cascade; each stage handles only what the
previous couldn't:

1. **Human assignment** (a correction fact) — sticky, wins over everything.
2. **Modification inherits from what it modified** — deterministic blame
   lookup; the workhorse. Satellite changes in mixed PRs (the event-bus
   refactor a feature needed) land in the topic of the code they touched.
3. **Learned path rules** — derived from past assignments, deterministic.
4. **LLM proposal** — only genuinely novel code, with PR title / commits /
   ticket as context. Proposes an existing topic or a new one (new
   features announce themselves as PRs that fit nothing).
5. **Fallback** — low-confidence hunks land in a provenance-named bucket
   ("#234 · misc"). Still reviewable. The queue never blocks on
   classification.

Classification quality affects grouping ergonomics only, never
correctness: an unmapped anchor is still tracked, queued, and countable.
Wrong labels cost a mislabeled queue item, not a lost review. Corrections
happen in the review flow (one keystroke, by the person already looking),
never as a separate chore.

Mixed PRs are the common case and the point: the ledger is split-pr
applied at review time, automatically, taxing no one. Enabling changes get
reviewed by the right eyes against the right baseline ("group by where it
lives, link to why it happened"); drive-by churn pools into a low-priority
bucket; scattered-but-coherent work reassembles into one topic view.

## 4. Cold start

- **Epoch, not backlog.** Everything on main at adoption is grandfathered
  pre-ledger: excluded from the metric, never queued. Day one: empty
  queue, clean number. Coverage is measured on post-epoch code only.
- **Backfill (optional, cheap-ish).** Never replay history — explain only
  surviving lines. One `git blame` pass over tip → commit → PR (squash
  merges make this a message parse) → approval state. Lines from approved
  PRs, unchanged since, get backfilled facts; the same pass seeds the
  topic map from historical PR titles. Pure upgrade: the epoch default
  works with zero backfill.

## 5. Architecture

New workspace package `packages/ledger` — headless engine, no UI deps.

```
packages/ledger/
  git/      hunk diffs, blame-at-tip, PR resolution (squash parse + gh API),
            refs/ledger plumbing with fetch-merge-retry
  facts/    fact schema; append-only store: one hash-named object per fact
            under refs/ledger; local SQLite index, always rebuildable
  anchors/  hunk identity: content hashing, move/rename tolerance,
            reviewed/stale derivation        ← the risky module
  topics/   assignment cascade; LLM classifier as a pluggable later stage
  derive/   queue, coverage, deltas, topic status — pure functions of
            (facts, tip)
  cli/      ledger queue | status | backfill | check (CI ratchet)
```

- **Language:** TypeScript, shelling out to system git. The CLI and the
  future indexer service reuse it directly. Port hot paths to Rust only if
  blame performance demands it.
- **App integration:** per ARCHITECTURE.md all I/O lives in Rust, so the
  desktop app ships the CLI as a Tauri **sidecar binary**; the webview
  talks to it through a thin Tauri command, same as every other seam. The
  Ledger tab is just another consumer.
- **Sync: git is the server.** Facts live in `refs/ledger` — append-only
  sets merge as a union, no semantic conflicts possible. Auth and hosting
  are inherited from the repo (humans, CI, and agents already hold git
  credentials). Precedent: Gerrit NoteDB, git-appraise.
- **Indexer service (later, on demand):** stateless; clones the repo,
  indexes refs/ledger, serves web UI + HTTP API, receives GitHub webhooks
  to track tip. Can die and be rebuilt from git at any time — a cache with
  a URL, never a second source of truth.
- **Agents:** an agent review is a fact with an agent actor — same schema,
  no new credential system. A thin MCP server over the local index gives
  agents structured read/write. The ratchet counts human facts; agent
  facts are triage signal.

Known operational papercuts: concurrent ref pushes need the retry loop;
shallow CI clones don't fetch custom refs by default; mirrors may strip
them. All mechanical, none architectural.

## 6. Surfaces

Interactive mockup (Quiet system): three screens — queue, session, topic.

1. **Queue** — unreviewed regions on tip, clustered into sessions sized
   for one sitting; churn + blast-radius heat, provenance PR chips,
   session length estimate, coverage ratchet in the titlebar. Keyboard:
   `j/k` navigate, `↵` start session, `e` archive, `f` flag, `o`
   provenance.
2. **Session** — current code, not historical diffs; unreviewed hunks
   highlighted; net-diff toggle against the last-signed sha; fact lines
   under reviewed/stale regions showing who signed what, when, at which
   sha. `r` mark reviewed, `f` flag follow-up.
3. **Topic** — approval state as baseline + open deltas; append-only fact
   timeline; per-delta review entry.

Surface rollout order: desktop tab (dogfood) → CLI/CI check → web
read-only dashboard (via the indexer) → MCP.

## 7. Testing

- **Fixture repos.** Synthetic git histories (scripted: commits, squash
  merges, renames, force-pushes) exercising every cascade stage and anchor
  edge. Deterministic; run in CI.
- **Replay tests for anchors.** Replay the last ~20 real merged PRs of
  this repo; assert anchors survive the renames/refactors that actually
  happened. This is the acceptance test for the risky module and the tool
  that finds the moved-vs-rewritten boundary.
- **Probe scripts as living benchmarks.** The blame-mining probe reports
  what fraction of tip lines resolve cleanly to an approved PR; tracked
  over time as repos and heuristics change.
- **Property tests on the fact store.** Append-only union-merge: any
  interleaving of concurrent fact writes converges to the same set.
- **Derivation golden tests.** `f(facts, tip)` snapshots for
  queue/coverage/status against fixture repos.
- **E2E.** The Ledger tab joins the existing Playwright suite; hostile
  fixtures per the quiet-component pattern (empty ledger, 10k-hunk queue,
  all-stale topic, unicode paths).
- **Dogfood metrics.** The tool measures its own trial: sessions/week,
  queue age distribution, correction rate (how often auto-classification
  is overridden — the classifier's real grade), coverage trend.

## 8. Product

**Two products, shared foundation.** Nod is single-player (a dev buys it
to review faster). The ledger's value accrues to a team's codebase; the
buyer is whoever lies awake wondering what's on main — founder, EM,
platform lead. Nod becomes the ledger's premium client.

**Category: "review coverage."** The coverage analogy does the market
education — everyone already understands a number, a ratchet, a badge.
Pitch is a question: **"Do you still know what's on main?"**

**Positioned against nobody.** Pre-merge AI reviewers (Copilot review,
CodeRabbit, Greptile) make review faster at the gate; the ledger makes
review complete after it. Complementary — their output can be facts here.

## 9. Pricing & licensing

- **Free:** solo + open-source use, fully local, facts in the user's own
  repo. Costs nothing to serve; is the distribution.
- **Paid:** hosted indexer per seat — web dashboard, team views, webhooks,
  agent API. The billing line is the moment a second person or a manager
  view enters. Priced against review time and incidents, not against
  $10-utility dev tools.
- **Trust story:** *your review history lives in your repo; we sell the
  window into it.* Leaving means keeping all data.
- **License:** FSL-1.1-Apache-2.0 (already the repo's license) is
  load-bearing: free internal/solo use, forbids competing hosted use for
  two years per release, converts to Apache-2.0. If enterprise friction on
  the CI action appears, dual-license the thin CLI shim MIT; engine stays
  FSL.

## 10. Distribution & marketing

Sell the idea before the product; ship the number before the tool.

1. **Essay:** "AI made review the bottleneck; here's review coverage" —
   the 2026 numbers (fully-AI PRs 1%→28% in a year, review wait ×4.6)
   carry the narrative. HN/lobsters.
2. **Badge:** free review-coverage GitHub Action + README badge (the
   codecov playbook). One number that makes other teams ask "what's
   ours?" Nearly free to run — it's `ledger check` in CI.
3. **Dogfood in public:** this repo becomes the first codebase with a
   review-coverage number and a burned-down ledger. "I let agents write
   most of my app; here's how I still know what's in it."
4. **Funnel:** essay → badge → waitlist → free solo tier → hosted team
   service.

**Landing page** (separate from Nod's; one page):
hook — "Do you still know what's on main?"; the queue screenshot; three
beats — *merge fast / review what survived / ratchet the number*; live
coverage badge of this repo as social proof; CLI install one-liner; team
waitlist form. No pricing page until the hosted tier exists.

## 11. Adoption plan

- **Phase me:** dogfood on this repo (agent-heavy, squash merges, real
  mixed PRs — the target profile).
- **Phase +1:** one colleague reviewing in the same ledger — the earliest
  possible test of the team half (two reviewers' facts, routing,
  approvals). Disproportionately informative; do not skip.
- **Phase design partners:** 3–5 AI-heavy small teams from the waitlist,
  hand-held, free, in exchange for weekly feedback. Their correction rate
  and queue-age data decide the classifier and service roadmaps.
- **Only then:** self-serve paid.

## 12. Roadmap

| Phase | Scope | Exit criterion |
| ----- | ----- | -------------- |
| 0 · probe | Blame-mining script on this repo | % of tip lines resolving to an approved PR is known; backfill go/no-go |
| 1 · plumbing | Fact schema, refs/ledger read/write/merge-retry, SQLite index | Facts round-trip across two clones |
| 2 · anchors | Anchor engine + replay tests over ~20 real PRs | Anchor survival ≥ target on real history; stale boundary documented |
| 3 · queue | Derivations + minimal Ledger tab (path+provenance grouping, no LLM) | Two weeks of real dogfood; verdict on the unit of review |
| 4 · decide | Continue only if phase 3 feels right | — |
| 5 · classify | Cascade + LLM stage; correction-rate metric | Correction rate < ~1 in 10 hunks |
| 6 · enforce | `ledger check` CI ratchet + badge | Ratchet green for a month on this repo |
| 7 · team | Colleague trial → indexer service → web dashboard | A second human reviews weekly without the desktop app |
| 8 · launch | Essay, badge action public, waitlist, design partners | — |

Deliberately deferred throughout: web, service, MCP, badge — until the
phase that needs them.

## 13. Risks

Ordered by severity; phases 0–3 exist to confront the top of this list
before a month is invested.

1. **Anchors may have no clean solution** — agent refactors are blame's
   worst case; false churn → noisy metric → total trust loss. *Research
   risk; phase 2 is the confrontation.*
2. **Visibility may not force review** — a dashboard reports a deficit, a
   gate forces payment. Rubber-stamping (`r`,`r`,`r`) is review theater at
   keyboard speed. *Mitigations unproven: churn-weighted sampling, pace
   audits, agent spot-checks.*
3. **The queue may be unwinnable** — if generation × survival outruns
   review capacity, the tool precisely measures a deficit nobody can
   close. *Dogfood gives the first data point on the winnable band.*
4. **Dogfooding can't validate the paid half** — solo use tests
   ergonomics, not team dynamics. *Phase +1 colleague trial is the
   cheapest partial answer.*
5. **The cheaper placebo** — "Copilot reviewed every PR" competes for the
   same anxiety budget and requires no behavior change.
6. **The number will be misread as safety** — coverage attests attention,
   not quality. First incident in "reviewed" code becomes an argument the
   metric is fake. *Say "coverage isn't correctness" from day one, in the
   product copy itself.*
7. **Two products, one dev, mid-launch** — Nod's launch and this compete
   for the same attention. *Sequencing: phases 0–2 are days, not weeks;
   the rest waits if it must.*

## 14. Kill / success criteria

- **Kill after phase 2** if anchor survival on real history is so low the
  queue would be mostly phantom re-reviews, and no tolerable boundary
  exists.
- **Kill after phase 3** if, dogfooding honestly, the net-diff unit of
  review feels worse than reviewing PRs — the whole premise fails.
- **Success at 6 months:** this repo's ratchet green and meaningful; one
  colleague reviewing weekly; ≥3 external repos wearing the badge; ≥1
  design-partner team asking for the hosted tier unprompted.

## 15. Open questions

- Working name. "Ledger" is a placeholder; the badge/action needs a real
  one before phase 8.
- Epoch semantics for repos adopting mid-flight with backfill: is
  backfilled-approved counted in coverage or shown separately?
- Should agent facts ever satisfy the ratchet (e.g. for churn-bucket
  hunks), or is the metric strictly human? Leaning strictly human.
- Anchor granularity: hunk vs logical block (function/class via
  tree-sitter). Hunks first; blocks are a possible phase-5 upgrade.
- Multi-repo topics (one feature spanning app + service repos) — out of
  scope until a design partner forces it.
