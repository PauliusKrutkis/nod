# Ledger — review coverage for the AI era

Status: draft spec · owner: Paulius · dogfooding since 2026-08-13 (phases
0–3 built; epoch `d2962f6` in `.ledger/config.json`)

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

## Using it today

The engine (`packages/ledger`), the CLI, and the desktop tab exist; this
repo is the first ledger.

**CLI** — from the repo root (plain Node ≥ 23, no build step):

```
pnpm ledger status               # coverage + queue size
pnpm ledger queue                # unreviewed regions, with provenance
pnpm ledger session [target]…    # queued files as net-diff patches
pnpm ledger review <path>        # sign every queued region in a file
pnpm ledger review <path>:12-40  # sign one region
pnpm ledger sync                 # exchange facts via origin
pnpm ledger init [rev]           # adopt a repo: set the epoch (default HEAD)
```

**Desktop tab** — `pnpm dev:desktop`, then `mod+shift+L` from anywhere.
Pick a watched repository, tell it once where your local clone lives
(stored in the `nod:repoPaths:v1` personal-local map; the last repo
reopens directly), land in its queue: one row per feature-ish group
(conventional-commit scope, PR/sha fallback — the deterministic stage
before phase-5 topics). `j`/`k` navigate, `enter` opens the group's
**session** — the code rendered on the same surface as a PR review, as
the net diff since the last signature (real `git diff baseline..tip`
when the file decayed from a signed anchor, unreviewed-lines-as-adds
when it was never signed). In the session `r` signs the region under
the cursor, `mod+f` finds, `esc` steps out — session → queue → picker →
inbox. Signing exists only where the code is on screen; the queue has
no sign key by design (§13's rubber-stamp risk).

**The loop:** merge normally → open the queue → enter a session → read →
`r` (or `ledger review` / `ledger session` from the CLI) → watch
coverage climb. Reviews become facts in the target repo's
`refs/ledger/facts`, signed as `git config user.name`; `ledger sync`
publishes them through the ordinary git remote.

Dogfood-phase constraints, deliberate: the target repo must vendor the
engine and be locally cloned; the desktop app spawns `node` from PATH
(fine for terminal-launched dev builds — the sidecar binary replaces
this); every status derivation is a full blame pass, so a cold load takes
seconds (the SQLite index arrives when scale demands it).

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
- **Sync: git is the server.** Facts live in `refs/ledger/facts` (two path
  levels are mandatory: receive-pack rejects single-level refs like
  `refs/ledger` as "funny refnames") — append-only sets merge as a union,
  no semantic conflicts possible. Auth and hosting
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

### The two-app split

Both desktop and web, split by capability — never by duplicating
features:

| Surface | Owns |
| ------- | ---- |
| Desktop | Reviewer's cockpit: queue, sessions, topics, comments; clone-powered features — go-to-definition (LSP against the checkout), ask-AI with whole-repo context, AI pre-review and AI-drafted comments |
| Web | Dashboard, org settings, login, subscription/billing, playground |
| CLI/CI | `ledger check` ratchet, rules engine, backfill |

**The clone is the pivot.** Nod today is API + JSON cache; the ledger
requires a real local clone (blame at tip, refs/ledger, net diffs). That
same clone is the prerequisite for the desktop AI/navigation features, so
they ride in on infrastructure the ledger needs anyway — one new
architectural tier (clone + sidecar) beside the existing API tier, and
the ask-about-code work should target it. AI actions need no new model:
"review with AI" / "comment with AI" invoke an agent that writes agent
facts; the human accepts or discards, and acceptance is the human fact
the ratchet counts.

**Identity — two layers.** The data plane needs no accounts: facts carry
GitHub identity and repo access is authorization (the free tier has
nothing to sign up for). Accounts exist only for the hosted service, via
the existing GitHub OAuth app; billing lives exclusively on web and the
desktop app reads entitlements.

**Settings — three scopes.** Repo-versioned (`.ledger/`: epoch, ratchet
thresholds, topic seeds, rules — reviewable like code), personal-local
(desktop prefs), org-hosted (seats, webhooks, API tokens — web).

**Playground.** The indexer serving a read-only fixture repo in the
browser — queue/session/topic with no install. Primarily a marketing
asset: the landing page's "try it" moment.

**One review surface, three backends.** The frontend is already
browser-native (Tauri webview; the webview never does I/O — everything
crosses the typed wrapper seam). Ship the same React review surface as
three builds behind one interface: desktop (Tauri → Rust → local clone +
sidecar; free/solo/power tier), playground (fixture data — the existing
demo build), and browser app (HTTP → indexer; hosted team tier). The
indexer's server-side clone makes the browser app fully featured — real
sessions, net diffs, topics — not a lite dashboard. Desktop stays the
flagship because keyboard-first degrades in browsers (Tab and focus are
contested), local-clone latency is zero, and it needs no service.
Discipline from phase 3: the Ledger tab's surface lives in a shared
workspace package talking only to the seam interface, so the browser app
later is a backend binding, not an extraction project.

## 7. Testing

- **Fixture repos.** Synthetic git histories (scripted: commits, squash
  merges, renames, force-pushes) exercising every cascade stage and anchor
  edge. Deterministic; run in CI.
- **Replay tests for anchors.** Replay the last ~20 real merged PRs of
  this repo; assert anchors survive the renames/refactors that actually
  happened. This is the acceptance test for the risky module and the tool
  that finds the moved-vs-rewritten boundary.
  *Measured 2026-08-13 (20 merges, 341 anchors, 8.8k signed lines):
  90.4% alive, 9.5% stale, 0.2% gone; unexplained-vs-blame (false churn)
  0.4%, all of it 1–4-line stale-rounding residue. Normalization levels
  (exact/rtrim/ws) were indistinguishable on this history — a
  formatter-disciplined repo never exercises them; fixture tests pin
  where they diverge. Default: ws, stale threshold 0.35.*
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

### LLM economics: bundled where bounded, BYOK where open-ended

The two kinds of AI have opposite cost shapes, and the tiering follows
from that — a paying customer must never need a key for the core product
to work well.

- **Pipeline AI** (classification of novel hunks, clustering, session
  narration) is merge-triggered and bounded: its rate is the team's merge
  rate, a few thousand tokens on a cheap fast model per merge — cents per
  day, scaling with repo activity, which correlates with seats. **Paid
  tier: bundled in the sub**, runs on the indexer (it receives the merge
  webhooks) with our gateway key, per-org daily budget as backstop —
  past the cap, the deterministic cascade stages carry alone until the
  budget resets. Free/local tier: BYOK, or keyless with
  deterministic-only grouping.
- **Interactive AI** (browser ask-about-code, on-demand deep agent
  reviews) is user-triggered and open-ended — the real cost-spike and
  abuse surface. **BYOK at every tier** (org-level key: Anthropic,
  OpenRouter, corporate gateway; pass-through, no metering). Managed
  credits (per-org pool, hard cap) remain a later on-demand upsell.
- **BYOK is an override, not a toll:** an org setting flips all AI —
  pipeline included — to the customer's key, for compliance-sensitive
  orgs whose code must not transit our provider, and for power users
  pinning models. Default paid experience: subscribe, connect repo, done.
- **The sub prices seats + infrastructure + bounded pipeline inference;
  it never meters.** The daily budget is a backstop, not a billing meter;
  there is no per-action pricing and no reselling margin to defend.
- **Keyless degradation stays mandatory.** The LLM is stage 4 of the
  cascade; queue, coverage, ratchet, and review work with no key and no
  budget. This is what makes the cap graceful and the free tier honest.
- Playground AI runs on our key against the fixture repo only.

### Self-hosting

Supported by construction, kept deliberate:

- The free tier is already serverless-by-design — engine, CLI, desktop,
  facts in refs/ledger; git is the server. Nothing of ours to host.
- The indexer is the only server and must stay trivially self-hostable —
  a written design constraint, not an accident: **one container, embedded
  storage (SQLite), no queue, env-var config**. Every infra dependency
  the hosted version picks up is a self-host installation step; do not
  pick them up.
- Self-host auth: configurable GitHub OAuth app (self-hosters register
  their own). Pipeline AI runs in BYOK mode via the existing org-level
  override.
- FSL already permits internal self-hosting and forbids the only
  dangerous actor (competing hosted service). No license-key gating now.
- Business line: the sub sells ops-free (uptime, updates, webhooks,
  bundled AI); free internal self-host is the enterprise on-ramp —
  compliance-bound orgs adopt anyway, and SSO/audit/support becomes a
  paid enterprise self-host tier when demand appears.

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

## 15. Extended capabilities

Everything below is either a new fact type or a new consumer of the fact
stream — additive, never structural. Deferred until a phase demands it,
but the model supports all of it by construction.

- **Inline comments.** A fact `(actor, anchor, body, at-sha)`. Anchored to
  content, comments travel with code through moves/rebases and degrade
  gracefully when code is rewritten ("commented on a previous version;
  here's the net change since") instead of orphaning like diff-positioned
  comments. Threads are facts referencing a parent fact; resolving is a
  fact.
- **Global comments.** The fact subject is a union — anchor | topic |
  delta | fact. Topic comments are feature-level discussion; no new
  machinery.
- **Agent API.** Agents write facts and read derivations: MCP over the
  local index, HTTP via the indexer. Agent facts never satisfy the
  ratchet; they are triage signal.
- **Pipelines (rules).** Two trigger classes: raw events (fact appended)
  and derived transitions (delta spawned, topic went stale, coverage
  dropped, item aged past N days). Rules live versioned in the repo
  (`.ledger/rules`); day one they evaluate in CI via `ledger check`,
  later the indexer evaluates the same rules in real time. Same format,
  two runtimes.
- **Webhooks.** Outbound from the indexer (fact appended / transition
  fired). Note: GitHub Actions' `on: push` does not trigger on custom
  refs, so real-time eventing belongs to the indexer; CI polling covers
  the local tier.
- **Limits, stated plainly:** real-time (presence, live threads, instant
  hooks) is a service-tier property — the git data plane syncs at
  push/fetch cadence. Append-only means comment edits are
  supersede-facts and deletes are tombstones. Pre-merge review stays
  GitHub's and Nod's job; the ledger consumes it (approvals become
  facts) rather than competing with it.

## 16. Open questions

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
- Purging abusive comment content from refs/ledger requires rewriting the
  ref (doable — it's not code history — but distributed clones may retain
  copies). Moderation story needed before comments ship to teams.
