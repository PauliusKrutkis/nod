# Nod — backlog

> **Planning only.** Open work, and the decisions that constrain it. Shipped
> items are not tracked here — when one lands, either its reasoning still binds
> future work and it becomes a line in [Decisions](#decisions), or it was
> bookkeeping and it belongs in git history. **Do not leave completed checkboxes
> behind**; that is what flooded this file to 2,600 lines by 2026-08-08.

Legend: 🟢 small · 🟡 medium · 🔴 large/involved · ⏸ post-MVP · ❓ open question.

**Context:** This is a product plan, not a feature wishlist. Superhuman didn't win
because Gmail links opened in Superhuman — it won because **once you were inside,
it felt incredible.** Foundational = fast cache, keyboard navigation, pleasant
review flow. Entry friction is optimizable later.

**Avoid:** optimizing the last 5% of entry (Slack link interception) before
validating the other 95% (the review experience inside the app).

---

## Decisions

Calls already made that still bind what gets built next. Each one is here
because reversing it costs something, or because it is the answer to a question
that keeps getting re-asked. Anything not listed was implementation detail;
`git log docs/BACKLOG.md` has the full text of every item this replaced.

### Product position

- **Nothing in the app is ever gated** (2026-08-05). A license buys updates and
  recognition, never capability, and the public copy says so. Any future item
  proposing a licensed-only feature is off-position by default and needs this
  reversed, not an exception carved. The one thing a license controls stays
  `updates_until` in the updater. See [§ pricing](#pricing-and-licensing-2026-08-05).
- **BYOK is the position, not an exception to it** (2026-08-03, [AI.md](./AI.md)).
  The site reframed from "no AI" to "not rented, not bundled" (#201). The app
  ships knowing nothing about any model.
- **Pasting the key is the consent act** (2026-08-01). AI is off until the user
  enables it and pastes their own key, with one disclosure sentence at that
  moment. Nothing is ever sent silently or by default. A per-repo allowlist
  stays a later hardening step, not a launch blocker.
- **The release gate is satisfied and its writing freeze is retired**
  (2026-08-05). External dogfooding at scale has still not happened — the
  five-developer round is gated behind [§11c](#11c-commercial-launch) — so every
  "after users tell us" gate below still binds *build order*.
- **Homebrew stays; notarization is the fix** (2026-08-08). Dropping the cask
  does not avoid Gatekeeper, because the `.dmg` is the same unnotarized build.

### Architecture

- **The webview never holds credentials.** Host tokens and the AI key live in
  the Rust backend; the frontend receives token-free info structs and requests
  are made from Rust. This is why there is an `ai_complete` command rather than
  a `fetch` in React.
- **The app owns the repo clone.** Repo context comes from one bare,
  blob-filtered clone per watched repo (`repo_store`), fetched with the
  account token — the user never supplies a path. Superseded the tarball
  snapshots 2026-08-23; see
  [§9](#9-repo-store--local-repo-content-re-decided-2026-08-23-tarball-layers-decided-2026-07-12).
- **react-virtuoso owns windowing.** It replaced ~400 lines of hand-rolled
  virtual list. CodeMirror 6 per file was considered and ruled out: purpose-built
  but a much deeper integration for marginal gain.
- **shadcn / Radix are ruled out** (2026-08-05). The app carries zero Radix,
  shadcn or cmdk dependencies; the Quiet tokens in `quiet.css` are the design
  system. `apps/design-lab` keeps shadcn-on-Radix as a **mocking tool only** and
  that implies no migration path. Revisit only per-primitive (popover, combobox,
  context menu), never as a phase.
- **Perf budgets run on Chromium *and* WebKit.** The app ships on WebKitGTK and
  Chromium-only budgets hid engine-shaped lag. A `chromium-perf-prod` project
  runs the same specs against the production build at roughly half the bounds.
- **Comment mutations are optimistic by design** — fire-and-forget, no loading
  states, documented in `use-comments.ts`. Awaiting them breaks the flow and the
  specs that prove the flow. `isPending` alone **cannot** stop a double submit:
  it is a prop, so it only becomes true after a render and two ⌘↵ in the same
  tick both pass it. The synchronous `inFlightRef` in `AddCommentBox` is what
  actually closes that window.

### Interaction

- **`Tab` cycles files.** The Code ↔ Info toggle that once wanted this key was
  resolved as the `i` / `shift+i` drawer instead — a drawer keeps the code on
  screen where a tab swaps it away — so nothing contends for `Tab`.
- **Full-file expansion stays continuous, not locked** (closed 2026-08-05).
  Three weeks of daily use produced no complaint about scrolling out of an
  expanded file, next to plenty of *other* scroll feedback. Locking would also
  have to answer what `r`/`t`/`e` mean inside a locked file.
- **Comment threads are cursor stops, collapsed ones included.** That is the
  case that matters: a collapsed thread is one quiet line you would otherwise
  never learn about. It is a *selection* model, not focus — no `tabIndex` was
  added and none should be.
- **`f`/`g` clamps on conversations**, landing on the first thread between the
  cursor and the arithmetic landing row. Held repeat deliberately does *not*
  clamp — holding means "get me far away".
- **Cursor nudges leave `CURSOR_CONTEXT_ROWS` of real rows**, measured from a
  rendered row, never a pixel margin. A flush landing arrives clipped because
  Virtuoso's geometry is estimated.
- **Plain click marks a word; `mod`+click navigates occurrences.** One gesture
  doing both jobs was the bug, and splitting them was the fix. *Under challenge:*
  [§ code navigation](#code-navigation) proposes making `mod`+click semantic
  (go to definition), with occurrence navigation kept as the fallback.
- **Inbox digits are positional over the *visible* tabs**, so a digit can never
  summon a hidden empty tab. Hidden tabs keep a keyless palette binding.
- **The file tree is an added mode and the default; the flat list stays.**
  Keyboard nav inside the tree is a known, accepted limitation. When it arrives:
  keep collapsed files in the `r`/`t`/`e` cycle and auto-expand the folder on
  arrival — the cycle is about the diff, not the tree.
- **The motion budget is near zero.** File-tree toggle transitions were removed
  deliberately and folder collapse is instant; hover feedback on a row is not
  "the tree animating" and is kept.
- **Reusable lists have one mechanism** (2026-08-09). Canned comments on a
  key and the ask note's prompt suggestions are the same shape, so they share
  one implementation with two sources: a localStorage-backed list, a Tab-armed
  editor dialog, and a palette entry. Two parallel implementations would
  drift, which is what the feature-ideas entry warned about.
- **The ask note stays its own surface** (2026-08-08). Posted threads, pending
  comments and AI answers are three deliberately distinct materials so nothing
  machine-written can be mistaken for something published.

### Process

- **E2E presses `ControlOrMeta+…`, never `Control+…`.** ProseMirror resolves
  `Mod-` to Cmd on macOS, so hardcoded `Control` passes on Linux CI and silently
  no-ops on macOS. Also: no native caret keys (`Home`/`End`) inside the
  ProseMirror surface — the native move races PM's async selection sync.
- **The composer is TipTap v3 with markdown on the wire.** `getMarkdown()` feeds
  the same API payloads; raw markdown symbols in the UI were tried first and
  rejected as "going back".
- **Release notes are curated at tag time** by the
  [release skill](../.claude/skills/release/SKILL.md), which is what makes the
  in-app "What's new" card show a real changelog.
- **CI is path-filtered and PR-trimmed; main pays the full bill** (2026-08-11).
  Workflows are split per area (desktop / rust / web / packages / e2e /
  gallery shots) and run only when their paths change; PR e2e is
  chromium-only, with the webkit-perf and prod-perf projects moved to
  push-to-main (`E2E_WEBKIT` / `E2E_PROD_PERF` in the playwright config);
  gallery shots shard 4× with one worker each, preserving the determinism
  invariant; Playwright browsers restore from a version-keyed cache
  (`.github/actions/setup`); superseded PR runs are cancelled. The skills
  gate matches: slices run only the e2e specs they touch, never the full
  suite per iteration.

---

## Still open — infrastructure and delighters

| Item | Section | When |
| --- | --- | --- |
| **Linux AppImage with the ledger sidecar** | release.yml | Dropped in v0.9.3: linuxdeploy patchelfs every AppDir binary and a patchelf'd bun binary dies with SIGILL (verified in a container); its gtk plugin also aborts running ldd over the sidecar. deb+rpm ship instead, which costs Linux auto-update (Tauri updates via AppImage only). Fix candidates: ship the sidecar as a resource and mark it executable at runtime, or an upstream linuxdeploy exclude flag. |
| **Commercial launch** | §11c | Blocked on live accounts, not code |
| `nod://pr/...` routing | §11a | With the Stage 2 extension |
| Simple **"Open in Nod"** extension | §11a Stage 2 | After daily-use users |
| Link **interception** + native messaging | §11a Stage 3 | Only if users ask |
| Universal Links / wrapper domain | §11a | Unlikely needed if extension suffices |
| **Repo store layer 3** | §9 | Layer 2 shipped (repo-scope search); layer 3 gated |
| New icon · streaks · celebration · Conversation mode | various | Post-MVP |

**Ship rule, still standing:** if five developers use it for a week and
**nobody** says *"I wish GitHub links opened this"*, you have saved weeks of
integration work.

---

## Perceived performance budget (north star)

| Action | Goal |
| --- | ---: |
| Open app | < 300 ms |
| Resume last PR | < 300 ms |
| **`mod+k` → open PR** | < 100 ms |
| Switch PR | < 100 ms |
| Switch file | < 16 ms |
| Command palette | Instant |

### Performance architecture — decisions queued (2026-07-05)

Post-mortem of the find-in-diff perf saga (PR #18): nearly every symptom —
mount stalls, pop-in, phantom scrolling on open, find lag scaling with PR
size — traced to ONE architecture choice (render the whole PR as one DOM and
window it by hand) plus ONE platform reality (Linux ships WebKitGTK: no
scroll anchoring, main-thread overflow scrolling, untested-on engine). The
hand-rolled windowing now works and is guarded by e2e, but it is ~400 lines
of incrementally reinvented virtual list: mounted-section set + IO mounting +
height estimates + idle pre-mounter + input yielding + manual scroll
anchoring + section-offset resume + viewport-scoped find marks.

- [ ] 🟡 **CPU and memory budgets in the perf e2e** (2026-08-09) — every perf
      spec today measures *time*: `scroll-perf` counts frame gaps and stalls,
      `find-perf` counts repainted rows per keystroke, `open-perf` takes warm
      wall clock. Nothing measures what the app **costs while it sits there**,
      and the two complaints a desktop review tool earns are exactly those:
      a fan that spins up on a big PR, and a process that grows all afternoon.
      *What to measure, in order of value:*
      - **Heap after a soak.** Open PR, scroll it end to end, switch files,
        open and close the drawer, return to the inbox, repeat N times, then
        read `performance.measureUserAgentSpecificMemory()` (Chromium, needs
        crossOriginIsolated) or fall back to CDP `Runtime.getHeapUsage`.
        The assertion that matters is not an absolute number but that the
        curve **flattens**: heap after 10 cycles must not exceed heap after 3
        by more than a margin. That catches the listener and cache leaks a
        virtualized list invites, and it is the class of bug no existing spec
        can see.
      - **Idle CPU.** With the app open and untouched for ~10s, cumulative
        `Performance.getMetrics` `TaskDuration` must be near zero. Guards
        against a stray interval, a rAF loop nobody cancelled, or a poll that
        forgot to back off, all of which are invisible to frame-timing specs
        because they cost nothing while you are already scrolling.
      - **DOM node ceiling.** `document.querySelectorAll("*").length` after
        scrolling a large PR. `scroll-perf` already caps rendered rows; a node
        ceiling catches growth outside the row stream.
      *Where it belongs:* a new `resource-perf.spec.ts` beside the existing
      three, **Chromium-only** and gated the way `chromium-perf-prod` already
      is. Memory APIs are engine-specific and WebKit exposes nothing
      comparable, so pretending to measure it on both would be theatre.
      *Two warnings from the existing suite's own history.* Numbers on a dev
      server are ~2x inflated by React's dev runtime and GC noise, which is
      why the production-build project exists; run these there or the budgets
      are fiction. And a resource budget is far noisier than a frame budget,
      so it must be tuned to fail on a **trend**, not a single sample, or it
      becomes the flaky spec everyone reruns until it passes. Prefer few
      assertions with real headroom over many tight ones.
      *Pairs with* **real-app perf telemetry** below: this catches regressions
      in CI on fixtures we thought of, that one catches them on the user's
      machine on PRs we did not.
- [ ] 🟡 **Real-app perf telemetry** — PerformanceObserver (long tasks +
      event timing) feeding the existing perf overlay/store, so regressions
      show up as numbers from the user's machine instead of bug reports that
      start "feels laggy". Every complaint in the saga arrived through feel;
      CI budgets only test the fixtures we thought of.
- [ ] ⏸ **Electron decision trigger** — keep Tauri, but count the cost:
      every time a WebKitGTK-specific issue burns a day (scroll anchoring,
      compositing, the AppImage EGL workaround), tick this item. If it keeps
      ticking, Chromium-everywhere via Electron is the honest fallback —
      ~10× footprint for perf predictability and dev/prod engine parity. Do
      NOT reach for more engine-specific cleverness first.

---

## Opening a PR — ranked by stage

### Stage 2 — daily users (after v0.1, if needed)

Simple browser extension — **not interception**. ~10% of interception effort,
most of the value:

- **"Open in Nod"** button on GitHub/GitLab PR pages (content script)
- Toolbar button + context menu ("Open in Nod")
- Calls **`nod://pr/owner/repo/123`** — register scheme in Tauri app

No native messaging. No auto-intercept. Easy to build and test.

- [ ] 🟡 **Stage 2 extension** — content script + toolbar + `nod://` handler.
      *Designed 2026-08-09:* [arriving from elsewhere](https://claude.ai/code/artifact/29efaa50-d5df-48e3-a023-953fa3e9f972) draws the button on
      a real GitHub page, the toolbar popup and the host list. **The button
      takes the host's shape and only Nod's accent colour**: this is the one
      surface where the Quiet system is wrong, because a dark indigo control
      sitting on someone else's chrome reads as an advert or a phishing
      attempt. Recommendation is still **not to build it** until someone says
      they keep clicking host links; the design exists so that decision is
      cheap when it comes.
- [ ] 🟡 **Self-hosted GitLab** — user-configurable host patterns in extension.
      *Designed 2026-08-09:* in the same mock. The host list is treated as
      **a permission, not a setting** — adding an internal domain is the most
      sensitive thing this product would ever ask for, so the scope ("Nod only
      reads the page address on hosts you list here") sits next to the field
      that grants it rather than in a policy nobody opens.

### Stage 3 — proven pain only (⏸)

**Only if users say:** *"I keep clicking GitHub links and it's annoying."*

- Intercept navigation before GitHub loads
- Native messaging host (bundled with desktop app)
- Close tab immediately · minimize browser flash

Complex: browser API differences, permissions, Slack in-app browser edge cases.
**Do not build until Stage 2 feedback demands it.**

- [ ] ⏸ **Stage 3 interception** + native messaging.
- [ ] ⏸ Universal Links / wrapper domain — only if extension path fails.
- [ ] ⏸ Userscript — lightweight alternative to full extension.

---

## PR view layout — code-first

**Code** is the app. Description and PR-level comments live one keystroke away.

- [ ] ⏸ Conversation mode (third surface) — still deferred, and note it is the
      decision the merged-feed half of
      [Info tab: one comment feed](#inbox-2026-07-30) would spend early.

---

## Shortcut scheme

| Key | Action |
| --- | --- |
| **`j`** / **`k`** (or `↓` / `↑`) | Next / prev line (cursor) |
| **`shift+j`** / **`shift+k`** | Extend selection down / up |
| **`f`** / **`g`** | Fast down / up |
| **`Space`** / **`PageUp`** | Page down / up |
| **`r`** / **`t`** | Next file (or reply to the active thread) / prev file |
| **`Tab`** / **`shift+Tab`** | Cycle files forward / back |
| **`e`** / **`v`** | Mark viewed + next · toggle file viewed |
| **`shift+v`** | Expand full file ↔ diff only |
| **`mod+b`** | Toggle file tree |
| **`q`** / **`w`** | Next / prev comment thread |
| **`c`** / **`shift+c`** | Comment on the cursor line / on the PR |
| **`x`** / **`shift+e`** / **`z`** | Resolve · edit your comment · expand/collapse thread |
| **`shift+d`** | Discard the pending comment at the cursor |
| **`mod+i`** | Toggle info panel |
| **`o`** / **`y`** / **`mod+shift+c`** | Open on host · copy PR link · copy file path |
| **`s`** | Submit review |
| **`mod+t`** / **`mod+r`** / **`mod+f`** | Find a file · search code · find in diff |
| **`n`** / **`p`** | Next / prev occurrence (only while one is selected) |
| **`mod+k`** | **Jump to PR** + commands |
| **`Esc`** | Clear selection → close find → close panel → inbox |
| **`mod`+click** on a word | Next occurrence of it (previous, on the last) — marks it first if nothing is marked |

> Shipped keys, verified against `review-screen.tsx`. `Tab` cycles files, and
> nothing contends for it — the Code ↔ Info toggle that once wanted it was
> resolved as the `i` drawer (see § layout).

---

## 4. Review workflow

- [ ] ⏸ Persist pending comments — post-MVP; flaky local drafts worse than none.

### 4c. Viewed sync with host (cross-device)

Viewed marks today are local-only: `toggleViewed` → debounced `set_viewed_map`
→ `viewed_{accountId}.json` on disk. Fingerprints power auto-unview on push,
but ticks do not follow you to github.com or another machine.

- [ ] 🟡 **GitHub host sync** — hybrid, cache-first:
  - On PR open, hydrate from GraphQL `viewerViewedState` on changed files
    (needs PR node ID on `PullRequest`; detail fetch may need a GraphQL path
    alongside the REST files list).
  - On toggle, keep optimistic local update + fingerprint; background
    `markFileAsViewed` / `unmarkFileAsViewed` mutations.
  - Merge rule: host wins on load when online; local `viewed_*.json` stays as
    offline cache and reconcile fallback.
  - GitLab: no public API today (gitlab.com is localStorage too) — keep local
    fingerprints only until upstream ships reviewed-files endpoints.

---

## 5. Comments UX

Inline → Code view. PR-level → Info tab + badge. ⏸ Conversation mode.

- [ ] 🟡 **Hide comment threads entirely — including the stub row** — scoped
      2026-08-05 (owner). `z` already collapses a thread, and resolved threads
      already collapse, **but a collapsed or resolved thread still leaves a
      line in the diff** — a trail of stubs between the code. The ask is an
      option to hide those rows outright, so a file reads as pure code.
      *The one real constraint, and it is a genuine tension:* collapsed threads
      were made cursor stops **on purpose** — see "Comment threads as cursor
      stops" in § keyboard, whose whole argument was that *"a collapsed thread
      is one quiet line you would otherwise never learn about."* Hiding the row
      deletes exactly that affordance, so this must be an **explicit, opt-in,
      clearly-reversible toggle** — never a default, never sticky in a way you
      can forget — and while it is on, the app owes you a standing signal that
      something is hidden (a count in the file header or the PR header is
      enough). Hidden must mean "I chose to hide 4 threads", never "this file
      has no discussion".
      *Decided 2026-08-09 (owner): **resolved only**.* Resolved threads are
      noise by definition, so hiding them cannot cost you a live conversation,
      which is the failure this item already names. Hiding unresolved threads
      would delete exactly the affordance the cursor-stop decision was built to
      protect, and the standing "something is hidden" signal is easier to make
      honest when the hidden set has a single, obvious meaning. If the stub
      line still grates once resolved ones are gone, revisit then.

### 5d. Comment-management follow-ups (post-comment-feature)

Edit / delete / reply / resolve / unresolve now work end-to-end in **both**
surfaces — inline threads (`comment-thread.tsx`, all five actions via
`review-list.tsx` `MappedCommentThread` callbacks) and the Info drawer
(`right-panel.tsx` add / edit / delete of issue comments; reply/resolve stay
inline by design). These are cleanups, not new scope.

- [ ] ⏸ 🟢 **E2E for reply / resolve / unresolve** — edit and delete are covered
      (`comment-edit.spec.ts`, `comment-delete.spec.ts`, `drawer-comment.spec.ts`),
      but reply, resolve, and unresolve are wired yet unverified by any spec. Add
      inline-thread coverage for all three.

---

## 7. Data freshness

60s polling + refetch on focus. No **`r`** key. No sync UI.

- [ ] 🟡 **GitHub cheap-polling via the Notifications API (P16 PR2)** — the
      ETag/304 conditional-request cache (PR #49) lets GitLab + every REST GET
      re-poll for free and drops the inbox interval to 15s, but GitHub's inbox
      is a GraphQL POST that can't do conditional requests, so each GitHub poll
      still spends rate-limit budget. It's comfortably within the 5000 pts/hr
      budget at 15s (focus-only), so this is an optimisation, not a fix. Keep
      GraphQL for the rich inbox, but gate it behind GitHub's Notifications REST
      API (`GET /notifications` — supports ETag, returns `X-Poll-Interval`):
      poll notifications cheaply as a change-detector and run the full GraphQL
      inbox only when they signal activity, with a slow (~60s) GraphQL baseline
      as a floor (notifications don't cover every review-requested PR). Do NOT
      move the GitHub inbox to REST search — its separate 30 req/min limit +
      loss of the single-query rich fields makes it worse.
- [ ] ⏸ Webhooks — post-MVP. Now a **transport** swap rather than a feature:
      detection, dedupe, read state and the sinks live behind
      `lib/notification-events.ts` + `store/notification-store.ts`, so a
      webhook (or the Notifications-API detector above) only has to produce
      `NotificationEvent`s with stable ids and call `ingest`.

---

## 8. shadcn/ui — closed, decided against (2026-08-05)

---

## 9. Repo store — local repo content (re-decided 2026-08-23; tarball layers decided 2026-07-12)

Extend cache-first from "PR metadata + diffs" to **the repository itself**.
Layer 1 v1 was a tarball snapshot per head SHA (no git operations, one HTTP
GET); it shipped, carried the AI tools and repo search, and was **replaced
2026-08-23 by the repo store** (`repo_store` module): one app-owned bare
clone per watched repo under the cache dir, `--filter=blob:limit=10m`,
fetched with the account token through an env-only credential helper. What
changed the ruling: the ledger (docs/LEDGER.md) genuinely needs history —
the escape hatch in the original decision — and its sidecar brings
git-spawning to the app anyway. What the store buys over the tarball: delta
fetches instead of a full re-download per push, **no repo size refusal**
(oversized blobs stay on the server until read), history for blame and the
ledger, and a real checkout materialisable for a future LSP. Reads stay
SHA-addressed (`cat-file`/`ls-tree`/`git grep` at the commit, never a
working tree), so consumers kept the snapshot's exact semantics. Trade
accepted: system `git` on PATH is now required for local repo features —
reads degrade to the network path without it.

- [x] **Layer 2 — consumption**: repo-scope search shipped in the PR search
      pane (`diff-search.tsx` + `lib/repo-search.ts`); the AI tool loop
      serves `list_files` / `read_file` / `grep_repo`; blob reads are
      local-first through `get_file_blob`. All store-served now.
- [ ] ⏸ **Layer 3 — symbol index** (tree-sitter): go-to-definition from the
      diff (peek popover → full-file modal at line), find references for a
      changed symbol. Index cached per SHA over store reads. **Only build if
      beta users live in `shift+v` / repo search** — unchanged gate. The
      LSP-grade upgrade (a language server over a detached worktree at the
      SHA) becomes possible with the store, but tree-sitter tags stay the
      v1 design (#249, which should target the store).

---

## 11. Distribution & adoption

### 11a. Opening PRs from GitHub/GitLab links — staged

**Raw `https://github.com/.../pull/N` links cannot be OS-hijacked** (you don't
own github.com). Options exist on a **complexity ladder** — climb only as users
prove the need.

| Stage | What | Slack click → app? | Build when |
| --- | --- | --- | --- |
| **1** | `mod+k` + resume + notifications | N/A — don't use Slack link | **v0.1** |
| **2** | Extension: "Open in Nod" on PR page | Browser → one click → app | Daily users |
| **3** | Interception + native messaging | Brief flash → app | Users ask for it |

**Stage 2 UX (good enough):** user clicks GitHub link in Slack → lands on GitHub
→ clicks **"Open in Nod"** (or toolbar) → app opens. One extra click, ~10%
of Stage 3 effort.

**Stage 3 UX (best for raw links):** click → brief browser flash → app. Only
worth it after validation.

- [ ] 🟡 **Link-open hydration** — when app opens from any source: cache-first
      paint, restore file/scroll/viewed.
      *Designed 2026-08-09:* [arriving from elsewhere](https://claude.ai/code/artifact/29efaa50-d5df-48e3-a023-953fa3e9f972) shows both cases.
      A seen PR restores instantly like a resume. A cold one gets **skeleton
      rows shaped like a diff, never a spinner**: this is the only path where
      nothing is cached, the app has no spinner language because it has never
      needed one, and a cold link is the first screen a new user may ever see.
      Rows say what is loading and hold the layout; a spinner says wait.
- [ ] ⏸ Stage 2 extension (content script + toolbar + context menu).
- [ ] ⏸ Stage 3 interception + native messaging.
- [ ] ⏸ Universal Links / wrapper domain.

### 11b. Auto-updates

- [x] 🟡 **Don't offer an install CTA on `.deb`/`.rpm`** — Tauri's updater can
      only self-update the Linux AppImage; it replaces a bundled `.tar.gz`, and
      there's no in-place update path for system packages. On `.deb`/`.rpm`
      installs, `check_for_update` still reports a newer version (it only
      compares `latest.json` against the running version), so today's
      "Restart & update" button appears and then fails or no-ops instead of
      updating. Detect the install format at startup (e.g. the `APPIMAGE` env
      var Tauri's AppImage runtime sets — absent on `.deb`/`.rpm`) and, when not
      running as an AppImage, swap `UpdatePrompt`'s CTA for a passive "New
      version available — reinstall the package to update" notice with no
      install button.
      *Shipped: `update.rs` reports `selfInstallable` (false when `APPIMAGE` is
      unset on Linux) and refuses `install_update` in that case; the card swaps
      to a notice linking nodreview.com/downloads.*
- [x] 🟢 **Update install failure on Linux** — user on 0.2.0 saw "Failed to
      install package" from the in-app updater ("You're on 0.2.0. Installs on
      the next restart..." then install fails). Likely the same AppImage vs.
      package-manager install-format mismatch as the item above; investigate.
      *Confirmed: "Failed to install package" is `PackageInstallFailed` from
      the plugin's `.deb` path (`pkexec dpkg -i`, then zenity/kdialog, then
      `sudo`), which no GUI session answers reliably. `latest.json` does carry
      `linux-x86_64-deb`, so the download was fine and only the privileged
      install failed. Fixed by the item above: that button no longer exists on
      a package install.*
- [ ] ⏸ Crash reporting — see [July 2026 batch · Sentry](#july-2026-batch).

> Linux does not use this updater. Only the AppImage can self-update, and
> [11d](#11d-linux-install--update-path-2026-07-25) rejects the AppImage as the
> recommended format — Linux updates come from the user's package manager
> instead.

### 11c. Commercial launch

Full plan in [`docs/RELEASING.md` — Commercial launch](./RELEASING.md#commercial-launch).

**Philosophy:** no license keys. GitHub identity is the license. Browser-brokered
activation (`nod://purchase?token=…`) — Raycast-style **Open Nod** after
checkout. One Cloudflare Worker; MoR (Polar / Paddle / Lemon Squeezy) for
payments and tax.

**Release gate (Phase 0 — free beta):** the build gate itself is satisfied (see
[Decisions § product position](#product-position)); what is *not* satisfied is
the evidence behind it. Do not build MoR / Worker / license code until five
external developers have used the app for one week and retention is plausible.

**2026-07-18:** Started the license-server (Pages Functions) skeleton ahead
of this gate — owner call, logged here rather than silently checking off
`Release gate` items that aren't actually done (`Perf budget met` still has
an open item: production-build perf e2e). Landing page (§0) and MoR account
+ real secrets are still gated as written.

| Phase | What | When |
| --- | --- | --- |
| **0** | Domain + static landing page (video, GitHub release downloads). No payments. | After release gate |
| **1** | MoR + Worker + in-app trial/gating + notarization | Retention proven (~1 week eng.) |

- [ ] 🟡 **Phase 0** — landing page on custom domain (~$15/yr).
- [ ] 🔴 **Phase 1** — Apple notarization (hard prerequisite; drop `xattr` docs).
- [ ] 🔴 **Phase 1** — MoR product + checkout linked to GitHub identity.
- [ ] ⏸ `nod-keygen` CLI for manual/support grants.

#### 11c status — what actually exists (audited 2026-07-30, updated 2026-08-02)

**2026-08-02 update — the purchase flow is now code-complete** (PRs #123,
#125, #129, #133, #138, #140, #143): repeat purchases extend the term;
`/activate` is a success page with a 48-hour window, zero-click loopback
push (port 8766, PNA preflight handled) and a `nod://purchase` deep
link the app registers; the desktop app verifies tokens offline
(`ed25519-dalek`, cross-stack fixture tests), runs the free unlimited
evaluation (nothing licensing-visible for 30 days, then a dismissable
purchase card; reframed same day from a "trial" — countdown badge removed),
and gates updates on `updates_until`; the landing page states $39 / a year
of updates with the buy button env-gated until checkout exists. Licensing:
source-available under FSL-1.1-Apache-2.0 (root LICENSE.md). **Still blocked on live
accounts:** Polar (verify `metadata.subject` + success-URL param, set
`POLAR_WEBHOOK_SECRET`), the Ed25519 keypair (`LICENSE_SIGNING_SEED`
secret / `NOD_LICENSE_PUBKEY` + `NOD_CHECKOUT_URL` in release builds,
`PUBLIC_CHECKOUT_URL` on the site), forge identity at checkout
(success-page OAuth — nothing puts `metadata.subject` on orders yet),
`/restore` (needs `POLAR_API_KEY`), and Apple notarization. Evaluation/price
decisions are recorded in
[RELEASING.md](./RELEASING.md#product-decision-evaluation-model-and-price-2026-08-02-reframed-same-day).

The 2026-07-30 audit below is kept for history — its "missing entirely"
list is what the update above closed.

Short version then: **the server skeleton is real, the purchase flow is not.** Nothing
can be bought today, and the desktop app contains no licensing code at all.

*Built and merged* (`apps/web/functions/`): `purchase-webhook.ts` (Standard
Webhooks verify → `putLicense`/`putOrderIndex`, 1-year term), `activate.ts`,
`license/[subject].ts`, and `lib/license-token.ts` — real Ed25519 sign/verify
with unit tests. `wrangler.jsonc` carries real KV namespace ids.

*Skeleton or stub:* `restore.ts` returns a hardcoded `501 not yet configured`.
`lib/polar.ts` verifies the HMAC correctly but its `metadata.subject` shape is
an **unverified assumption** against a live Polar payload — its own file header
says so.

*Missing entirely — these are the links that make it a purchase flow.*
**Four of the seven closed on 2026-08-02; the boxes are ticked in place so the
audit still reads as a snapshot. What remains is exactly the "blocked on live
accounts" list in the 2026-08-02 update above — all of it external setup, none
of it code.*

- [ ] 🔴 **No MoR account, product, or checkout URL.** Nothing initiates a
      purchase; Polar is a signature format here, not an integration.
      *Still open — this is the gating one.*
- [ ] 🔴 **No forge identity at checkout** — nothing puts `metadata.subject` on
      the order, so the webhook has nothing to key a license to. Needs a
      success page doing GitHub OAuth. GitLab (and self-hosted) unsolved.
- [ ] 🔴 **Cloudflare secrets never set** (`POLAR_WEBHOOK_SECRET`,
      `LICENSE_SIGNING_SEED`) — the endpoints cannot run in production even
      though the KV namespaces exist.
- [ ] 🟢 **`/restore` is a stub** — needs `POLAR_API_KEY`. *Still open,
      dependent on the MoR account above.*

The landing page (`apps/web/src/pages/index.astro`) is downloads-only and says
"Free while it's an experiment." No pricing, no buy button, no `/pricing` route
— which is consistent with Phase 0, so this is a gap in fact, not in plan.

**Rejected:** deterministic license keys (stateless, simple engineering, ugly UX —
conflicts with zero-friction product goal).

#### Pricing — what a license buys (2026-08-05)

> **Merge note:** PR #203 adds a top-level **"Pricing and licensing
> (2026-08-05)"** section covering the $39 → $59 raise, the team tier and the
> renewal-SKU caveat. This branch is cut from `main` and does not contain it,
> so the two will land as separate sections. **Fold this one into that one on
> merge** — it answers a question #203 leaves open ("if nothing is gated, what
> does buying *feel* like?") rather than restating it, and they should read as
> one decision.

**Decided (owner): recognition, not capability. Nothing in the app is ever
gated.** The standing price is **$59** (PR #203) for a perpetual license plus
one year of updates; the app never stops working, licensed or not.

The question this settles: if an unlicensed copy keeps working forever, buying
needs to *feel* like it grants something, and the tempting answer is to gate a
delighter — themes, a Superhuman-style inbox-zero flourish. **Rejected**, on
three grounds:

1. **It would make the public copy false.** PR #203 ships the words *"no
   feature gating"* and *"buy it once and the app is yours permanently"*. A
   padlock in the theme picker two releases later is exactly the drift users
   remember.
2. **It contradicts the position we just wrote down.** [AI.md
   § Position](./AI.md#position-2026-08-05) sells "a tool you own, not a seat
   you rent". Gating cosmetics makes it a seat that comes with cosmetics.
3. **The first gate is never the last.** Every future delighter would inherit
   the question, and each answer builds more entitlement surface — which is how
   a no-DRM product acquires DRM one reasonable step at a time.

**What carries the feeling instead:** the purchase card disappearing is already
a real reward, and buyers get **acknowledgment** — a quiet supporter mark in
settings/about. Recognition costs no entitlement check, can't degrade anyone's
app, and doesn't rot if the license lapses.

- [ ] 🟢 **Supporter acknowledgment** — a quiet licensed-user mark in
      settings/about. Deliberately cosmetic and deliberately *additive*: it
      must never read as "unlicensed users are missing something", which is the
      gate this decision refused wearing a different hat.

*Consequence for the roadmap:* any future item proposing a licensed-only
feature is off-position by default and needs this decision reversed first, not
an exception carved. The one thing a license legitimately controls stays
`updates_until` in the **updater**, exactly as
[RELEASING.md](./RELEASING.md#commercial-launch) specifies.

#### Evaluation and the update gate (audited 2026-08-05)

*What ships on `main` today, verified in code — none of it released yet
(v0.4.0 predates the licensing PRs, so no user has reached day 31).*
`get_license_state` returns `Trial{days_left}` for 30 days, then
`TrialExpired`; `PurchasePrompt` renders **nothing** until expiry, then a
dismissable card once per launch. The app never locks — correct, and
on-position.

**Gating updates is confirmed as the right lever (owner, 2026-08-05)** — it is
not a feature gate, it is the thing the license actually sells, so it sits
squarely inside the "recognition, not capability" decision above. Two defects
in *how* it does it:

- [ ] 🔴 **Pre-release blocker: the Buy button can't work.** `NOD_CHECKOUT_URL`
      is a compile-time `option_env!` (`activation.rs:43`) and **the repo
      variable is not set** (`NOD_LICENSE_PUBKEY` is). So `activate_license`
      returns *"Purchasing isn't configured in this build."* before opening a
      browser, and `PurchasePrompt` renders regardless of whether checkout
      exists — the user only discovers this **after** clicking Buy. Harmless
      today because it is unreleased; the moment a release is cut, every
      install starts a 30-day fuse ending in a dead button. **Fix before
      tagging:** set `NOD_CHECKOUT_URL` (needs the Polar product — the gating
      item above), *and* have the card not render when checkout is
      unconfigured, so a half-configured build stays quiet instead of nagging
      toward an error.
- [ ] 🟡 **Let patch releases through to unlicensed users** — *decided
      2026-08-05 (owner).* `update_allowed` (`update.rs:39`) is all-or-nothing:
      `TrialExpired => false`. Change it so a **patch** bump installs
      (0.4.0 → 0.4.1) while a **feature** release does not (0.4.x → 0.5.0).
      Fixes and security patches then reach everyone, which matters because the
      app holds forge OAuth tokens and there is **no other channel** to a
      stranded evaluator — the Linux "Failed to install package" bug in
      [11b](#11b-auto-updates) is exactly the shape of thing that must not
      become permanent for someone. New features stay what a license buys.
      `check_for_update` already has both the version and `pub_date`, so the
      comparison needs no new data.
      *Build note — the incentive is currently invisible.* `update-prompt.tsx:84`
      returns `null` for an ineligible update in `trialExpired` (deliberately:
      two cards selling one license would race). Sound, but it means a withheld
      feature release is **never mentioned** — the user silently falls behind
      and is never told why, so today's freeze costs staleness and buys no
      pressure at all. Once patches flow, have `PurchasePrompt` name the
      version it is holding back ("0.5.0 is out — a license unlocks it")
      instead of adding a second card.
- [x] 🟢 **Evaluation window 14 → 30 days** — *decided 2026-08-05 (owner),
      shipped 2026-08-09.* `TRIAL_DAYS` (`license.rs`) is now 30, and the
      docs that quoted 14 days say 30. Review tools are used in bursts: someone
      who installs, uses Nod for one sprint and then gets pulled elsewhere has
      barely started evaluating by day 14. 30 days covers at least two review
      cycles and costs nothing, since the app never locks either way.
      *Considered and not taken:* counting **active** days rather than calendar
      days — fairer still, but it needs a launch counter instead of the single
      first-launch timestamp. Revisit if 30 calendar days proves too short.
- [x] 🟢 ~~**Fix the "Sublime-style" comment**~~ — reworded to describe what
      the code does: never gated, never locks, and a licence buys updates.
      *One correction to this item's own wording:* it proposed "patches
      always, features on a license", but the updater gates **every** release
      on `updates_until`, patches included (`update.rs`), and nothing is ever
      gated on a licence. Writing that would have made the comment wrong in
      the other direction, so the new text says the gate is currently total
      and points at the still-open patch-release item above rather than
      claiming it.

### 11d. Linux install & update path (2026-07-25)

**Trigger:** updating a v0.3.x install to v0.4.0 on Arch took ~15 minutes of
manual work — the binary was a bare `nod` symlink with no `--version` and no
metadata, the repo had to be found by `strings`-scanning the binary, and the
`.deb` had to be unpacked by hand (`ar x` + `tar -xzf`) because Arch has no
`dpkg`. None of that is the user's fault: we ship four Linux assets with no
guidance and only one of them can ever update itself.

**Decision: native packages are the Linux path. The AppImage is a fallback, not
the recommendation.** The AppImage is the only format Tauri's updater can replace
in place, which makes it tempting — but it loses on the two things this product
sells. Performance: it runs from a squashfs image mounted over FUSE, so cold
start pays mount + decompression and the shared libraries never hit the normal
page cache the way an installed binary does; on Wayland it additionally needs the
LD_PRELOAD EGL wrapper (see PR #15). Integration: no `.desktop` entry, no icon in
the launcher, no MIME/scheme registration for `nod://`
([11a](#11a-opening-prs-from-githubgitlab-links--staged) depends on this) unless
the user separately installs AppImageLauncher. The `.deb`/`.rpm` install gets all
of that from the packaging system for free. Trading measurable startup cost and
desktop integration for updater convenience is the wrong trade for Nod.

**What that means concretely:** we stop trying to self-update on Linux and let
the package manager do it. `apt` / `pacman` / `dnf` / `flatpak` all already
update installed software on a schedule the user has opted into — that is both
the standard and the smoothest possible UX, since there is no Nod-specific step
at all.

**The good news — this is a metadata problem, not a packaging problem.** Every
release already publishes `Nod_<v>_amd64.deb` and `Nod-<v>-1.x86_64.rpm`
(`targets: "all"`, verified on v0.4.0). An apt or dnf repo is just an index over
artifacts that already exist; AUR needs no hosting from us whatsoever. Nothing
below requires changing how the app is built.

**Tier 0 — do now (docs + one flag, no infrastructure)**

- [ ] 🔴 **`nod --version` / `--help`** — an installed binary must be able to
      describe itself. Print version, detected install format (system package vs
      AppImage vs unmanaged copy) and the exact upgrade command for that format.
      This alone removes most of the discovery cost that triggered this section.
- [ ] 🟡 **Format-aware update notice** — supersedes the passive notice queued in
      [11b](#11b-auto-updates): on package installs, don't just suppress the CTA,
      show the copy-pasteable command for the detected package manager
      (`sudo apt upgrade nod`, `yay -Syu nod-bin`, `sudo dnf upgrade nod`).

**Tier 1 — the package repos (this is the actual fix)**

- [ ] 🔴 **AUR `nod-bin`** — start here: no hosting, no signing key, covers
      Arch/Manjaro/EndeavourOS, and it fixes the maintainer's own machine, which
      is the dogfood case. A PKGBUILD that pulls the release `.deb`/tarball plus
      a CI job bumping `pkgver` + `sha256` on tag — same shape as the existing
      `update-tap` job in `release.yml`, so the pattern is proven. Users then get
      updates from `yay -Syu` with zero Nod-specific steps.
- [ ] 🔴 **APT repo** — biggest coverage win (Debian/Ubuntu/Mint/Pop/elementary).
      `aptly` or `reprepro` in CI generating a signed `dists/stable/…` tree,
      hosted on GitHub Pages (or the Phase 0 domain once it exists). Users add
      the repo once and `apt upgrade` carries them forever. ~half a day. Adds a
      long-lived GPG signing key that needs the same backup discipline as the
      minisign key (see the `release.yml` header) — note the existing `.deb.sig`
      is a *minisign updater* signature and does **not** satisfy apt.
- [ ] 🟡 **DNF/YUM repo** — `createrepo_c` over the existing `.rpm` on the same
      host as the apt repo; covers Fedora/RHEL/openSUSE. Cheap once the apt repo
      and GPG key exist, so do it in the same pass. Fedora COPR is the
      alternative if we'd rather not host metadata.
- [ ] 🟢 **`install.sh` one-liner** — `curl -fsSL https://…/install.sh | sh` that
      detects distro + arch and *wires up the right repo* (adds the apt/dnf
      source, or points Arch users at the AUR) rather than dropping a loose
      binary. Convenience wrapper over Tier 1, worth nothing before it exists —
      a one-liner that installs an unmanaged binary recreates the exact dead end
      that triggered this section.

**Tier 2 — Flatpak / Flathub (defer, and verify the perf claim first)**

- [ ] ⏸ **Flatpak + Flathub** — covers immutable and everything-else distros
      (Silverblue, SteamOS, Bazzite) and updates via GNOME Software / KDE
      Discover with no maintenance from us. Not a cold-start regression the way
      AppImage is — it's a real installed tree with a `.desktop` entry, not a
      FUSE mount. Two open questions before committing: (1) **WebKitGTK comes
      from the Flatpak runtime, not the host** — given the WebKitGTK performance
      gap noted in [Performance architecture](#performance-architecture--decisions-queued-2026-07-05),
      pinning a newer runtime could be a *win*, but it must be benchmarked
      against a `.deb` install, not assumed; (2) sandbox holes for what Nod needs
      — secret-service (token keychain), browser-open for OAuth, `nod://`
      registration — plus the updater plugin disabled in that build. Take it once
      Linux users exist in number, consistent with the dogfood-first gate in
      [11c](#11c-commercial-launch).

**Order:** Tier 0 now (docs, a flag, and the notice already queued in 11b) → AUR
(no infrastructure, fixes our own machine) → APT + DNF repos in one pass, sharing
the GPG key → `install.sh` on top → Flathub only after the release gate, and only
if it benchmarks at parity with `.deb`.

**Rejected:** AppImage as the recommended Linux format — self-updating is not
worth the cold-start cost, the missing desktop entry, or the lost `nod://`
registration. It stays published as a portable escape hatch, and it stays the
only format the in-app updater touches.

---

## July 2026 batch

> Ship via the [split-pr skill](../.claude/skills/split-pr/SKILL.md) — one intent
> per PR, ~300-line soft budget, `pnpm check` / tests / knip green (+ e2e and UI
> evidence for UI changes; `cargo test` when `src-tauri/` changes).

### Wave 1 — bug fixes

- [ ] 🟢 **P01** — GitHub OAuth on Windows opens Documents
      folder instead of the browser (`tauri_plugin_opener::open_url`).
- [ ] 🟢 **GitHub org OAuth restrictions** — `[nod] API error 403` when an org
      (e.g. Decodo) enables OAuth App access restrictions; surface a clear
      in-app message with the GitHub docs link and what the admin must allow.
      *Diagnosis (2026-07-30).* The message is built in `http.rs` as
      `API error ({status}): {msg}` where `msg` is GitHub's own `message`
      field — so the restriction sentence **already survives** on REST paths;
      what is missing is classification and guidance, not data. Two gaps:
      the REST path discards `documentation_url`, and the **inbox does not
      use that path at all** — GraphQL errors are built separately in
      `graphql_vars` (`platform/github.rs`) as `GitHub GraphQL error
      ({status}): {text}`, so any fix must be mirrored there or the inbox
      keeps showing the raw string.
      *Recommendation:* classify 403 in one place — restriction (body
      contains `has enabled OAuth App access restrictions`) vs rate limit
      (`x-ratelimit-remaining: 0`) vs everything else — and return curated
      copy naming the org, what an admin must approve, and the docs link.
      Render in the existing inbox error block
      (`inbox.tsx`, "Couldn't load pull requests"), which already has a
      Retry button.
      *Blocker for the e2e:* `e2e/bridge.ts` has **no way to make a command
      reject** — `AppOptions` needs an `inboxError?: string` knob (~10 lines)
      before the error branch can be covered at all. Worth adding regardless;
      the inbox error state is currently untested.

### Wave 3 — review surfaces

- [ ] 🟡 **Render SVG previews** — SVG files in diffs show raw markup instead
      of a rendered image preview.
- [ ] 🟡 **Per-check list in the drawer** — P09 follow-up: `CiPill` links out
      to the host's checks page; list the individual checks inline instead.
- [ ] 🟢 **File tooltip positioning** — the file-path tooltip is centered on
      the row; consider anchoring it near the filename's end instead (keep
      the large click target).

### Wave 4 — desktop shell

- [ ] 🔴 **P13** — Custom title bar for Linux & Windows
      (frameless + Quiet drag region + window controls).

### Wave 5 — bigger bets

- [ ] 🟡 **Keyboard navigation inside the file tree** — the accepted known
      limitation from P15: `r`/`t`/`Tab`/`e` walk the **flat** file order, so
      the tree is mouse-only and folders can't be collapsed from the keyboard
      in a keyboard-first app. Carries the collapsed-folder question above, and
      its recommended answer (stay in the cycle, auto-expand on arrival) —
      which is decided enough to build against. Note `revealInList` is a
      ref-callback, so a row inside a collapsed folder never fires it; arriving
      at a hidden file **must** expand its folder or the selection lands
      nowhere.
- [ ] 🟡 **P16** — Faster inbox via conditional polling
      (ETag/304 → ~15 s interval); optional activity-aware detail refresh (see
      also §7 GitHub notifications gate).
- [ ] 🟡 **P17** — Apply a suggestion as a commit — **GitLab only.**
      *Decided 2026-08-05 (owner), and the GitHub half is dropped rather than
      deferred.* GitLab exposes a real apply-suggestion endpoint: one call, the
      host authors the commit, no file content ever passes through Nod. GitHub
      has no equivalent — the only path is read the file, splice the lines,
      `PUT` a commit through the contents API, which makes **Nod** the author
      of spliced content, can clobber a concurrent push (blind write against a
      SHA that may have moved), and is a far bigger promise than the app's
      write surface has ever made. Ship the honest half; re-open the GitHub
      path only if users actually ask, and treat it as its own 🔴 decision.
      *Downgraded 🔴 → 🟡:* the GitLab-only scope is one endpoint plus a
      confirm, not the two-host build the original sizing assumed.

### Anytime — hygiene & design

- [x] 🟢 ~~**P19** — Rust line-comment sweep~~ — done, and the count in this
      item was long stale: four `//` prose comments remained, not ~25, the
      rest having gone with the modules they lived in. Three labelled the
      library-path candidates in `lib.rs` and moved into that function's `///`
      doc, which names the three distro layouts in probe order. The fourth
      explained an assertion in `gitlab_tests.rs` and became the assertion's
      own failure message, so it now reads out of a failing test rather than
      only out of the source. The only `//` left in the backend is inside a
      string literal.
- [ ] 🟡 **P20** — Rich text editor design polish
      (composer + info-drawer form; visual-only). *Partially shipped with the
      composer cleanup PR: suggestion tool only renders with line context,
      footer hint deduped (⌘↵ chip on the button is the single source), drawer
      composer collapses to a prompt. The toolbar is now the familiar icon
      strip (B/I/code/link) with hotkeys in hover tooltips — the app-wide
      Tooltip + Kbd language — after "our hint-bar reads unfamiliar" feedback;
      Suggestion keeps its text label. Remaining: typography/spacing polish of
      the editor surface itself.*
- [ ] 🟡 **P21** — Drag over code expands the fat cursor
      (*was: "multi-line selection box via drag", deferred as a second gesture
      duplicating gutter-drag; re-scoped 2026-07-27*). Don't build a selection
      box — give the drag people already make a second meaning: a **native**
      cross-line text selection also grows the `shift+j/k` line range over the
      rows it covers, so the same drag copies text and arms `c`. That answers
      the discoverability concern the original deferral traded down to, since
      there is no new affordance to learn.
      *Why it's now cheap:* the gesture is unclaimed. A cross-line selection
      already fails `specFromDomSelection` (its `commonAncestorContainer`
      escapes `.qf-code` the moment two rows are involved), so occurrence
      highlighting never applied to it. Probe on 2026-07-27: dragging across
      three rows leaves a live browser selection, 0 occurrence marks and 0
      range rows — nothing to displace.
      *Boundary to decide first:* cross-line ⇒ range, single-line ⇒ mark
      occurrences (the drag-select bug in the effect audit below owns that
      half, and is a prerequisite: that half is broken today). They must differ,
      because a one-line range is already `c` on the cursor — so the split is
      free, but a drag intended as a one-line range will surprise until the
      gutter affordance is what people reach for there.
      *Record the outcome in P22*, which owns the selection-vs-focus
      convention this gesture now has two of.
- [ ] 🟢 **P22** — Selection-model audit + refactor (DESIGN.md
      "Selection vs. focus"): sweep **every** focus site against the
      documented convention — all `tabIndex` / `.focus()` / `blur()` call
      sites, `:focus` styles in `quiet.css`, and Tab handling in overlays —
      and classify each as selection-model, focus-model, or violation. Known
      violations: list rows are focusable in inbox rows, file sidebar, review
      list, and search-pane hits — make them non-focusable (drop row
      `tabIndex`, `aria-activedescendant` on containers) and delete the three
      tactical `blur()` calls (`pr-list-item.tsx`, `file-sidebar.tsx`,
      `right-panel.tsx`). Known conformant (leave alone): dialog/drawer
      containers with `tabIndex={-1}` for programmatic focus, the
      `q-focus`/`qf-focusable` ring on real controls, and the
      watch-repos-dialog Tab-arms pattern. Supersedes the P02 blur fixes.
- [ ] 🟡 **useEffect migration** — full audit below; prioritize quick wins
      (dead/redundant effects) then query adoption. Candidate #2 (bootstrap
      viewed map) shipped on main.

### Keyboard, focus & composer UX

- [ ] 🟡 **Comment-now vs add-to-review UX** — remember last choice between
      "comment now" and "add to review", or replace tabs with two explicit
      buttons if that reads clearer.
- [ ] 🟡 **Hover cursors** — cursor should change over interactive regions
      (gutter, threads, links); audit against editor-like affordances elsewhere
      in the app.
- [ ] 🟡 **Reply in Info tab** — thread reply from the info drawer, not just
      read-only PR-level comments there today.

### Inbox & activity semantics

- [ ] 🟡 **Own mutations shouldn't re-activate inbox** — commenting or submitting
      a review bumps the PR in the inbox as if new external activity arrived;
      suppress or de-prioritize self-authored updates.

### Tooling, observability & investigation

- [ ] 🟡 **Sentry** — error reporting for production builds (§11b crash reporting).
- [ ] ⏸ **Whole-repo context index** — investigate local code index for search /
      navigation / future AI features; aligns with §9 repo snapshot layers 2–3
      (ripgrep search now, tree-sitter symbols later — no embeddings/LLM unless
      users ask).
- [ ] ⏸ **File/code autocomplete in comments** — `@file` / path completion in
      the composer; depends on §9 snapshot or live blob access.
- [ ] 🟡 **WKWebView layout-contract suite** — a small native lane that mounts
      the real system webview and asserts geometry for the layout primitives
      the app depends on (scroll roots, flex children of auto-height panels,
      fixed overlays, input focus), instead of duplicating e2e there. Every
      engine divergence found in the wild gets promoted into the suite — the
      fixture provenance rule, applied to engines. Contract #1: the
      `flex-basis: 0%` collapse from 75a7f4a (Playwright's WebKit follows the
      spec fallback, WKWebView does not, so the harness engines cannot catch
      this class). On failure, save a screenshot plus computed bounding boxes.
      **Asymmetric matrix** (hosted CI offers only recent macOS images):
      hosted webkit lane on every PR; one self-hosted machine on the oldest
      supported macOS (a used Mac mini) runs the native suite nightly and as
      a release gate, serialized, app + test data reset between jobs. Each
      result records macOS version, WKWebView/WebKit build, Xcode version,
      and app build — the invariant is "every supported system WebKit passes
      before release", not equal cadence. **Fail closed:** if the old
      machine is unavailable, the release gate fails; the recent hosted
      runner never silently counts as coverage. Origin: r/Playwright thread
      on the flex-collapse blog post (2026-08-17).

---

## useEffect audit and migration plan

Audit of every `useEffect` / `useLayoutEffect` call site in `src/`, classified per
[You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect).
Planning only — check items off as they ship.

Stack context relevant to the suggestions: React 19 (with `useEffectEvent`,
already used in `keyboard-provider.tsx`), React Compiler enabled,
`@tanstack/react-query` v5 (shared `queryClient` + `queryKeys`), `zustand` v5,
`react-virtuoso`, Tauri 2 IPC (`api.*`).

### Tally

| Verdict | Count |
|---|---|
| Justified (external system sync: DOM, timers, focus, subscriptions, imperative APIs) | 36 |
| Migratable | 13 |
| Removable / dead or redundant | 2 |
| **Total** | **51** |

### Migration candidates (prioritized)

| # | Location | Problem | Suggested fix | Effort |
|---|---|---|---|---|
| 1 | ~~`hooks/use-token-gate.ts:80`~~ | ~~Manual fetch of OAuth config into `useState`, no race guard~~ | ~~Two `useQuery` calls with `staleTime: Infinity`; delete both `useState`s~~ | Low · **done** (two `useQuery` calls, no `useState`) |
| 2 | ~~`hooks/use-viewed.ts:14`~~ | ~~One-time app-init load of viewed map inside a hook~~ | ~~Run at bootstrap (`main.tsx` or next to the store)~~ | Low · **done** |
| 3 | ~~`components/review/review-screen.tsx:2191`~~ | ~~Sets `activeThreadRef.current = null` on mount; ref already initializes to `null`~~ | ~~Delete the effect~~ | Low · **done** (effect no longer present) |
| 4 | ~~`components/review/review-screen.tsx:2280`~~ | ~~Manual "latest ref" `useLayoutEffect` for `selectLine`, duplicated by `useLatest(selectLine)` on the next line~~ | ~~Delete the layout effect + `selectLineRef`~~ — **won't do**: there is no duplicate `useLatest(selectLine)`. `selectLineRef` is created empty *before* `useReviewFind` and filled after, but `selectLine` reads `findOpenRef` (a `useReviewFind` output) — a genuine init cycle `useLatest` can't express. The empty-ref-then-fill layout effect is required. | Low-Med |
| 5 | ~~`keyboard/use-hotkeys.ts:23`~~ | ~~Manual latest-ref effect (`ref.current = bindings` every render)~~ | ~~`const getBindings = useEffectEvent(() => bindings)`~~ — **won't do**: the source getter is called during render by the command palette (`command-palette.tsx:87`) and help overlay (`help-overlay.tsx:94`) to enumerate bindings; `useEffectEvent` throws when invoked outside an effect/event, so the ref is required. | Low |
| 6 | `hooks/use-inbox.ts:13` + `hooks/use-subscribed.ts:13` + `hooks/use-pull-request-detail.ts:23` | Disk-cache seeding of the query cache bolted onto component mounts; races the network fetch, re-runs per consumer | Hydrate once at app bootstrap (or adopt TanStack Query's persister). For PR detail, reuse the seeding logic already in `prefetchPullRequest` and call it from the navigation event | Med |
| 7 | `app.tsx:92` | Bootstrap fetch (`hasToken`, `listAccounts`) with `.then` chains, imperative `setRoute` | Model as `useQuery`s (or module-level init in `main.tsx`) and derive the initial route from query state | Med |
| 8 | `components/inbox/watch-repos-dialog.tsx:219` | Hand-rolled debounced repo search with manual `requestSeq` race protection | `useDebouncedValue` + `useQuery({ queryKey: ["repoSearch", q], enabled: q.length >= 2, placeholderData: keepPreviousData })`; map `searching` to `isFetching`/`isPlaceholderData` | Med |
| 9 | `components/inbox/inbox.tsx:270` (+ cleanup at 273) | Mirrors render-derived `paneVisible` into zustand one render late | Let consumers derive it from the shared query + selection (small `useInboxPaneVisible()` hook), or move selection into the store and make it a selector; the 273 cleanup effect then disappears | Med |
| 10 | `hooks/use-viewed-file-reconcile.ts:46` | Chained state-in-effect (`lastReconcileKey` dedupe + `setChangedSinceViewed`); only the toast is a real side effect | setState-during-render "previous key" pattern for the dedupe/derived set; keep a minimal effect for the toast. Consider merging with the effect at line 68 (same key) | Med |
| 11 | `components/review/comment-thread.tsx:40` | Parent command (`ReplyRequest` nonce object) converted to state in an effect | Imperative handle registry keyed by `rootId` that the parent calls from its event handler; removes the nonce + rAF machinery. Borderline: virtuoso row mount/unmount is why the nonce pattern exists | Med |
| 12 | ~~`components/review-notifier.tsx:71`~~ | ~~Diff-on-data-arrival effect (known-set compare, localStorage persist, toast)~~ | **Done** — detection is pure (`lib/notification-events.ts`) and memory lives in a persisted log (`store/notification-store.ts`); the notifier holds no keys, no diff and no persistence. The query-cache subscriber was tried and reverted: the cache notifies synchronously, so ingesting from it lands a store write on the notification list mid-render. A commit-phase effect is the right seam, and `ingest` being idempotent makes a double run harmless | — |
| 13 | `hooks/use-inbox-detail-nudge.ts:18` | Cross-cache invalidation on data arrival, ref-based dedupe | Optional: query-cache subscriber registered once at bootstrap (would cover all stale details, not just the open one). Acceptable as a component effect; at minimum narrow deps to `pr?.updatedAt` | Med |

### Justified usages

These synchronize with external systems (DOM events, native `<dialog>`, timers,
focus, scroll, query/zustand stores, Tauri, perf instrumentation) and should stay
as effects. Minor hardening notes included where useful.

#### App shell and keyboard

| Location | What it does | Notes |
|---|---|---|
| `app.tsx:54` | 8s toast auto-dismiss timer with cleanup | Same pattern as `review-notifier.tsx:118`; extract a shared `useTimeout`/`useAutoDismiss` hook |
| `app.tsx:64` | Applies persisted zoom to the document on mount | Could move to module init in `main.tsx` to avoid a flash of unzoomed UI |
| `app.tsx:71` | Capturing window scroll listener toggling `is-scrolling` classes | Per-element debounce timers are not cleared on unmount (benign at app root) |
| `keyboard/keyboard-provider.tsx:302` | Global `keydown` listener paired with `useEffectEvent` (line 275) | Idiomatic React 19 pattern, model for the rest of the codebase |
| `keyboard/use-hotkeys.ts:27` | Registers binding source / pushes scope with symmetric cleanup | Deps correct; stays even after candidate #5 collapses line 23 into it |

#### Dialogs, focus, and inputs

| Location | What it does | Notes |
|---|---|---|
| `hooks/use-modal-dialog.ts:7` | `dialog.showModal()` on mount | Close-on-unmount deliberately omitted (React removal closes it; explicit `close()` misfires under StrictMode) — doc comment now explains this |
| `components/command-palette.tsx:105` | rAF focus of input on mount | See "focus dedup" note below |
| `components/command-palette.tsx:109` | Scrolls active row into view on `activeIndex` change | Could use a ref on the active row instead of `querySelector` |
| `components/token-gate.tsx:185` | rAF focus of host input on panel mount | `autoFocus` would likely suffice (not a dialog/portal) |
| `components/token-gate.tsx:328` | rAF focus of token input on panel mount | Same as above |
| `components/issue-tracker-dialog.tsx:54` | rAF focus of URL input on dialog mount | See "focus dedup" note below |
| `components/inbox/watch-repos-dialog.tsx:209` | rAF focus after `showModal()` | Cancel the rAF in cleanup |
| `components/inbox/search-pane.tsx:114` | rAF focus after `showModal()` | Could be folded into `useModalDialog` |
| `components/review/pr-search.tsx:205` | rAF focus of search input on mount | Cancel the rAF in cleanup; or `autoFocus` |
| `components/review/right-panel.tsx:65` | Focus panel on open, blur/restore on close | Correct as-is |
| `components/review-notifier.tsx:126` | Saves/restores `document.activeElement` around toast | Correct save/restore with `isConnected` guard |
| `components/review-notifier.tsx:150` | `<dialog>.show()`/`.close()` for toast card | Could merge with the 126 effect (same dependency and lifetime) |

Focus dedup: the rAF-focus-on-mount effect is duplicated 5x
(`command-palette:105`, `token-gate:185/328`, `issue-tracker-dialog:54`,
`pr-search:205`, plus the two dialog variants). All individually justified, but a
shared `useAutoFocus(ref)` hook, or the native `autoFocus` attribute where no
`<dialog>`/portal is involved, would remove them wholesale.

#### Timers and instrumentation

| Location | What it does | Notes |
|---|---|---|
| `components/review-notifier.tsx:118` | 12s toast auto-dismiss timer | Shared hook candidate with `app.tsx:54` |
| `components/markdown.tsx:89` | Unmount cleanup of copy-feedback timer set in the `onCopy` handler | Handler-owned state change is already correct; effect is cleanup-only |
| `components/review/review-screen.tsx:3211` | Same copy-timer unmount cleanup in `BranchChip` | Same pattern as `markdown.tsx:89` |
| `components/review/review-screen.tsx:2314` | Post-paint perf mark (`completeFile()`) via rAF on mount | rAF not cancelled on unmount; harmless but tidier with cleanup |
| `components/review/review-screen.tsx:2429` | Centralized unmount cleanup of all screen-level timers/rAF refs | Correct |

#### Data-driven sync (no user event exists)

| Location | What it does | Notes |
|---|---|---|
| `hooks/use-review-head-sha-sync.ts:14` | Perf mark + review-memory write + "PR updated" toast on headSha change | Depend on `pr?.headSha` instead of whole `pr` |
| `hooks/use-viewed-file-reconcile.ts:68` | Writes reconciled viewed-map into zustand when headSha changes | Borderline; merge with the line-46 effect (candidate #10) and narrow deps |

#### DOM measurement, scroll, and caches

| Location | What it does | Notes |
|---|---|---|
| `components/inbox/inbox.tsx:251` | Scrolls selected row into view on `selectedIndex` change | Selection changes from multiple sources; effect centralizes the scroll |
| `components/inbox/inbox.tsx:258` | 180ms debounced prefetch of selected PR + neighbors | Cleanup correct; `prefetchQuery` dedupes retriggering |
| `components/review/review-list.tsx:927` | Measures mono column width (rAF + `document.fonts.ready`), module-level cache | Could be `useLayoutEffect` to avoid a one-frame unmeasured paint |
| `components/review/review-screen.tsx:775` (`useOccurrenceTracking`) | `selectionchange` + `click` document listeners for occurrence highlighting | Canonical subscription with full cleanup — but see the drag-select bug below: the click handler cancels the pending `selectionchange` commit unconditionally |
| `components/review/review-screen.tsx:886` (`useOccLinkAffordance`) | mod-key + pointer listeners painting the mod+click affordance via `CSS.highlights` | Correct — external browser API, no React state, rAF-coalesced repaint on click/scroll because a repainted row collapses the Range |
| `components/review/review-screen.tsx:1137` | rAF loop restoring virtuoso scroll position on mount | Correct |
| `components/review/review-screen.tsx:2287` | Warms the highlight cache with cancel cleanup | `[filesForHighlightRef]` dep is cosmetic; if `detail` can resolve after mount, key on `detail?.files` |
| `components/review/review-screen.tsx:3130` (`occRestoreRef` restore) | `useLayoutEffect` restoring a captured DOM selection pre-paint | **Verified dead** — see "Drag-select over code never marks occurrences" below. Keying it on `[occSpec]` is necessary but not sufficient; the commit that would give it something to restore never fires |

### Dead or buggy effects (fix or delete regardless of migration)

| Location | Issue | Action |
|---|---|---|
| ~~`components/inbox/watch-repos-dialog.tsx:213`~~ | ~~Scrolls `[data-armed="true"]` into view with `[]` deps, but `armed` starts `null`, so it never matches~~ | **Done** — effect now keys on `[armed]` |
| ~~`components/inbox/search-pane.tsx:118`~~ | ~~Scrolls `[data-active="true"]` into view with `[]` deps; `sel` is 0 at mount so it is a no-op, and it never re-runs on arrow keys~~ | **Done** — effect now keys on `[sel]` |
| ~~`components/review/pr-search.tsx:209`~~ | ~~Mount-only active-row scroll; selection changes on arrow keys are not kept in view~~ | **Done** — effect now keys on `[sel]` |
| ~~`hooks/use-modal-dialog.ts:7`~~ | ~~Missing the close-on-unmount cleanup its comment promises~~ | **No longer relevant** — close-on-unmount is now deliberately omitted; the doc comment explains React removal closes the dialog and an explicit `close()` would misfire under StrictMode |
| `components/review/review-screen.tsx:829` (`onOccClick`) + `:3130` (restore) | **Drag-select over code never marks occurrences.** Two defects in series. (1) `onOccClick` clears the pending 150ms `selectionchange` timer *before* the guards that hand a drag-ending click back to `selectionchange`, so the commit it was about to make is cancelled and no spec is ever set — contradicting the comment on `handleOccPointerClick` that says "selectionchange owns occurrence state for real selections". (2) Even once (1) fires, the `occRestoreRef` layout effect that re-selects the text across the marks repaint is `[]`-keyed, so the drag's own selection would be wiped by the repaint it triggers. Verified by probe: dragging across a word yields a live selection and **0** occurrence marks | Move the timer cancel out of `onOccClick` and into the branches of `handleOccPointerClick` where the click genuinely takes ownership (the word-click and clear-marks paths), leaving the early returns — multi-click, editable surface, non-collapsed selection — to let `selectionchange` win. Then key the restore effect on `[occSpec]`. Fix both together or neither: (1) alone makes marks appear and drops the selection, (2) alone changes nothing. Scope is single-line drags only — a cross-line selection is rejected upstream by `specFromDomSelection`, and that gesture belongs to P21 above |

### Suggested migration order

1. Quick wins, no behavior change: candidates 4, 5 (delete redundant latest-ref effects). ~~Candidate 3~~ and the dead-effect fixes above are **done**.
2. Low-risk query adoption: ~~candidate 1~~ and candidate 2 both **done**.
3. Shared hooks: `useAutoFocus`, `useTimeout`; fold dialog focus into `useModalDialog`.
4. Cache hydration rework (candidate 6) as one PR since the three hooks share the pattern.
5. Bootstrap/route rework (candidate 7).
6. The borderline event-vs-effect cases (candidates 8-13), each individually, only if they cause real bugs or churn.

---

## Pricing and licensing (2026-08-05)

> **Owner decision, 2026-08-05:** standing price moved **$39 → $59**. The
> model is unchanged and stays unchanged: perpetual license, one year of
> updates, app never stops working, no feature gating (`license.rs` is
> explicit that this is not DRM). $39 sat at half the floor of the band for
> daily-driver developer tools (Fork $60 once, Kaleidoscope ~$79, TablePlus
> ~$89, Sublime $99/3yr, Tower $69 **per year**), and a low price on a
> solo-maintained tool reads as "hobby project, may be abandoned" — the top
> unspoken objection to buying one. Same buyers convert at $59; the free tier
> keeps doing the distribution work.

- [ ] 🟡 **Team / company license.** The single highest-leverage revenue item:
      individuals agonise over $59 of their own money, a company expenses
      ~$249 for five seats without a meeting. Same product, no new
      entitlement machinery needed if seats are just N individual licenses
      issued together — what it actually needs is an invoice-friendly
      checkout (Polar supports business details and VAT ID) and a subject
      that can represent an org rather than one GitHub id. Until it exists,
      the pricing card and README both invite team buyers to email
      hello@nodreview.com, which doubles as the demand signal for whether to
      build it at all.

- [ ] 🟢 **Launch discount, $59 → $39.** Polar discount code, time- or
      count-limited, announced in the launch posts.
      *Designed 2026-08-09:* [arriving from elsewhere](https://claude.ai/code/artifact/29efaa50-d5df-48e3-a023-953fa3e9f972) draws the card with
      the standing price struck through, and adds one rule: **the urgency has
      to be true.** "First 100 buyers" is checkable and ends by itself; a
      countdown that resets, or "limited time" with no stated limit, is the one
      piece of marketing theatre that would undercut a product whose pitch is
      that it rents you nothing. If the checkout cannot enforce a limit, claim
      none: say "launch price" and remove it quietly. Anchors the real price
      while giving early adopters the friendly number, and creates the only
      honest urgency a perpetual license has. Discounting later is painless;
      raising a published price later is not, which is why the standing price
      went up *before* launch rather than after.

- [ ] ⏸ **Renewal SKU (+1 year of updates).** Already noted in
      [LAUNCH.md](./LAUNCH.md) step 8. Keep it a manual purchase, never an
      auto-charge: an optional renewal is still "no subscription", an
      automatic one is not, and the word appears in the footer creed, the
      pricing card, the README and the baked share card.

## Post-MVP backlog

Slack integration · streaks · celebration · Conversation mode · webhooks ·
vim jumps · persist pending comments · Stage 3 link interception ·
Universal Links.

*Four entries left this list rather than being built as post-MVP:* **GitLab**
shipped (`platform/gitlab.rs` + tests; MRs are a first-class host, and several
items above are GitLab bug fixes), **Ultracite** shipped and is now the CI lint
gate (`pnpm exec ultracite check` in `lint.yml`), the **icon** shipped along
with the GitHub App logo and name, and **AI** was promoted out of post-MVP by
the 2026-08-03 owner decision below.

> **2026-08-03 (owner):** decision made — build it. Full end-to-end plan,
> decisions (generic OpenAI-compatible seam, selection-or-PR ask scope,
> snapshot-backed tool loop) and PR sequence live in [docs/AI.md](./AI.md);
> the three sketches below are superseded by it and kept for history.
>
> **2026-08-05 status — ask-about-this-code has shipped.** All six PRs of
> AI.md's sequence are merged: BYOK config storage + model listing (#172),
> setup dialog + `a` onboarding (#173), `ai_ask` (#175), the agentic tool loop
> over the repo snapshot (#176) and SSE streaming (#177), with the surface
> since revised from a drawer mode to the inline ask note. `ai.rs`,
> `ai_tests.rs`, `use-ask-note.ts` and `ai-setup-dialog.tsx` are the shipped
> artefacts. **The three sketches below are therefore closed as built, not
> merely superseded** — read [AI.md](./AI.md) for what exists and
> [§ Position](./AI.md#position-2026-08-05) for what governs anything new.

### AI surfaces beyond ask — parked, not planned (2026-08-05)

Three ideas recorded so they stop being re-invented, **none of them scoped**.

*Update 2026-08-16:* the first of the three is parked no longer — its trust
questions got answers and it is being built, as part of the chat panel. See
[AI.md § Second surface](./AI.md#second-surface--chat-panel--suggested-comments-decided-2026-08-16).
The other two stay parked.

*Corrected 2026-08-05:* an earlier draft of this section said all three broke
[AI.md](./AI.md)'s pull-not-push guardrail. That was wrong. The rule governs the
**trigger, not the size of the answer** — each of these would be user-invoked,
which is exactly what pulling means, and none of them needs the position
revisited. See [AI.md § Position](./AI.md#position-2026-08-05). They stay parked
for ordinary product reasons: ask-about-this-code should prove itself first, and
each carries an unresolved design question of its own, noted below.

- [ ] 🟡 **Review-by-prompt → inline comments** — point the AI at the PR with a
      prompt (or one of the repo's skills, e.g. `pr-validity`) and have it
      produce findings **as the same inline comment objects you write by hand**,
      which you then accept, edit or discard into your review.
      *Why it's the most interesting of the three:* it reuses the surface that
      already exists — pending comments — instead of inventing an AI panel, so
      an accepted finding is indistinguishable from your own comment by the
      time it reaches GitHub.
      **Promoted 2026-08-16 (owner)** — being built as part of the chat panel
      ([AI.md § Second surface](./AI.md#second-surface--chat-panel--suggested-comments-decided-2026-08-16)).
      The trust questions this entry parked on, answered there in full; the
      short form: a suggestion is visually distinct (sparkle, *Suggested*
      rather than *Pending*) but is otherwise an ordinary pending comment;
      ignored ones never post, because nothing posts without you pressing
      submit; a bad suggestion is one Discard. *Revised 2026-08-16 after
      dogfooding:* the first build gave findings their own slice and an
      Accept step, and the step never once changed the answer — it just cost
      a click per good suggestion and put two materials in the diff for one
      idea. Findings now stage directly as `PendingComment`s.
- [ ] ❓ **Code diff layers — grouped changes with a summary** — group related
      hunks across files into labelled layers ("auth wiring", "test fixtures",
      "formatting") with a one-line summary each, so a 40-file PR can be read
      as five intentions.
      *Open, and it is the hard part:* does this **reorder the diff** or only
      annotate it? Reordering is where the value is and where the risk is —
      the review list, viewed-map, `e`/`r`/`t` ordering and resume-scroll all
      key off file order today, so a second ordering is a real architectural
      commitment, not a view toggle. An annotate-only first cut (badges + a
      drawer index) tests the idea for a fraction of the cost.
- [ ] ❓ **Change heat map — rank hunks by importance** — tint or badge hunks
      by how much they matter, so attention lands on the risky change rather
      than the 200-line lockfile.
      *Cheapest to prototype, hardest to trust.* A wrong heat map is worse than
      none: it actively steers a reviewer past the bug, and the failure is
      silent. Note a non-AI baseline exists and should be tried first — file
      churn, hunk size, test-vs-source, generated-file detection and
      `.gitattributes` `linguist-generated` get most of the way without a model
      and without sending anything anywhere. Also collides with the diff row
      tints: add/del washes, find marks, occurrence marks, intraline emphasis
      and the comment iris already compete for the same pixels (see the
      three-layer constraint in **Theme selection**), so "just tint it" has no
      free channel left.

---

## Suggested build order

### Explicitly do not build before user feedback

- Link interception · native messaging · Universal Links
- Webhooks · streaks · celebration · Conversation mode
- ~~AI~~ — superseded: the owner decided to build it on 2026-08-03
  ([AI.md](./AI.md)). The rule still applies to the three parked AI surfaces
  above, which stay unbuilt until usage asks for them.

---

## Notes / cross-cutting

- **Inside > entry.** Polish review flow before Slack link magic.
- **`mod+k` is the v0.1 answer** to "coworker pasted a GitHub link" — PR number
  or title, Enter, done.
- **Notifications > interception** — app tells you about new reviews; you don't
  need Slack to be the entry point.
- Stage 2 extension is a **delighter**, not foundational — ship without it.
- Stage 3 is **technically cool** but high maintenance — zero users have asked yet.
- First testers will complain about comment jumps, Escape, slowness, memory — not
  missing link interception.

## Parked ideas (2026-07-02)

- [ ] 🟢 **Watch repos spam** — `setWatchedRepos` fires per toggle
  (`watch-repos-dialog.tsx:154`) with no debounce or in-flight guard, unlike
  the viewed-map persist. Debounce or coalesce rapid watch/unwatch. *Still
  open, and now a plain bug rather than a parked idea — promoted to a checkbox
  since the feature it belongs to shipped.*

## Inbox (2026-07-15)

- [ ] 🟢 **`ctrl+c` copy on click-highlighted word** — copy doesn't fire when a
      word is highlighted via click. *The "unsure whether to follow a standard"
      hesitation is resolved: follow the standard.* An occurrence mark is **not
      a text selection** — it is painted via `CSS.highlights` and the DOM
      selection is deliberately cleared (that clearing is what the
      comment-text-selection fix had to carve exceptions into), so the browser
      has nothing to copy and `ctrl+c` correctly does nothing. Two honest
      options at build time, and neither is exotic: put a real collapsed DOM
      selection over the marked word so native copy just works, or bind copy
      explicitly to write the marked token when marks are lit. Prefer the
      first — anything that makes the app's own clipboard rules diverge from
      the platform's is a rule the user has to learn.
- [ ] **Check for updates action** — explicit user-triggered update check.
- [ ] **Theming: CSS file vs Tailwind variables** — is theming really a CSS file
      rather than Tailwind variables? Consider using TW everywhere for better
      optimization.
- [x] ~~**Command palette "Add comment" item**~~ — **already there, and the
      other half is declined.** The palette builds its entries from the
      registered hotkey bindings, so `shift+c` "Comment on the pull request"
      has been a PR-context palette command all along; running it opens the
      drawer composer with focus already in it. Pinned by "the palette reaches
      PR-level commenting from inside a review" in `palette.spec.ts`, which is
      the only thing this item was missing.
      *Declined:* the "small dialog to quickly scribble a note" the item also
      proposed. That would be a second PR-comment surface beside the drawer
      composer, and the app deliberately keeps comment surfaces few and
      distinct (see the three-materials argument under § ask about code). The
      complaint it answers, "scroll to the comment area", is already answered
      by the composer taking focus on arrival, and by the drawer's own
      collapse-to-a-prompt behaviour.
- [x] **Hide empty tabs** — **done**; `inbox.tsx` derives `visibleTabs` by
      dropping buckets with no PRs (archived rows discounted from the count),
      and the `1`/`2`/`3` digits address those visible slots — see the
      positional-digits item in [Inbox (2026-07-30)](#inbox-2026-07-30), which
      shipped as the same change.

## Inbox (2026-07-18)

- [ ] **Private repos don't show up** — on certain setups (org restrictions,
      token scopes, etc.) private repos may be missing from the list.
      *Investigation (2026-07-30) — ruled OUT:* the OAuth scope is already
      `repo read:org` (`auth.rs`), the GraphQL searches carry **no**
      visibility qualifier or owner filter, and there is no client-side
      visibility filtering anywhere in `src/`. So nothing in our code
      excludes private repos.
      *Ranked causes:*
      1. **Same root as the 403 above — org OAuth App restrictions.** With
         `repo` granted but the app unapproved by the org, GitHub *silently
         omits* that org's private repos from search results, with **no
         error at all**. This is the most likely cause and explains "it works
         for some setups". Confirm: `GET /user/repos?visibility=private`
         lists the repo while the GraphQL search omits it.
      2. **A pasted PAT lacking `repo`.** The token-gate path bypasses OAuth
         scopes entirely and only *labels* the expected scope — nothing
         validates it. A fine-grained PAT without org resource access behaves
         identically.
      3. `first: 50` truncation on a busy account (`issueCount` would exceed
         the rendered list length).
      *Cheapest next step, and it serves both causes:* read the
      `x-oauth-scopes` response header (never read anywhere today) and
      surface "this token is missing `repo`" in the gate — ~15 lines, and it
      turns a silent empty list into a diagnosis.
- [ ] **Unfocused-window hotkeys/sidebar stale** — when the app window isn't
      focused, scrolling still works but hotkeys that only surface on
      focus/hover don't appear, and the sidebar's active-file highlight stops
      updating.

## Inbox (2026-07-21)

- [ ] **Info comment box loses focus, can't type** — the info/comment textbox
      intermittently becomes unfocusable (typing does nothing); seems random.
      On Linux, switching workspaces and back has been observed to clear it.
- [ ] **Pipelines sometimes not visible after GitLab MR update** — CI/pipeline
      status occasionally fails to show up once a GitLab MR receives a new
      update.
- [ ] 🟡 **Merge button in PR view** — merge without switching to the host.
      *Scoped 2026-08-05 (owner): the repo's default merge method, behind a
      confirm — no method picker, no commit-message editor.* Read the allowed
      and default merge method from the host and use it; one action that
      finishes the job you just approved. A full merge box (squash / merge /
      rebase + message editing) is a second product surface and the message
      editor is where the cost lives — not worth it in a review tool.
      *Build notes:* this is the **first non-comment write** Nod performs, so
      it needs a real confirm and honest failure copy — merges fail for
      reasons the app doesn't model (branch protection, required checks still
      running, conflicts, out-of-date base). Surface the host's own refusal
      message rather than inventing one, and keep `o` (open on host) as the
      escape hatch, since the host's merge box carries context Nod does not.
- [ ] **Multi-line comment highlighting still broken in full-file view** —
      the flowing block-comment fix above (`markBlockCommentRows`) only
      covers `DiffRow`s built from the patch; full-file expansion's
      synthesized context rows (`expand-file.ts`) aren't run through that
      pass, so a block comment spanning into head-blob context still greys
      out only its first line there. Known limitation called out when the
      original fix shipped — needs `markBlockCommentRows` (or equivalent)
      wired into the full-file row synthesis path too.

## Stacked PRs (2026-07-30)

- [ ] 🟡 **Stacked-PR indicator** — show that a PR is one link in a chain
      (its base branch is another open PR's head branch) rather than based on
      the default branch. PR-chain workflows are exactly where this app's
      "already-merged code in the diff" problem bites, so it pairs with
      **stale-base diff pollution** below.
      *What exists:* `PullRequest` already carries `baseRef`/`headRef`, and
      the review header already renders them as two `BranchChip`s either side
      of a `←`. That header is the natural home — the stack fact is *about*
      the base branch, so it belongs next to the base chip.
      *The blocker is data, not UI.* `pr_from_graphql` hardcodes
      `head_ref`/`base_ref` to empty strings and `FRAGMENT_P` never requests
      them, so **GitHub inbox PRs carry no refs at all** and the
      "A.baseRef === B.headRef" join is impossible there. GitLab's
      `mr_to_pr` already fills both. Fix is ~3 lines: add
      `headRefName baseRefName` to the fragment and stop blanking them. Do
      this first — it is cheap, needs no extra request, and also unblocks
      **Branch name not visible in index/search** (§6).
      *Also missing:* the repository default branch is never fetched
      (`grep defaultBranch` → zero hits), so "based on main" vs "based on a
      PR" can only be inferred from the inbox join until
      `repository { defaultBranchRef { name } }` joins the fragment.
      **Decided 2026-08-01 (owner):** follow GitLab's own stacked-MR
      presentation — a stack control in the review header next to the branch
      chips, reading `2 of 3`, whose dropdown lists every PR in the chain
      (top of the stack down) and navigates between them. GitLab detects
      stacks with exactly the join this item proposes (an MR is stacked when
      it targets another open MR's source branch), so the model transfers
      directly; it renders nothing when no stack is detected. The base-chip
      relabel below stays as a *complement*, not the mechanism — the chip
      answers "what is this diff against?", the stack control answers "where
      am I in the chain?":

      ```
      not stacked:   main ← feat/thing
      stacked:       #431 ← feat/thing   [2 of 3 ▾]   (tooltip: "Based on #431 · Add fuzzy matching")
      ```

      Both degrade to today's rendering when nothing is detected.
      *Inbox row:* a quiet `q-pill q-pill-muted` reading `stacked` in the
      meta line is enough; the row is already dense.
      *Work split:* ~3 lines Rust + a fixture test · `src/lib/stack.ts`
      (+ colocated test) building a `headRef → PR` map across inbox buckets
      and returning the ordered chain plus the current PR's position ·
      three small call sites.
      *Open question:* stacks whose links are **not in your inbox** (a
      teammate's PR you aren't on) can't be detected client-side at all.
      Accept that limitation for v1 rather than adding a `list_open_prs`
      command — the common case is your own chain, which is in `created`.

## Inbox (2026-07-22)

- [ ] 🟡 **Stale-base diff pollution — flag already-merged code in PR
      diffs** — when a PR's target branch is behind main (typical in PR
      chains after merging main into the head branch), GitHub computes the
      diff from an old merge-base, so already-reviewed, already-merged code
      renders as new — and reviewers re-review prod code without realizing.
      Fixable without local git via the compare API (the app today only
      calls `/pulls/{n}/files`, never `/compare` — `base_ref`/`head_sha`
      are already on `PullRequest`, `model.rs`):
      - **Tier 1 — detect + banner (ship first):** fetch
        `compare/{base_ref}...{head_sha}` and
        `compare/{default_branch}...{head_sha}`; if the PR diff carries
        substantially more commits than the head-vs-main delta, banner:
        *"This diff includes changes already merged to main — the target
        branch is behind; ask the author to update it."*
      - **Tier 2 — dim already-merged files:** set-difference the two
        compare file lists. File in `base...head` but absent from
        `main...head` → pure main backwash, collapse/dim with an "already
        on main" label. Identical `patch` in both → fully new. Differing →
        mixed, show badged. Content-based, so robust to squash merges
        (commit-ancestry checks are not). Hunk-level precision inside mixed
        files: not worth it.
      Caveat: compare API caps the file list at 300 — fall back to
      banner-only on monster diffs. Orthogonal to §9 repo snapshot (file
      trees at one SHA; no diffs/merge-bases) — no dependency either way.

## Inbox (2026-07-30)

- [x] 🟢 **Viewing the last file should jump to the first unviewed one** —
      **done**; no code change, `e` was the wrong suspect and is not
      regressed. Marking the final file with `e` already walks forward, wraps
      past the end and lands on the first file still unviewed, skipping any
      it has already ticked; it only stays put when every file is viewed,
      which is the Wave 2 decision (parking on a viewed file would let the
      next `e` silently unmark it). Now pinned by a spec that views file 0,
      moves to the last file and presses `e`, so the wrap has to step over a
      viewed file to land on file 1. The gap on `v` is real and stays: `v` is
      the plain toggle, so a second `v` undoes the first, and that undo is
      impossible if the key carries you off to another file. `e` is the key
      that keeps the review flowing, `v` is the key that marks one file. A
      second spec pins that too.
- [x] 🟢 **Inbox `1`/`2`/`3` should address the visible tabs** — **done**;
      the digits are now positional over the *visible* tabs, so `1` is the
      leftmost tab on the bar and a digit can never summon an empty tab out
      of hiding. The digit hints on the bar follow the same slots, so they
      read 1, 2, 3 with no gaps. Hidden tabs keep a **keyless** binding so
      the command palette still reaches them — typing "watching" is an
      explicit request where a digit is positional, and without that the
      Watching tab became unreachable by keyboard exactly when it is empty,
      which is when you would go there to add a repo.
- [x] 🟢 **Disable file-tree animation** — **done**; dropped all three
      toggle transitions: `width`/`border-color` 160ms on
      `.qf-sidebar-inline` (the wide-window push column), `transform` 180ms
      on `.qf-sidebar-overlay` (the narrow-window slide-in) and `opacity`
      150ms on `.qf-sidebar-scrim`. `b` now lands the tree at its final size
      in the same frame, which also stops Virtuoso re-measuring through
      ~160ms of intermediate widths. The hidden states themselves
      (`width: 0`, `translateX(-100%)`, `opacity: 0`) are load-bearing and
      stayed. The 120ms `.qf-file` row hover cross-fade is deliberately
      kept — that is hover feedback on a row, not the tree animating.
- [x] 🔴 **README rework** — the README has grown by accretion and no longer
      reads as an introduction to the product. Rewrite it. Folds in the
      per-distro install guidance already queued in
      [11d Tier 0](#11d-linux-install--update-path-2026-07-25) (`README.md:221`)
      — do that pass as part of this rather than twice.
      *Shipped: 290 lines down to ~140. Leads with the landing page's OG banner
      and a real inbox screenshot (`docs/assets/`, copied from `apps/web` so the
      social card can change without silently changing the README), then pitch,
      features, install, sign-in, price and licence, docs index. Cut: both
      shortcut tables (`?` owns them in-app), the runtime diagram and key-source
      list (ARCHITECTURE.md / RUST.md own them), Scope, Roadmap and the "7-day
      experiment" framing, which read as a hobby project next to a $39 price.
      Build-from-source, OAuth app registration and the check commands moved to
      the new [DEVELOPMENT.md](./DEVELOPMENT.md); release cutting was already
      duplicated from RELEASING.md and is now just a link. Also fixed the stale
      Scope line claiming GitLab was out of scope, and repointed the two
      `auth.rs` "see README" sign-in errors plus the RUST.md/ARCHITECTURE.md
      cross-links at DEVELOPMENT.md. The `## Install & auto-updates` heading is
      load-bearing: `apps/web/src/lib/site.ts` `INSTALL_NOTES_URL` links the
      macOS note to that anchor.*
- [ ] 🟡 **`mod+r` code search — the glance is too cramped** (2026-07-30) —
      snippets aren't full width, some content never fits, and the code
      preview needs more room and more lines. Audit of
      `pr-search.tsx` + `.qsp-*` in `quiet.css`:
      - **Worst symptom first: a match can be invisible.**
        `.qsp-snip-line` is `white-space: pre; overflow: hidden` and
        `.qsp-snip-code` adds `text-overflow: ellipsis`, so a hit far along
        a long line is clipped away — you get a result row whose match you
        cannot see, and no way to scroll to it. Fix that before cosmetics:
        scroll each snippet so the match is in frame, or wrap the hit line.
      - **Only 5 lines of context.** `SNIPPET_RADIUS = 2` (`pr-search.tsx:44`)
        → ±2 around the hit. Raising it to 3–4 is a one-line change and is
        what "increase the lines visible" asks for.
      - **The pane is sized for the wrong content.** `.qsp-panel` is shared
        by *two* surfaces — the inbox `/` PR search and this in-review code
        search (`pr-search.tsx:281`) — at one `width: min(680px, …)`. That
        width was chosen for PR titles + repo/author meta; code wants more.
        Giving the code-search pane its own wider rule is the single
        biggest win. (Noted during PR #97, which changed the shared height:
        this shared class is easy to retune for one surface and regress the
        other — split it deliberately.)
      - **Chrome eats the code column.** Inside each `.qsp-row`: 14px/12px
        padding, a `.qsp-rail`, a 34px min-width line-number gutter and a
        10px gap, before any code. At 11.5px mono that is a lot of the
        line gone to furniture.
      - **Bigger option if the above isn't enough:** a two-pane layout —
        narrow result list on the left, a real preview pane on the right —
        which is what "not enough space for the code glance" points at.
        Costs more than the four fixes above; try them first.
      - Also worth checking while here: `MAX_LINES = 60` silently truncates
        results with no "showing first 60" affordance.
      *Shipped 2026-07-30 (the no-decision half):* rows are `<button>`s, which
      shrink-wrap instead of filling the list — that, not the pane width, is
      why snippets stopped short (measured: 381px inside a 913px pane). Fixed
      with `width: 100%`, the same explicit width `.qf-file` already needed.
      The matched line now wraps (`pre-wrap` on `.qsp-snip-line-hit` only) so
      a hit far along a long line can never be ellipsised out of sight;
      context lines stay one line each. `SNIPPET_RADIUS` 2 → 4 (5 → 9 lines),
      and the in-review pane took its own `.qsp-panel-code` width (920px) so
      it no longer inherits a width chosen for PR titles.
      **Decided 2026-08-05 (owner) — decision-free now:**
      - [ ] 🟢 **Add a "showing first 60" affordance.** `MAX_LINES = 60`
        truncates silently today, so a search that looks complete isn't —
        the same class of defect as the ellipsised match that was just fixed,
        and worse, because nothing on screen hints at it. Say how many were
        shown and that more exist.
      - **Two-pane layout: not building it.** The four cheap fixes (full-width
        rows, wrapped hit line, 9 lines of context, the pane's own 920px
        width) may already have solved the cramped glance. Re-open only if it
        still feels tight in daily use — at which point the evidence will
        exist, which it does not today.
- [ ] 🟡 **Info tab: one comment feed, one comment design** (2026-07-30) —
      code discussions in the Info drawer show no avatar, author or
      timestamp, and sit in a separate list from PR-level comments. Make
      them look like comments, and consider merging the two lists into one
      chronological feed.
      *Decided 2026-08-09 (owner): **restyle the jump list, do not merge the
      feeds.*** The complaint is that threads do not read as comments, and both
      types already carry `user`, `userAvatarUrl` and `createdAt`, so that is a
      rendering change with no data work behind it. Merging would spend the
      Conversation-mode decision, which is still deliberately deferred, on a
      styling problem. Revisit the merge only if Conversation mode is taken up
      on its own terms.
      - **Not a data gap — a rendering choice.** Both `ReviewComment`
        (`types.ts:73`) and `IssueComment` (`types.ts:89`) already carry
        `user`, `userAvatarUrl` and `createdAt`, and `review-screen.tsx`
        already passes the full `inlineComments` array into the drawer. The
        drawer's **"Code discussion"** section
        (`right-panel.tsx:383-425`) just renders each thread as a
        `qf-thread-row` *jump button* — path, `:line`, reply count, first
        line of the body — so it is a file index, not a comment view. The
        adjacent "Conversation" section right above it
        (`right-panel.tsx:333-381`) renders the full treatment.
      - **The inline thread is fine** — `comment-thread.tsx:272-303`
        already renders avatar + author + time per comment. So this is
        scoped to the drawer only, despite the report's wording.
      - **Design unification is the durable half.** The head row (avatar ·
        author · time · tools) is written twice, against two CSS families
        (`.qf-convo-*` vs `.qf-comment-*`/`.qf-thread-*`), while
        `comment-item.tsx` shares only `CommentTools` + `CommentBody` — its
        header says the split is intentional. Extracting one `CommentRow`
        is the fix and pays off regardless of the feed decision. Do this
        part first; it is safe and independently shippable.
      - **Decided 2026-08-05 (owner): one chronological feed, following the
        standard.** Both GitHub and GitLab show PR-level and inline comments
        in a single stream, and the complaint underneath this item is that
        Nod's drawer shows *neither* kind's author — "not seeing who added the
        comment doesn't make sense" regardless of which list it lands in. So:
        **every entry carries avatar · author · time**, and inline entries
        keep a **jump-to-code** affordance so the feed stays a way *into* the
        diff rather than a copy of it. Build the shared `CommentRow` first —
        it is the part that pays off either way — then merge the two sections
        onto it.
      - **⚠️ This spends the Conversation-mode decision, deliberately.**
        [DESIGN.md](./DESIGN.md) states the split ("Info tab is description +
        PR-level comments, inline stays in the code view") and § layout defers
        a blended stream as post-MVP. The owner call overrides both: what was
        being deferred was a *speculative* third surface, and a single
        attributed feed is the industry-standard shape, not a bet. **DESIGN.md
        must be updated with this item**, or it will keep contradicting the
        shipped drawer — and the ⏸ Conversation-mode entry in § layout should
        be folded in rather than left implying a separate future surface.
      - Pairs with **Reply in Info tab** (§keyboard/composer) — a code
        discussion that renders as a real comment is also the surface that
        would carry a reply box.
- [ ] 🔴 **Theme selection** (2026-07-30) — let users pick a colour theme:
      the current **Quiet** default plus **Monokai**. **Decision-free as of
      2026-08-05:** themes ship **free to everyone** (see the gating decision
      below), and the theming-mechanism blocker is resolved (below) — what
      remains is the literal sweep plus authoring each theme's three layers.
      - **A theme here is three coordinated layers, not a palette.** (1) the
        ~14 chrome tokens in `src/index.css` `@theme`; (2) the diff add/del
        row tints, which must stay legible *under* find marks, occurrence
        marks, intraline emphasis and the comment iris — the constraint an
        editor theme doesn't have; (3) the syntax palette, currently
        highlight.js `github-dark`, which is a separate stylesheet. Porting
        Monokai means authoring all three, not swapping hexes.
      - **The real work: `quiet.css` has ~59 hardcoded colour literals**
        (`rgba(95, 208, 138, 0.08)`, `rgba(255, 112, 136, 0.3)`, …) that
        bypass the token layer entirely. Every one is a place a second theme
        would leak the first theme's colours. Tokenising those is the bulk of
        the work and is worth doing regardless of whether themes ship — it is
        also the whole of the "mechanism" question, now answered below.
      - **Sequencing — decided 2026-08-09 (owner): tokenise the ~59 literals
        now, as a standalone refactor, and do not ship a theme picker yet.**
        It is the bulk of the work, it is worth doing whether or not a second
        theme ever exists, and it has the same shape as the radius scale that
        landed in #224: a pure refactor with no visual change, verifiable by
        screenshot diff. Shipping the picker separately also keeps the "author
        three palettes" problem (UI, diff colours, highlight.js) out of a
        refactor that should change nothing on screen.
      - **Mechanism — decided 2026-08-05 (owner): tokenise onto the layer that
        already exists. There is no CSS-vs-Tailwind choice to make.** The
        question in [Inbox (2026-07-15)](#inbox-2026-07-15) assumed the two
        were alternatives; in Tailwind v4 they are the same thing. `index.css`
        already declares the palette in an `@theme` block, which **compiles to
        CSS custom properties on `:root`**, and `quiet.css` consumes them
        through short aliases (`--bg: var(--color-bg)`). "Moving to Tailwind"
        would not remove the custom properties — it *is* the custom properties.
        Two consequences worth stating so this isn't re-litigated: runtime
        theme switching **requires** custom properties (utilities are static at
        build time, so a compiled utility cannot change theme without them),
        and there is no bundle win on offer — the 59 literals already ship in
        the CSS, so tokenising moves bytes rather than adding or removing them.
        Scope is therefore a **mechanical sweep**, not a rewrite.
      - **Recommended set — cover distinct axes, not a long list.** Each
        theme is real maintenance (3 layers × every diff state), so:
        **Quiet** (default) · **Quiet Light** · **High contrast** ·
        **Monokai** (high-saturation retro, requested) · **Solarized**
        dark+light (the low-eye-strain pair, and the most on-brief for a
        long-reading review tool) · **Gruvbox** (warm/low-blue — the
        counterweight to Monokai's cool neon). Hold Catppuccin, Tokyo Night,
        Nord and One Dark until asked; they are popular but occupy axes the
        set above already covers.
      - **Gating — decided 2026-08-05 (owner): every theme is free.** The
        earlier proposal to sell the *character* themes is dropped. See
        [Pricing — what a license buys](#pricing--what-a-license-buys-2026-08-05):
        the model is recognition, not capability, so **nothing in the app is
        ever entitlement-checked** and this item builds no gate. Light and
        high-contrast were always going to be free (a review tool that can't
        be read in a bright room is broken, not unlicensed); the decision
        extends that to the rest rather than drawing a line inside a settings
        list, where a locked row sitting beside free rows is the most visible
        paywall the app could own.
- [ ] ❓ **Code-similarity check between the diff and the repo** — flag hunks
      that closely match code already in the repository (duplicated logic,
      copy-paste, a helper that already exists). Open question on shape and
      whether it earns its keep: needs §9 repo snapshot (layer 1) to have
      local files to compare against. Snapshot layer 1 **has since shipped**
      (PRs #75/#113), so the prerequisite is met and this is now purely a
      product question. The old "adjacent to our no-AI positioning" caveat is
      moot — positioning is now "not rented, not bundled" — and note this would
      be plain similarity matching, no model, so it costs nothing from the AI
      budget either way. Pairs naturally with **stale-base diff pollution**:
      both answer "is this hunk actually new?".

## Inbox (2026-08-05)

- [x] 🟡 **Sticky file headers overlap awkwardly on scroll** — scrolling from
      one file into the next leaves two sticky bands fighting for the same
      strip, which reads as a glitch rather than as structure.
      **Decided (owner): push-out.** The incoming file header shoves the
      outgoing one up and off, GitHub/iOS-style, so **exactly one file header
      is ever visible**. That is the behaviour that matches the hierarchy the
      distinct-file-header work established — the file band means "a new file
      starts here", and two of them on screen means that sentence is false.
      *Scoping note:* the header is `position: sticky` inside a Virtuoso list,
      so the classic CSS-only trick (a sentinel plus the next header's own
      offset) is unreliable when the neighbouring section may not be mounted.
      Measure against the mounted row range rather than assuming the next
      header exists, and keep it off the scroll hot path — this is cosmetic and
      must not cost scroll frames the perf budget is holding.
- [ ] 🟡 **Search should reach closed and merged PRs** — today `mod+k` and `/`
      only see PRs in the inbox buckets, all of which are open, so a review you
      already submitted is unreachable the moment it merges. **Decided
      (owner):** extend the existing search rather than adding a surface — no
      fifth tab, no separate history screen. A merged PR is still the thing you
      want to re-read; it should just be findable by the same title / number /
      author / branch query that already works.
      *Shape:* GitHub's search already accepts the state qualifier the inbox
      queries omit, and GitLab's MR list takes `state=merged|closed`, so this
      is a query change plus a result-source merge, not new plumbing. Keep open
      PRs ranked above closed ones so the common case doesn't get diluted, and
      mark closed/merged hits visibly in the row — opening one should not feel
      like the app lost track of state. Pairs with **branch name in search**
      (§6), which already landed the extra match field.
- [ ] 🟢 **Scroll to a just-added Info-tab comment** — posting a PR-level
      comment from the drawer leaves it below the fold, so the comment you just
      wrote appears to have vanished. Scroll it into view on arrival, **without
      animation** (the drawer is a reading surface; the app's motion budget in
      `quiet.css` is deliberately near-zero). The optimistic insert already
      gives a DOM node to target, so this is a scroll call at the right moment,
      not a data problem.
- [ ] 🟢 **Cloudflare deploys on every PR, including desktop-only ones** — the
      site rebuilds for changes that cannot affect it. **Decided (owner):** set
      the Pages project's **build watch paths** to the web app's directory in
      the Cloudflare dashboard. One setting, no CI migration, and skipped
      builds still report success so branch protection is unaffected. Note this
      is a **dashboard change, not a repo change** — it lives with the rest of
      the Pages config (`GITHUB_TOKEN` build secret et al.), so record it there
      too or the next person will look for it in `release.yml` and not find it.
      *Explicitly not doing:* moving the deploy into GitHub Actions with a path
      filter. More control, but it migrates a working pipeline to buy a
      setting we can flip.

## Loading states — inventory and proposal (2026-08-24)

From a gallery note on `spinner`: "where is this used? feels like we should
have proper loading state designs". Inventory first, because the answer is
not "more spinners" or "fewer".

**Eleven spinner sites.** Boot route, inbox first fetch, ledger status,
ledger session diff, markdown upload blob, image-diff blob, three inside
token-gate buttons, the ask note's time-to-first-token, and the watch
dialog's save strip.

**Two skeletons, written independently, with no shared primitive.**
`review-screen-pending` (`.qrp-skel`, 1.8s pulse) and `release-history`
(`.qrh-skel`, 1.6s pulse) encode the same three rules — fixed bar widths
because they are screenshot targets, opacity-only animation, nothing under
reduced motion — in two files. A third skeleton would be a third copy.

**The inconsistencies worth fixing:**

- The longest waits get the least design. "Waiting for the browser…" runs
  for minutes as static text and the repo-ready download is a static
  sentence, while a sub-second inbox fetch gets a full-screen animated
  disc.
- Two surfaces derive from git for seconds each (ledger status, ledger
  session) and show a spinner, while the session already renders the very
  diff pane `review-screen-pending` was built to pre-paint.
- `Button` has a first-class `busy` prop, and token-gate hand-rolls a
  16px `Spinner` inside a `Button` that already carries a 12px one — the
  label vanishes, so the control changes width mid-click.
- The same AI wait has two designs: `ask-note` shows a bare spinner,
  `chat-panel` shows `Working… 4s` with an expandable activity trail.
- Three surfaces load one model list three ways (a placeholder, a
  placeholder plus an empty-list sentence, and a hint paragraph).
- `.qw-scan` is the only animation in the package with no
  `prefers-reduced-motion` guard.

**Proposed order:**

1. Extract `packages/ui/src/skeleton/` — a bar plus the pulse keyframe and
   the reduced-motion rule — and move both existing skeletons onto it, so
   the third and fourth are cheap.
2. Skeletons where the shape is already known: the inbox list (fixed-metric
   rows, and the tabs above it already refuse to blank their counts because
   that would read as loading), the ledger queue, the ledger session (it can
   reuse the review shell verbatim), and the boot route (paint the
   destination's chrome, which `loadLastRoute` already knows).
3. Reserve the box for inline media — markdown uploads and image diffs know
   their dimensions, so the paragraph should stop reflowing when the asset
   lands.
4. Keep `Spinner` for control-sized waits only, and prefer `Button busy`
   over an inline spinner (fixes token-gate).
5. Give every wait over ~2s the chat's elapsed-time treatment, so a long
   wait stops looking hung.

## Feature ideas (2026-08-05)

Nine candidates proposed 2026-08-05 and recorded so they can be chosen from
rather than re-invented. **None is committed** — sizes are first-pass, and each
carries enough scoping to start without a product call unless marked otherwise.
Verified absent from the app before writing: the diff is **unified-only**, the
notifier fires **only** on `reviewRequested`, and there is no noise-file
handling, no canned comments and no offline write queue.

Recommended first three: **since-my-last-review**, **noise files**, and
**author-responded notifications** — the differentiator, the cheapest real win,
and the leak. **Offline review** is the strongest long-term moat if a bet is
wanted instead of a quick win.

- [ ] 🔴 **"What changed since my last review"** — re-review is the worst part
      of code review: the author pushes and you rescan 40 files to find the 3
      that moved. Both hosts handle this badly, so being excellent at it is a
      genuine differentiator rather than a nicer version of what exists.
      *Ingredients already exist* — per-file viewed state, the fingerprints
      that drive auto-unview on push, `use-review-head-sha-sync.ts` and the
      reconcile toast that already names changed files. What is missing is a
      **mode**: render only the delta between the SHA you last reviewed and
      head, with the rest collapsed and reachable.
      *Decide when building:* whether the delta is a filter over the existing
      row stream (cheap, keeps every hotkey working) or a separate fetch of
      `compare/{lastReviewedSha}...{head}` (accurate across force-pushes and
      rebases, but a second diff source). **Decided 2026-08-09 (owner):
      start as a filter**
      — it reuses the whole review pipeline, and the compare call can be added
      later for the force-push case without changing the surface. Note the
      stale-base work already introduces `/compare`, so the second half is
      shared, not new.
- [ ] 🟡 **Noise files collapse by default** — lockfiles, generated code,
      minified assets, snapshots and vendored trees render as thousands of
      lines nobody reads, and they dominate exactly the PRs that are already
      big. Collapse them to a one-line summary ("`pnpm-lock.yaml` · +412 −88 ·
      generated") expandable in place, and discount them everywhere size is
      counted. **Best effort-to-payoff ratio on this list** and needs no AI.
      *Detection, in order of trust:* the repo's own `.gitattributes`
      `linguist-generated` (authoritative, and free now that §9 layer 1 gives
      local files), then a filename/glob list (`*-lock.*`, `*.min.*`,
      `dist/`, `vendor/`, `__snapshots__/`), then a content heuristic (very
      long lines, no spaces). *Constraint:* never hide, only collapse —
      a generated file **is** sometimes the bug, so the row must stay present
      and countable. Pairs with cost-to-review below, which is misleading
      until this exists.
      *Decided 2026-08-09 (owner), all four calls as recommended:* ship
      detection rules 1 and 2 only (`.gitattributes` `linguist-generated`, then
      name globs) and **leave the content heuristic unbuilt** until a real PR
      is mis-collapsed, because it is the only rule that guesses from shape
      rather than stating a fact; collapse memory lasts the **session** and
      resets on restart, so no new persisted state; **no new key**, since
      expanding is rare by construction and the key space is nearly full; and
      **comment threads stay visible on a collapsed file, always**. Viewed
      progress is **not** discounted.
      *Design mocked 2026-08-09:*
      [noise files, collapse never hide](https://claude.ai/code/artifact/34f6ca62-506e-4500-888a-d27fdae8bd30)
      draws the collapsed row against a real diff, tabulates the three
      detection rules by how much each can be trusted, and carries four open
      calls: whether to build the content heuristic at all, whether collapse
      memory survives a restart, whether it takes a key, and whether comment
      threads stay visible on a collapsed file. It also settles one thing this
      entry left implicit: **viewed progress must not be discounted**, because
      coverage is a promise about what you looked at, and excusing you from two
      files would make `8 / 8` mean less than it does today.
- [ ] 🔴 **Offline review** — write comments, mark files viewed and stage a
      review with no network, then sync on reconnect. **The widest moat on
      this list: github.com fundamentally cannot do this**, and it is the
      clearest answer to "why a desktop app at all?" The architecture already
      leans this way — cache-first reads, a Rust backend that owns all IO, and
      a local store — so the missing piece is a **durable write queue** rather
      than an offline mode bolted over the UI.
      *The hard part is not queuing, it is conflict:* a queued reply to a
      thread someone resolved, or a comment on a line that a force-push moved.
      Anchors are already fingerprinted for viewed-state reconcile, so the same
      machinery can detect a moved anchor. **Decide before building** what a
      failed replay does — silently drop, or surface a "these 3 comments
      couldn't be posted" review. *Recommendation: surface them*, always; a
      review tool that loses your writing is worse than one that cannot work
      offline.
- [x] 🟢 **"Author responded" notifications** — shipped, and it grew into a
      notification *system* rather than a second `if` in the notifier, because
      review asked the right question: how do we know the person being notified
      actually reviewed the PR? Bucket membership cannot answer that —
      `involves:@me` is equally true for a PR you were only mentioned on — so
      the inbox query now carries `viewerDidAuthor` and `viewerLatestReview`,
      and a reply announces only when the author's newest comment is **newer
      than your latest review**.
      *What landed:* pure detectors (`lib/notification-events.ts`, unit-tested
      with no React and no clock), a capped persisted event log that is the one
      place repeats die (`store/notification-store.ts`), a settings home
      (`store/settings-store.ts`) with a channel per kind (off / in app /
      system / both), an OS banner sink on `tauri-plugin-notification`, and a
      notification list catalogued as `notification-center` in @nod/ui.
      **Still partial by data limit** — the inbox payload cannot show a push
      (list items carry no `headSha`) or a reply inside a review thread
      (`lastComment` is conversation comments only), and GitLab fills neither
      `lastComment` nor the viewer fields, so it never fires. Covering those
      needs the list query to carry `headSha` plus the newest review-thread
      comment (author + timestamp); `updatedAt` is not a substitute, since
      labels, CI and your own actions all move it. Each is a new detector
      behind the same seam, not a rewrite.
      *Deliberately not built:* webhooks and the Notifications-API change
      detector (both §7, both transport under that seam), and snooze —
      "schedule this review for later" is a field on a logged event plus a
      detector that re-emits when it passes, which is only possible now that
      events are persisted at all.
- [ ] 🟡 **Cost-to-review estimate in the inbox** — a quiet "~4 min" / "~40
      min" on each row, from changed lines, file count, test-vs-source ratio
      and generated share. Reviewers procrastinate partly because they cannot
      tell which PR is cheap, and a queue you can triage is a queue that moves.
      No AI — this is arithmetic over data the inbox already has.
      *Build after noise files*, which it depends on to not be a lie: a PR that
      is 95% lockfile currently looks enormous, and an estimate that says so
      would be actively misleading. Keep the unit honest (a range, or a
      three-step small/medium/large) — a false precise minute count invites
      exactly one complaint, that it was wrong.
- [ ] 🟢 **Canned comments on a key** — reviewers type the same sentences
      forever ("nit: naming", "needs a test", "prefer an early return").
      A short user-editable list, insertable into the composer from a key or
      the palette. Trivial to build, maximally on-brand for a keyboard-first
      app, and it compounds with the rich composer already shipped.
      *Scope note:* store per-user, not per-repo, and keep them plain text —
      the moment they take variables they become a template language.
- [ ] 🟢 **Mark a hunk for follow-up** — "I'll come back to this" is a thought
      reviewers have constantly and no tool captures. A personal flag on a row
      that survives the session, listed in the info drawer and steppable from
      the keyboard. Distinct from a pending comment (it is private, and not
      every follow-up becomes a comment) and from viewed state (which is about
      coverage, not attention). Reuses the anchor + persistence pattern the
      viewed map already established.
- [ ] 🟡 **Review a whole stack as one continuous diff** — the natural payoff
      of [stacked-PR detection](#stacked-prs-2026-07-30): read the chain
      top-to-bottom as a single diff, with each comment routed to the PR that
      owns the line. Nobody does this well, and it is precisely the workflow
      where the app already has an edge.
      *Hard dependency on the stack detector*, and it inherits that item's
      limitation — a link outside your inbox is invisible, so the stack view
      must degrade to "the part of the chain I can see" rather than claiming
      completeness. Build after the indicator ships and gets used.
- [ ] ⏸ **Side-by-side diff** — **parked 2026-08-09 (owner), with the reason
      written down so it stops being re-proposed as a quick win.** The app is
      unified-only, and this is **table stakes** whose absence is a live
      objection, especially for renames and refactors where unified genuinely
      reads worse. That is precisely why the parking needs recording rather
      than being left as silence. It costs a real architectural conversation:
      the row stream, cursor, find marks, occurrence marks, fat-cursor ranges
      and comment anchoring are every one of them built around **one row per
      line**. Reopen it as an architecture decision with its own spike, never
      as a feature ticket.

---

## Inbox (2026-08-12)

One item raised by the owner while judging launch-post readiness. Checked
against the code before writing.

- [ ] 🟡 **`/restore` is a 501 stub while the product is live** — the normal
      restore path works: a license is keyed to the buyer's GitHub identity,
      so "Activate my license" on a new machine finds the purchase and
      re-activates without charging again. The email fallback for everyone
      *outside* that path — self-hosted GitLab buyers by design, plus anyone
      who lost access to the GitHub account they bought with — returns a
      hardcoded `501 not yet configured` (`apps/web/functions/restore.ts`).
      The dependency the 2026-08-02 audit named is gone: `POLAR_API_KEY` has
      been a production Pages secret since 2026-08-04, so the Polar Customer
      API lookup by email is buildable now. Until it lands, support for those
      cases is manual token issuance via hello@ — fine at current volume,
      worth building before a launch post drives purchases at scale.

---

## Inbox (2026-08-11)

Four items raised by the owner. Checked against the code before writing, and
where the check changed the diagnosis that is recorded here rather than
quietly fixed.

- [ ] 🟡 ❓ **Multiple cursors in the PR view** — raised 2026-08-17 while
      dogfooding the chat. The ask as stated: "no multiple cursor support in
      the pr view". Open design question before building: what should a
      second cursor DO here? The plausible readings are (a) several
      non-contiguous line ranges selected at once, so `l` feeds the chat all
      of them and `c` opens one comment per range; (b) editor-style
      mod+click ghost cursors, which have no obvious meaning over a
      read-only diff. Reading (a) is the useful one and touches the
      selection model (`LineSelection` is a single contiguous range today),
      the drag hook, `l`'s capture, and the comment composer's one-range
      assumption. Sized medium; confirm reading (a) with the owner first.
- [x] 🟡 **Keyboard file order does not match the tree** — shipped
      2026-08-17. Took the second option: `treeOrder` (beside `buildFileTree`,
      so one implementation defines the order) sorts the files once as they
      enter the review screen, and every consumer — the sidebar, the diff
      pane, `Tab`/`e`, the flat list — reads that array. The orders now agree
      by construction rather than by two traversals happening to match.
- [ ] 🟡 ❓ **Failed-to-fetch / offline status is invisible with stale data** —
      the inbox shows an error state only when there is no cached data
      (`inbox.tsx` `isError && !hasData`); once anything is cached, a dead
      network shows yesterday's inbox with no signal that refreshes are
      failing. Decide the surface: a quiet "last synced · Xm ago, retrying"
      line fits the app's tone better than a toast. Same question applies to
      the PR view's queries.
- [ ] 🟡 **Ask-about-code gaps** — one item per verified gap, because two of
      the reported ones are already built:
      *Already built:* answers DO stream (Rust emits `ai-ask-delta` per askId;
      `use-ask-note.ts` accumulates `partial` per animation frame) — if tokens
      are not visibly streaming, that is a bug or a provider path that never
      emits deltas, and needs a live-key check (see the Nexos probe,
      `scripts/probe-nexos.mjs`). And a closed note is NOT gone: exchanges
      survive Esc and reopening at the same target resumes; only re-anchoring
      elsewhere starts fresh.
      *Real gaps:* (1) conversations are in-memory only — leaving the PR or
      restarting the app loses every exchange; decide whether asks persist
      like review memory does. (2) The input is `disabled` while an ask is in
      flight (`ask-note.tsx`), which is what drops focus after submit; keep it
      enabled so a follow-up can be typed/queued while the answer streams.
      (3) Context is only the selected lines / cursor row — the model knows
      nothing about the PR (title, description, diff summary, comments) or
      the repo; ship a PR-level context block with every ask and treat the
      selection as the *focus*, not the whole world. Repo-wide context is the
      ⏸ whole-repo-index item above, not this one.
---

## Inbox (2026-08-09)

Five items raised by the owner. Checked against the code before writing, and
where the check changed the diagnosis that is recorded here rather than
quietly fixed.

- [ ] 🟢 **The cursor is invisible inside a multi-line selection** — reported
      as "cursor follows multi-line selection". *It already does.*
      `extendExistingSelection` (`src/lib/review-cursor.ts:50`) calls
      `setCursor` with the growing edge on every `shift+j`/`shift+k`, so the
      cursor genuinely tracks the end of the range.
      *The real defect is that you cannot see it.* `.qf-row-active` and
      `.qf-row-selected` are styled **identically** — both
      `background: var(--accent-soft)` with `border-left-color: var(--accent)`
      — and quiet.css says so out loud: the selection is "the cursor's iris
      treatment stretched over the run". So every selected row looks exactly
      like the cursor row, and the cursor's position within the range is
      unreadable. That matters because the cursor is what `c` anchors the
      composer to and what plain `j` collapses back to.
      *Fix is visual, not behavioural:* give the cursor row one distinguishing
      mark that survives being inside the selection.
- [ ] 🟡 **Code selection chips, usable by both the ask and the composer** —
      Cursor-style chips naming the code a request carries, attached to the
      input rather than implied by where it opened. Today the ask note has a
      one-line context chip (`askTargetLabel`, e.g. `fuzzy.ts:12–15`) and the
      composer has a range header (`Lines 12–15`); neither is removable, and
      neither can carry more than one region.
      *What chips would add:* several regions in one request, dropping one you
      did not mean, and the same vocabulary in both surfaces.
      *What to decide:* whether multi-region is real scope or feature creep,
      given a comment can only ever post to **one** contiguous range on one
      side. Chips make sense immediately for the ask; for the composer they
      may promise something the hosts cannot accept.
- [ ] 🟡 ❓ **Revisit: should the ask and the comment composer be one surface?**
      — decided *no* on 2026-08-08 on the grounds that posted threads, pending
      comments and AI answers are three deliberately distinct materials, and
      putting a machine answer one tab away from a button that posts to the
      host spends that separation. The owner is asking again, so it is reopened
      rather than treated as settled.
      *What has changed since:* the multi-line selection bug that motivated the
      original proposal turned out to be in the selection walk and is fixed
      (#232), so the strongest practical argument for merging is gone. What
      remains is the ergonomic one, which is real: two inputs, two hotkeys and
      two skins for "write something about these lines".
- [ ] 🟡 **Commercial use — say plainly what a company may do** — the licence
      is FSL-1.1-Apache-2.0 and the README explains it correctly ("read it,
      build it, change it, use it internally… the one thing you may not do is
      ship a competing product"), but nothing on the site answers the question
      a company actually asks before expensing anything: *may we use this at
      work, and do we need a licence per person?* Today that answer exists only
      in a licence file and in the team-tier email line.
- [ ] 🟢 **Feature catalog** — the landing page argues a thesis and shows three
      loops; there is no page that simply lists what the app does. That is the
      page people link to, search, and check before downloading, and it is also
      what a "what's changed since I last looked" visitor wants.

---

## Inbox (2026-08-07)

- [ ] 🟡 **No in-app way to say "I already bought this"** — the only licensing
      surface in the app is `PurchasePrompt`, and it returns `null` unless the
      state is exactly `trialExpired`. A fresh install is `Trial { days_left:
      30 }`, so a customer who **bought on the website and then downloaded the
      app** sees nothing about licensing at all for a month, and `mod+k` has
      no license command of any kind — not "activate", not "check my license",
      nothing. They have paid and the product offers them no way to say so.
      Their receipt link is not a fallback either: `/activate` is keyed by a
      checkout index with a **48-hour** TTL, so anyone who installs a few days
      later finds it expired, and `/restore` is still a 501 stub.
      *What the buy-flow fix does and does not cover:* the OAuth callback now
      returns the activation screen for a subject that already owns a license
      (PR #212), so signing in at nodreview.com/buy **does** re-activate them
      correctly. The gap is purely discovery — nothing in the app tells them
      that, and during trial there is no affordance to find.
      *Shape:* a `mod+k` command ("Activate my license" / "Check my license")
      that works in **every** license state, not just expired, wired to the
      existing `activate_license` command — the loopback listener and the
      token verification are already built and need no changes. Consider also
      showing licence state somewhere permanent so "check my license" has an
      answer, and revisit whether `PurchasePrompt`'s `trialExpired`-only gate
      is still right once a palette entry exists.
- [ ] 🟡 **Copy voice sweep: desktop, and hold the line on the web** — PR #188
      removed every em dash from the *site* copy because the dash-heavy rhythm
      reads as generated text. The desktop app was never swept: 31 strings in
      `apps/desktop/src` and 4 in user-facing Rust errors (`activation.rs`
      "Activation is already waiting in another window — finish checkout
      there", `update.rs` "This release is outside your update window — get a
      license…"). Rewrite the sentences rather than swapping the dash for a
      comma; the construction is the problem, not the character.
      *Shipping in PRs #216 (labels, hints, empty states) and #217 (failure
      messages).* Counted properly while doing it: an earlier estimate of ~49
      and ~12 counted doc-comment lines, which never render, and machine-facing
      strings like the `[truncated — …]` markers fed to the model.
      *Scope:* strings a user can read — JSX text, toasts, command palette
      descriptions, `Err(String)` messages that surface in the UI, and the
      Worker-rendered purchase pages under `apps/web/functions`. **Not** code
      comments (#188 explicitly kept theirs, they never render), **not** this
      backlog, and not commit messages or PR bodies.
      *Sample text counts too:* placeholder and demo strings shipped as
      product surface should read as something a person wrote for this app,
      not as filler.
      *Guard:* [Check 9 in the pr-validity skill](../skills/pr-validity/SKILL.md)
      catches new instances in review, so this item is the existing debt only.

---

## Inbox (2026-08-08)

Nine items raised by the owner. Each was checked against the code before being
written down, and where the check contradicted the report that is recorded
here rather than quietly fixed — the three AI-setup items and the ask-hotkey
item in particular are worth reading together, because they are one dialog and
one interaction, not seven separate defects.

### Site

- [ ] 🟡 **Landing videos stutter the scroll** — the three `FeatureShowcase`
      loops make scrolling feel heavy. **The format is not the problem and GIF
      would be a downgrade** (no interframe compression, no hardware decode, a
      256-colour palette, and roughly 10× the bytes for the same seconds) — the
      problem is resolution. `apps/web/public/landing/*.webm` are VP9 at
      **2304×1440 @ 30fps**, and `global.css` renders them in a frame that
      reserves **1152×720**. That is 2× per axis, so ~4× the decode work per
      frame, and `FeatureShowcase.astro`'s observer plays every video whose
      0.25 threshold is met — on a tall viewport that is two or three decoders
      running at once, on the same thread that is compositing the scroll.
      *Fix, in order of payoff:* re-encode at the display size (1152×720, or
      1536×960 if 1× looks soft on retina) and drop to 24fps; then play **one**
      video at a time (highest intersection ratio wins) instead of every
      intersecting one; then give the frame its own compositing layer so a
      playing video never repaints the page around it. The capture pipeline is
      `pnpm capture:landing`, so the encode settings belong in that script, not
      in a one-off re-export that the next capture silently reverts.
      *Measure before and after* — this is a "feels laggy" report, exactly the
      class the perf post-mortem in § performance-architecture says to answer
      with numbers.

- [ ] 🟢 **README banner and badges should lead to the site** — the banner
      image at the top of `README.md` is a bare `<img>`, and the two shields
      point at the Releases page and `LICENSE.md`. GitHub is where most people
      meet the project, and the top of the page currently sends them anywhere
      except the product. Wrap the banner in a link to
      `https://nodreview.com`, and point the release badge at
      `nodreview.com/downloads` (which already picks the right build) rather
      than the raw releases list. The text link row underneath already does
      this correctly and does not need touching.

### Distribution

### Design system

- [ ] 🟡 **Buttons read as generic, and radius is untokenized** — two asks in
      one, and the second is the blocker for the first. `quiet.css` has **no
      radius token at all**: ~60 hand-written `border-radius` declarations
      spread across `4 / 5 / 6 / 7 / 8 / 10 / 12 / 14 / 999px`, several of them
      differing by a pixel for no reason anyone can now reconstruct. "Reduce
      the radius everywhere" is therefore a 60-site sweep with no single knob,
      which is why it has not happened.
      *Do it in two steps.* First a **pure refactor**: introduce a radius scale
      (`--r-sm` / `--r-md` / `--r-lg` / `--r-pill`), map every existing value
      onto its nearest step, and change nothing visually — the 1px variants
      collapse into their neighbours and that is the whole point. Only then is
      "tighter everywhere" one edit to four numbers, and reversible in one
      commit.
      *The button half is a design question, not a CSS one*, and needs a
      decision before code: `.q-btn` today is 8px radius, 600 weight, 13px,
      `7px 13px` padding, with four variants. Generic is a fair reading. Take
      it to `apps/design-lab` and confirm a direction against real screens
      before touching the app — this is the most visible surface in the
      product and the least testable, so it earns a mock first.

### Ask about code

The next four are one feature. `ai-setup-dialog.tsx` is a 285-line dialog that
was built for the first-run case and never revisited for the configured one,
and `a` opens a surface the composer already almost is.

- [ ] 🟡 **The setup dialog has the wrong shape once a key is saved** — with a
      key stored, `AiSetupDialogContent` still renders the first-run form:
      "Save & load models" is the primary button, the model `<select>` does not
      appear until you press it, and the key input sits there as an empty
      password field captioned "Key saved. Paste to replace." Nothing in that
      layout says *configured* — reopening the dialog to change a model means
      re-running a save you did not want.
      *Shape:* branch on `info.configured`. Configured state shows the provider
      and a **saved-key affordance that reads as a fact, not an input** (masked
      value or a "Key saved · Nexos AI" row with Replace and Remove beside it),
      loads the model list on open rather than on a button, and makes the model
      picker the primary control. First-run keeps today's flow. **Decide when
      building** whether "Replace" swaps the row back into an input inline or
      opens a second step — inline is fewer surfaces and is the recommendation.
      *Constraint that must survive:* the key is write-only from the frontend
      (the backend never returns it) and saving with an empty key deliberately
      keeps the stored one, so "show it as added" can never mean showing the
      key. A provenance line — provider, model, and that a key exists — is the
      honest version of the ask.

- [ ] 🟢 **The model picker should accept typing** — it is a bare `<select>`
      over whatever `aiListModels` returned. OpenRouter alone lists hundreds,
      the ordering is the provider's, and a model that the endpoint does not
      enumerate cannot be chosen at all. Make it a combobox: type to filter,
      Enter to pick, and accept a free-typed id that is not in the list (the
      backend already stores `model` as a plain string, so nothing downstream
      cares). Reuses the input-plus-listbox pattern
      `watch-repos-dialog.tsx` already implements, so this is composition, not
      a new primitive. Note §8 closed shadcn out — a combobox is one of the
      three primitives that section names as a legitimate reason to revisit,
      but only if hand-rolling this one turns out to be expensive.

- [ ] 🟡 **Dialog keyboard behaviour should be one shared pattern** — the ask
      here was "focus should work the same as watched repos", and it is a
      correct read of a real inconsistency. `watch-repos-dialog.tsx` has a
      worked-out model: `useArmedRing` over an explicit arm order, Tab cycling
      actions, arrows moving the selection, Enter acting on whatever is armed,
      and a footer hint bar that **names the current Enter action**
      (`armedActionLabel`). `ai-setup-dialog.tsx` has none of it — Escape, and
      then the browser's own tab order. `issue-tracker-dialog.tsx` is worth
      auditing in the same pass.
      *This is the item to build first of the four*, because it is where the
      "design or something where this dialog UX is saved and used everywhere"
      instinct is right: extract the armed-ring + hint-bar shell out of
      `watch-repos-dialog.tsx` into a reusable dialog pattern, then adopt it in
      the AI dialog. Doing it in the other order means writing the AI dialog's
      keyboard handling twice.
      *Do not extract speculatively* — two consumers is the threshold, and the
      knip rule in `skills/split-pr/SKILL.md` will reject a shell nothing uses,
      so the extraction and its first adoption ship in one PR.

### Code navigation

- [ ] 🔴 **`mod`+click should go to the definition, VS Code style** — today it
      steps to the next textual occurrence. The ask is the semantic version:
      click a token, land on where it is *defined*; click the definition, get a
      peek listing where it is *used*, with snippets. **This is
      [§9 layer 3](#9-repo-store--local-repo-content-re-decided-2026-08-23-tarball-layers-decided-2026-07-12) arriving
      as a user request rather than a hypothesis** — that item already specs
      "go-to-definition from the diff (peek popover → full-file modal at line),
      find references for a changed symbol" and gates it on "only build if beta
      users live in `shift+v` / repo search". Treat this as the demand signal
      that gate was waiting for, and build the two as one thing.

      *Borrow, do not build.* Parsing is the easy half and tree-sitter already
      covers it. The expensive half is **resolution** — deciding which `foo` a
      given `foo` refers to — which is per-language, effectively endless, and
      exactly where a from-scratch attempt dies. Three borrowable stacks, in
      ascending cost:

      1. **tree-sitter tag queries (`tags.scm`)** — ships with most grammars
         and yields definitions and references by name. Search-based rather
         than semantic, so it will sometimes offer you two `handleClick`s and
         make you pick. Runs in milliseconds over repo-store reads at the head SHA and
         needs nothing installed beyond the git the store already requires.
         **This is the stack GitHub's own code navigation runs on**, and its
         imprecision is evidently tolerable at that scale.
      2. **A precomputed SCIP / LSIF index** — exact, but produced by CI *in
         the repo being reviewed*, so it exists only for projects that opted
         in. Fine as an enhancement when present; a non-starter as the primary
         path.
      3. **Real language servers** (rust-analyzer, tsserver) driven over a
         worktree the store can materialise at the SHA — exact, and zero
         per-language work for us. But it needs the
         toolchain present on the user's machine, spends minutes and gigabytes
         indexing a large repo, and puts a process supervisor in the Rust
         backend. That contradicts "instant", and it would make Nod the first
         thing in this product that requires you to install something else.

      **Recommendation: (1), with (3) explicitly rejected for v1.** Revisit (2)
      only if a real repo turns up with an index already published.

      *The gesture is the contentious part, not the index.* `mod`+click meaning
      "next occurrence" was a deliberate call
      ([Inbox 2026-07-21](#inbox-2026-07-21)) reached after a plain click doing
      two jobs proved to be the bug. Making it semantic changes a shipped
      gesture, so: **definition wins when one is known, and occurrence
      navigation stays the fallback** — unsupported languages, unresolved
      symbols and plain prose then degrade to exactly today's behaviour instead
      of dead-ending. `n`/`p` keep meaning occurrences either way.

      *Note the peek surface is the blocker nobody has costed.* There is no
      floating primitive in the app, and a references peek with snippets is a
      popover — which [§8](#8-shadcnui--closed-decided-against-2026-08-05)
      names as one of the three primitives that legitimately reopen the shadcn
      question. Decide that before the index work, not after: it is the part
      that can turn into a second design language.
- [ ] 🟡 **`shift+j` dead-ends at every side boundary, which reads as "ask can
      only cover one line"** — reported as an ask-about-code bug ("`a` can only
      ask about ONE line, you cannot grow a range with `shift+j`/`shift+k`").
      *The ask path is not the bug.* Where a range exists, `a` ships all of it:
      `selectionContext` in `src/lib/ask-context.ts` joins every row between
      `fromItem` and `toItem`, `askTargetLabel` renders `src/lib/fuzzy.ts:2–4`,
      and the `ai_ask` payload carries the joined lines. Pinned end to end by
      "a shift+j range asks about every selected line" in
      `apps/desktop/e2e/ai-ask.spec.ts` (PR opened with this entry).
      *The real cause is the fat cursor.* `adjacentSelectableAnchor`
      (`src/lib/review-items.ts`) steps over comment blocks but **stops dead**
      on the first row whose `target.side` differs, so a deleted row is a wall
      in both directions. On the standard replacement hunk —
      `ctx` / `-old` / `+new` / `ctx` — that leaves exactly one row per hunk
      from which `shift+j` does anything:

      | cursor | `shift+j` | `shift+k` |
      | --- | --- | --- |
      | `ctx` above the deletion | nothing (next row is `LEFT`) | — |
      | `-old` | nothing (next row is `RIGHT`) | nothing (prev row is `RIGHT`) |
      | `+new` | grows into the trailing `ctx` | nothing (prev row is `LEFT`) |

      Verified against the e2e fixture: from `RIGHT:1` and from `LEFT:2` in
      `src/lib/fuzzy.ts`, repeated `shift+j`/`shift+k` leave `.qf-row-selected`
      at 0. Nothing tells the user why, so the whole range feature reads as
      broken, and `a` then falls back to the cursor row — one line, exactly as
      reported.
      *Why it is filed rather than fixed:* the one-side rule is deliberate
      (§5 "one-side, hunk-contiguous fat cursor", and
      `multiline.spec.ts` pins it as "extension never crosses a side
      boundary"), and the range is shared with `c`, so relaxing it changes the
      comment wire payload too. That is a product decision, not a test fix.
      *Shape to decide:* let `adjacentSelectableAnchor` **skip** opposite-side
      rows the way it already skips comment blocks — a deletion must not
      dead-end a range any more than a comment does. The resulting range stays
      contiguous in the side's own line numbers (`RIGHT:1`–`RIGHT:2` across a
      deleted row is new-file lines 1–2), which is what GitHub's own
      `start_line`/`line` pair means, so the payload stays legal. Open
      question is the render: the skipped opposite-side row sits inside the
      highlight and would either paint or leave a gap.
      *Implementation opened as PR #232*, taking the shape proposed above:
      opposite-side rows are stepped over, the range stays one-sided, and the
      submitted payload for a range grown from the first context line is
      `startLine: 1, line: 2, side: RIGHT`. The render question is answered
      there by leaving the highlight continuous, matching how a skipped
      comment block already behaves; tick this item when that merges.
