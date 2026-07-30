# PR Flow — backlog

> **Planning only.** Captures requested improvements as a prioritized, actionable
> backlog. Check items off as they ship.

> **Constraint:** Once the release gate is satisfied, **no new backlog items** may
> be added before five external developers have used the app for one week.

Legend: 🟢 small · 🟡 medium · 🔴 large/involved · ⏸ post-MVP · ❓ open question.

**Context:** This is a product plan, not a feature wishlist. Superhuman didn't win
because Gmail links opened in Superhuman — it won because **once you were inside,
it felt incredible.** Foundational = fast cache, keyboard navigation, pleasant
review flow. Entry friction is optimizable later.

**Avoid:** optimizing the last 5% of entry (Slack link interception) before
validating the other 95% (the review experience inside the app).

---

## The real problem

Not: *"How do I intercept every GitHub link?"*

Yes: *"How do I make opening a PR in PR Flow effortless?"*

For v0.1 users (you + ~5 developers), that's already solved:

```
⌘K → "login" → Enter
```

Or resume where you left off. **No Slack link handling required.**

---

## v0.1 — ship this, then stop

- [x] PR list + cached open
- [x] Keyboard navigation
- [x] **`mod+k` PR search** — primary way to open a PR
- [x] Comment + submit review
- [x] **Resume where you left off**
- [ ] Auto-update (before external users)
- [x] Inbox zero-state

**Not in v0.1:** browser extension, link interception, Universal Links, webhooks.

---

## Backlog tiers

### 🚀 Category 1 — Core product (foundational)

*"Why would someone use this?"*

| Item | Section |
| --- | --- |
| **Resume where you left off** | § flow |
| Cache-first + **perf budget** | § perf |
| Keyboard navigation | § shortcuts |
| **`mod+k` search across PRs** | §6 |
| **New review notification** | § notify |
| Code-first layout + Info tab | § layout |
| Viewed workflow + verdict v1 | §4 |
| Orient banner | § delta |
| PR-level comments in Info + badge | §5 |
| Inbox zero-state | § inbox |
| Remove manual refresh | §7 |
| shadcn Phase 1 | §8 |

### 🏗 Category 2 — Product infrastructure

*"Can people realistically adopt it?"*

| Item | Section | When |
| --- | --- | --- |
| **Auto-updates** | §11b | Before external users |
| CI releases + signing | §11b | With auto-update |
| **Commercial launch** | §11c | After §11c release gate |
| **`prflow://` scheme** | §11a | Stage 2 (simple extension); also §11c purchase activation |

### ✨ Category 3 — Delighters (prove the pain first)

| Item | Section | When |
| --- | --- | --- |
| Simple **"Open in PR Flow"** extension | §11a Stage 2 | After daily-use users |
| Link **interception** + native messaging | §11a Stage 3 | Only if users ask |
| Universal Links / wrapper domain | §11a | Unlikely needed if extension suffices |
| **Repo snapshot (sync layers 1–3)** | §9 | Layer 1 after PR #47; during beta |
| New icon · streaks · celebration · Conversation mode | various | Post-MVP |

---

## Release gate

**Must have before DM'ing five developer friends:**

- [x] Perf budget met
- [x] Keyboard workflow + stable review
- [x] **Resume where you left off**
- [x] **`mod+k` jump to any PR**
- [x] **Auto-updates**
- [x] Inbox zero-state

**Can wait until users complain:**

- Browser extension (any kind)
- Slack / GitHub link interception
- Universal Links · webhooks · AI · GitLab · Conversation mode · icon

**Ship rule:** If five developers use it for a week and **nobody** says *"I wish
GitHub links opened this"*, you've saved weeks of integration work.

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

- [x] 🟡 Dev overlay: `⚡ Last PR open: 84 ms · Last file switch: 4 ms`
- [x] 🟡 Perf regression tests in CI — `find-perf` / `open-perf` / `scroll-perf`
      e2e budgets (repaint counts + median keystroke / warm-open wall clock /
      stall frames), run on Chromium AND Playwright WebKit (the app ships on
      WebKitGTK; Chromium-only budgets hid engine-shaped lag).
- [x] 🟡 **Perf e2e against the production build** — today's budgets run on the
      vite dev server, where React's dev runtime + GC noise inflate numbers
      ~2×. Add a Playwright project that runs the perf specs against
      `vite build` + `vite preview` so budgets reflect what users feel, then
      tighten them (~half the current bounds).
      *Shipped: `chromium-perf-prod` project (CI-gated, `E2E_PROD_PERF` locally)
      builds + previews the app and reruns `find/open/scroll-perf` specs with
      halved budgets; all pass with real headroom (open avg 42ms vs 150ms,
      scroll p95 17ms vs 25ms).*

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

- [x] 🔴 **Replace hand-rolled windowing with react-virtuoso** — its own PR,
      after #18 merges, driven by the existing e2e suite (behavioral + perf +
      page-error guard). Native sticky group headers, variable heights,
      scroll restore, anchoring. Deletes most of the list above and removes
      two ceilings: the 30k-row pre-mount cap and DOM memory scaling with PR
      size; find/scroll costs become viewport-bounded by construction.
      (CodeMirror 6 per file was considered and ruled out: purpose-built but
      a much deeper integration for marginal gain over virtuoso here.)
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

## Flow & navigation — resume first

```
Continue reviewing · Repository X · PR #431 · File 8 / 17
```

No inbox. Just continue.

- [x] 🔴 **Resume where you left off** — default app open.
- [x] 🟡 Auto-advance to next review-requested PR after submit.
- [x] 🟡 **`Esc` → inbox** — exception, not home.
- [x] 🟡 **Inbox forgets last tab across app restarts** — `inboxTab` was never
      persisted (hardcoded default on every store init); `Esc` already left
      it alone in-memory, so only a full restart lost it. Fixed by mirroring
      the existing `loadLastRoute`/`saveLastRoute` pattern for `inboxTab`
      (PR #72).
- [x] 🟢 **Land on first non-empty inbox tab** — on cold start, if the active
      tab is empty, a one-shot effect jumps to the first tab with content;
      gated on the query's real loaded state so it fires once per session and
      never fights a deliberate visit to an empty tab later (PR #72).

---

## New review notification (stronger than link interception)

Don't wait for Slack links. **The app is where reviews begin.**

When polling finds a new review request:

```
🔔 New review requested

Fix authentication race condition

Press Enter to open
```

Users may never need to click a GitHub link. Pairs with existing 60s polling —
no webhooks required for v1.

- [x] 🟡 **In-app notification** for new review requests — keyboard-dismissable,
      Enter to open. Desktop notification optional later.
- [x] 🟡 **Badge / inbox highlight** for unseen PRs.

---

## Opening a PR — ranked by stage

### Stage 1 — first users (v0.1) ✅

| Method | Flow |
| --- | --- |
| **`mod+k`** | `⌘K → "123" or "login" → Enter` — under a second, no mouse |
| **Resume** | App opens → continue last PR |
| **Inbox** | `j`/`k` + Enter |

Coworkers paste GitHub links in Slack? **Fine.** User copies PR number or title
into `mod+k`. Keyboard-heavy developers may find this *faster* than mouse →
Slack → browser → app.

### Stage 2 — daily users (after v0.1, if needed)

Simple browser extension — **not interception**. ~10% of interception effort,
most of the value:

- **"Open in PR Flow"** button on GitHub/GitLab PR pages (content script)
- Toolbar button + context menu ("Open in PR Flow")
- Calls **`prflow://pr/owner/repo/123`** — register scheme in Tauri app

No native messaging. No auto-intercept. Easy to build and test.

- [ ] 🟡 **Stage 2 extension** — content script + toolbar + `prflow://` handler.
- [ ] 🟡 **Self-hosted GitLab** — user-configurable host patterns in extension.

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

## Orient in 2 seconds

One line when relevant: *"2 files changed."* / *"3 new commits."* — skip when N/A.

- [x] 🟡 Orient banner on PR open.

---

## Inbox zero-state

- [x] 🟢 *"Inbox zero — no review requests"* + recent / waiting state.

---

## PR view layout — code-first

**Code** (default) ↔ **Info** (description + PR comments) via **`Tab`**.

- [ ] 🟡 Code-first · Info tab · comment badge.
- [ ] ⏸ Conversation mode (third Tab).

---

## Full-file context expansion (in place, not a dialog)

Diffs are tunnel vision: one added `if` in a file that already has five reads
very differently from the hunk alone. The fix is a per-file *context dial* on
the existing `FileSection`, not a separate full-file surface (a dialog was
tried on `feat/full-file-modal` and dropped 2026-07-15 — reintroduce only as a
cross-file "peek" for go-to-definition, if ever).

**UX:** a hotkey (`shift+v` is free again) expands the active file in place —
context rows synthesized from the head blob fill in between hunks, **scroll
anchored so the line you were reading does not move**. You can then scroll
above/below the hunks within the file; diff marks stay lit inside the full
file, expanded context renders at reduced ink so changes still pop. Same
hotkey collapses.

- [x] Row synthesis: patch rows + head-blob context rows reusing `DiffRow` +
      `SIDE:line` anchors (GitHub "expand context" taken to its limit).
      Find/occurrences/cursor/ruler ride the row stream unchanged — see
      "Code view" in ARCHITECTURE.md. (`src/lib/expand-file.ts`,
      `useFileExpansion`, shipped 2026-07-15.)
- [x] Comment affordance hidden on synthesized rows (GitHub API only accepts
      patch lines; GitLab 400s on far context lines) — synthetic rows carry an
      anchor but no target.
- [x] `shift+v` toggles; header button ("Full file" ↔ "Diff only") always
      visible, its ⇧V chip revealed on header hover / active file (like the
      inline-comment affordance). Scroll anchored through the swap on the
      **cursor row** (fallback: first visible row) via pre-paint scrollTop
      deltas — never the virtualizer's estimated scrollToIndex — then held a
      few frames against re-measure; the anchored row flashes as the "you are
      here" cue.
- [ ] ❓ Open: does expanding lock j/k / scroll into the file, or stay part of
      the continuous scroll? Shipped continuous (fewer modes; matches "review
      pane is one scroll"); revisit after using it.
- [x] 🟡 **Full file view broken on GitLab** — `shift+v` full-file expansion
      failed on every GitLab PR. First pass (PR #70) stripped a
      `--- a/path`/`+++ b/path` header pair GitLab was assumed to always
      prefix onto each file's `diff`; that wasn't the real bug (confirmed via
      logging that most files never carry that header) and full-file
      expansion still failed. Actual root cause: GitLab's diff text puts a
      stray zero-length line between hunks (and/or a trailing one after the
      last hunk); `parsePatchUncached` in `src/lib/diff.ts` treated any
      non-`+`/`-`/`\` line as a context row, so that blank separator became a
      phantom context row with empty content one line past the hunk's
      declared range — failing `expand-file.ts`'s row-by-row blob validation.
      Fixed by skipping zero-length split lines in `parsePatchUncached`; a
      real blank source line is always a lone space (`" "`), never truly
      empty, so this is safe for GitHub patches too.

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
| **`b`** | Toggle file tree |
| **`q`** / **`w`** | Next / prev comment thread |
| **`c`** / **`shift+c`** | Comment on the cursor line / on the PR |
| **`x`** / **`shift+e`** / **`z`** | Resolve · edit your comment · expand/collapse thread |
| **`shift+d`** | Discard the pending comment at the cursor |
| **`i`** / **`shift+i`** | Toggle info panel / widen it |
| **`o`** / **`y`** / **`mod+shift+c`** | Open on host · copy PR link · copy file path |
| **`s`** | Submit review |
| **`mod+t`** / **`mod+r`** / **`mod+f`** | Find a file · search code · find in diff |
| **`n`** / **`p`** | Next / prev occurrence (only while one is selected) |
| **`mod+k`** | **Jump to PR** + commands |
| **`Esc`** | Clear selection → close find → close panel → inbox |
| **`mod`+click** on a word | Next occurrence of it (previous, on the last) — marks it first if nothing is marked |

> Shipped keys, verified against `review-screen.tsx`. `Tab` cycles files;
> the proposed Code ↔ Info toggle therefore needs a different key — see
> § layout.

---

## 6. Command palette — search across PRs

Primary navigation. Inbox optional.

```
⌘K → "Fix login" → Enter
⌘K → "123"       → Enter
⌘K → "john"      → Enter  (author)
```

- [x] 🔴 **`mod+k` PR search** — v0.1 blocker.
- [x] 🟡 PR-context actions — after search works.
- [ ] 🟢 **Branch name not visible in index/search** — PR branch name doesn't
      show in the inbox list or `mod+k` search results.

---

## 4. Review workflow

- [x] 🟢 **`e`** (viewed + next) · **`v`** (toggle viewed) · files via **`n`** / **`p`**
- [ ] ⏸ Persist pending comments — post-MVP; flaky local drafts worse than none.

### 4b. Verdict v1

Subtle **`8 / 12`** · auto-open verdict when all viewed · no animation · no streaks.

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

- [ ] 🟡 **Hide comments feature** — ability to hide/collapse comment threads
      from the diff view.

- [x] 🟢 Thread hotkeys — `r` reply / `x` resolve on the hovered or
      `q`-focused thread; hints fade in on the thread's own action buttons.
- [x] 🟢 Composer hint-bar toolbar — every entry is a clickable hotkey hint,
      not GitHub's 14-icon strip. (First shipped as markdown-symbol wrapping +
      ⌘⇧P preview; superseded days later by the rich composer below after
      "inserting symbols feels like going back" feedback.)
- [x] 🟡 **Rich composer (TipTap v3)** — WYSIWYG surface, markdown wire
      format (`editor.getMarkdown()` feeds the same API payloads). ⌘B/⌘I/⌘E
      toggle real marks, ⌘K links the selection via an inline url input,
      markdown typing shortcuts (`**bold**`, `- `, ``` ) autoconvert, and the
      suggestion is a real block that round-trips to the ```suggestion fence.
      Pending cards render markdown now (raw body would reintroduce the
      symbols). Watch WebKitGTK contenteditable quirks in the wild.
- [x] 🔴 **Multi-line comment ranges (GitLab-style)** — shipped as specced
      (2026-07-06): `shift+j/k` (+ shift+arrows) grow a one-side,
      hunk-contiguous "fat cursor" from the line cursor; gutter `+` drag
      builds the same range (pointer capture + hit-testing); `Esc`/plain
      movement collapses it; `c` opens the composer under the END row with a
      `Lines 12–15` header; Suggestion prefills every selected row; pending
      cards carry a range chip; wire format is `start_line`/`start_side` on
      GitHub and `line_range` on GitLab. Caveats: GitLab's multiline
      `line_code` is under-documented — the payload is best-effort and falls
      back to a single-line anchor if the host rejects it (verify against a
      real GitLab); existing comments' ranges (`start_line` from the API)
      are not yet displayed on threads — follow-up.

### 5c. Mutation spam safeguards

Resolve/unresolve is fixed (`requestResolveThread` coalesces in-flight toggles
while keeping optimistic UI). Same class of bug elsewhere: composers and submit
already accept `pending` / `busy`, but review screen hardcodes them to `false`,
and several paths call `mutate` with no in-flight guard.

- [ ] 🟡 **Submit review** — wire `submitReview.isPending` to `SubmitReviewModal`
      `busy`; block duplicate submit while in flight (modal closes early today;
      `openSubmit` can reset and re-fire).
- [ ] 🟡 **Reply to thread** — wire `reply.isPending` to `ReviewList`
      `addPending` (currently hardcoded `false`); optional intent coalescing if
      spam remains possible before `isPending` flips.
- [ ] 🟡 **Inline "Comment now"** — wire `addReviewComment.isPending` to
      `addPending`; `handleSecondary` must `await onAddComment` (fire-and-forget
      today lets ⌘↵ double-submit through instantly).
- [ ] 🟢 **Issue comment (Info drawer)** — wire `addIssueComment.isPending` to
      `AddCommentBox` `pending` in `right-panel.tsx` (hardcoded `false`).

### 5d. Comment-management follow-ups (post-comment-feature)

Edit / delete / reply / resolve / unresolve now work end-to-end in **both**
surfaces — inline threads (`comment-thread.tsx`, all five actions via
`review-list.tsx` `MappedCommentThread` callbacks) and the Info drawer
(`right-panel.tsx` add / edit / delete of issue comments; reply/resolve stay
inline by design). These are cleanups, not new scope.

- [x] 🟢 **Dedupe comment-row UI** — the own-guard + Edit/Delete two-step
      confirm block was implemented near-identically twice: `ConversationItem`
      in `right-panel.tsx` and the comment map in `comment-thread.tsx`. Extracted
      a shared `CommentTools` (Edit/`Delete?` buttons, blur/mouseleave disarm,
      confirm state now self-contained) and `CommentBody`
      (`editing ? AddCommentBox : Markdown`) in `comment-item.tsx`; both
      surfaces consume them so the affordance can't drift.
- [ ] ⏸ 🟢 **E2E for reply / resolve / unresolve** — edit and delete are covered
      (`comment-edit.spec.ts`, `comment-delete.spec.ts`, `drawer-comment.spec.ts`),
      but reply, resolve, and unresolve are wired yet unverified by any spec. Add
      inline-thread coverage for all three.

---

## 7. Data freshness

60s polling + refetch on focus. No **`r`** key. No sync UI.

- [x] 🟢 Remove manual refresh.
- [x] 🟡 Banner when open PR changes externally.
- [x] 🟢 **Remove "pull request updated" toast** — **done**; the generic
      "Showing the latest changes." toast is gone from
      `use-review-head-sha-sync.ts`, which is now silent and keeps only its
      perf mark + review-memory write. The update still announces itself
      through the two signals that say something useful: the reconcile toast
      (`unviewedReconcileToast`, names the files that changed) and the
      per-file `updated` chip. Also removes a race — both toasts share the
      store's single slot, so the generic one only won or lost by effect
      ordering.
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
- [ ] ⏸ Webhooks — post-MVP.

---

## 8. shadcn/ui — Phase 1

- [ ] 🟡 `command`, `dialog`, `tooltip` — incremental with MVP modals.

---

## 9. Repo snapshot — sync layers (decided 2026-07-12)

Extend cache-first from "PR metadata + diffs" to **the file tree at head SHA**.
Not a new direction — the existing thesis applied deeper. Tarball download
(one API call, `GET /repos/{owner}/{repo}/tarball/{sha}`), extracted into the
cache keyed by commit SHA like everything else. **No git operations** — the
README promise holds. Converts every future context feature from a project
(fetch + cache + loading state) into a local file read.

Three layers, three separate decision points — only layer 3 is a real bet:

- [ ] 🔴 **Layer 1 — snapshot service** (after PR #47 merges; buildable during
      beta, changes no user-visible surface). Rust background threads: check
      repo size via API first (over ~100 MB → skip, stay on-demand — degrade,
      never block), download tarball on PR open, extract to cache, evict old
      SHAs (keep last N per repo) from day one. Wire the full-file modal
      (`shift+v`, PR #47) to read local-first with fallback to the existing
      `get_file_blob` when the snapshot isn't ready. Ships dark; if the
      snapshot fails the app behaves exactly as today.
      **Perf guard:** snapshot ready < 10 s after PR open; zero impact on
      open / scroll / file-switch budgets (e2e-enforced).
- [ ] 🟡 **Layer 2 — consumption**: whole-repo search (ripgrep-style in Rust,
      ms over the extracted tree) · hunk-context expansion (P11 PR 2) reading
      local files. Each small, each shippable independently. New pushes
      re-download the full tarball (no deltas) — fine at PR cadence.
- [ ] ⏸ **Layer 3 — symbol index** (tree-sitter): go-to-definition from the
      diff (peek popover → full-file modal at line), find references for a
      changed symbol. ~50–100k lines/sec/core to parse, index cached per SHA,
      incremental via file-hash diff against the previous snapshot. **Only
      build if beta users live in `shift+v` / repo search** — the sync
      decision does not commit to this. Explicitly navigation, not AI: no
      embeddings, no LLM anywhere.

Ruled out: real git clone (shallow/partial) — efficient deltas + blame, but
breaks "no git operations", needs gitoxide/libgit2 + token-in-transport +
repo-dir management. Revisit only if a feature genuinely needs history.

---

## 11. Distribution & adoption

### 11a. Opening PRs from GitHub/GitLab links — staged

**Raw `https://github.com/.../pull/N` links cannot be OS-hijacked** (you don't
own github.com). Options exist on a **complexity ladder** — climb only as users
prove the need.

| Stage | What | Slack click → app? | Build when |
| --- | --- | --- | --- |
| **1** | `mod+k` + resume + notifications | N/A — don't use Slack link | **v0.1** |
| **2** | Extension: "Open in PR Flow" on PR page | Browser → one click → app | Daily users |
| **3** | Interception + native messaging | Brief flash → app | Users ask for it |

**Stage 2 UX (good enough):** user clicks GitHub link in Slack → lands on GitHub
→ clicks **"Open in PR Flow"** (or toolbar) → app opens. One extra click, ~10%
of Stage 3 effort.

**Stage 3 UX (best for raw links):** click → brief browser flash → app. Only
worth it after validation.

- [ ] 🟡 **`prflow://` scheme** — register via `tauri-plugin-deep-link`; used by
      Stage 2 extension button.
- [ ] 🟡 **Link-open hydration** — when app opens from any source: cache-first
      paint, restore file/scroll/viewed.
- [ ] ⏸ Stage 2 extension (content script + toolbar + context menu).
- [ ] ⏸ Stage 3 interception + native messaging.
- [ ] ⏸ Universal Links / wrapper domain.

### 11b. Auto-updates

- [x] 🔴 Before external users — `tauri-plugin-updater` + CI releases.
      *Shipped: signed feed live since v0.2.0/v0.3.0 releases (minisign, pubkey
      baked into `tauri.conf.json`, `latest.json` + `.sig` on every platform
      asset). See README "Auto-updates".*
- [ ] 🟡 **Don't offer an install CTA on `.deb`/`.rpm`** — Tauri's updater can
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
- [ ] 🟢 **Update install failure on Linux** — user on 0.2.0 saw "Failed to
      install package" from the in-app updater ("You're on 0.2.0. Installs on
      the next restart..." then install fails). Likely the same AppImage vs.
      package-manager install-format mismatch as the item above; investigate.
- [ ] ⏸ Crash reporting — see [July 2026 batch · Sentry](#july-2026-batch).

> Linux does not use this updater. Only the AppImage can self-update, and
> [11d](#11d-linux-install--update-path-2026-07-25) rejects the AppImage as the
> recommended format — Linux updates come from the user's package manager
> instead.

### 11c. Commercial launch

Full plan in [`docs/RELEASING.md` — Commercial launch](./RELEASING.md#commercial-launch).

**Philosophy:** no license keys. GitHub identity is the license. Browser-brokered
activation (`prflow://purchase?token=…`) — Raycast-style **Open Nod** after
checkout. One Cloudflare Worker; MoR (Polar / Paddle / Lemon Squeezy) for
payments and tax.

**Release gate (Phase 0 — free beta):** same as [Release gate](#release-gate)
above. Do not build MoR / Worker / license code until five external developers
have used the app for one week and retention is plausible.

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
- [ ] 🟡 **Phase 1** — Cloudflare Worker (`/purchase-webhook`, `/activate`,
      `/license/:subject`, `/restore`).
- [ ] 🟡 **Phase 1** — `prflow://purchase` deep link + Ed25519 token verify in Rust.
- [ ] 🟡 **Phase 1** — Trial (first-launch timestamp) + purchase prompt UI.
- [ ] 🟡 **Phase 1** — Updater gating on local `updates_until` (static `latest.json`).
- [ ] ⏸ `nod-keygen` CLI for manual/support grants.

#### 11c status — what actually exists (audited 2026-07-30)

Short version: **the server skeleton is real, the purchase flow is not.** Nothing
can be bought today, and the desktop app contains no licensing code at all.

*Built and merged* (`apps/web/functions/`): `purchase-webhook.ts` (Standard
Webhooks verify → `putLicense`/`putOrderIndex`, 1-year term), `activate.ts`,
`license/[subject].ts`, and `lib/license-token.ts` — real Ed25519 sign/verify
with unit tests. `wrangler.jsonc` carries real KV namespace ids.

*Skeleton or stub:* `restore.ts` returns a hardcoded `501 not yet configured`.
`lib/polar.ts` verifies the HMAC correctly but its `metadata.subject` shape is
an **unverified assumption** against a live Polar payload — its own file header
says so.

*Missing entirely — these are the links that make it a purchase flow:*

- [ ] 🔴 **No MoR account, product, or checkout URL.** Nothing initiates a
      purchase; Polar is a signature format here, not an integration.
- [ ] 🔴 **No forge identity at checkout** — nothing puts `metadata.subject` on
      the order, so the webhook has nothing to key a license to. Needs a
      success page doing GitHub OAuth. GitLab (and self-hosted) unsolved.
- [ ] 🔴 **Cloudflare secrets never set** (`POLAR_WEBHOOK_SECRET`,
      `LICENSE_SIGNING_SEED`) — the endpoints cannot run in production even
      though the KV namespaces exist.
- [ ] 🔴 **No `prflow://` scheme / no `tauri-plugin-deep-link`.** `activate.ts`
      today redirects to `http://127.0.0.1:8765/callback`, a loopback port only
      the OAuth flow listens on — the app would never receive the token. Same
      dependency as [11a](#11a-opening-prs-from-githubgitlab-links--staged).
- [ ] 🔴 **Desktop app has zero licensing code.** No `ed25519-dalek`, no token
      verify, no local license storage, no trial timestamp, no purchase prompt,
      no updater gating on `updates_until`.
- [ ] 🟡 **Repeat purchases reset instead of extend `updatesUntil`** — known
      defect, already described in RELEASING.md; fix is
      `max(existing, now) + 1 year`.
- [ ] 🟢 **`/restore` is a stub** — needs `POLAR_API_KEY`.

The landing page (`apps/web/src/pages/index.astro`) is downloads-only and says
"Free while it's an experiment." No pricing, no buy button, no `/pricing` route
— which is consistent with Phase 0, so this is a gap in fact, not in plan.

**Rejected:** deterministic license keys (stateless, simple engineering, ugly UX —
conflicts with zero-friction product goal).

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
the launcher, no MIME/scheme registration for `prflow://`
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

- [ ] 🔴 **One honest recommendation per distro** — README (`README.md:221`),
      release notes and the Phase 0 landing page list `.msi` / `.deb` /
      `.AppImage` flat with no guidance. Replace with a per-distro table:
      Debian/Ubuntu → apt repo, Arch → AUR, Fedora → dnf repo, everything else →
      `.deb`/`.rpm` direct, AppImage last and labelled "portable, slower cold
      start, no desktop integration".
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
      — secret-service (token keychain), browser-open for OAuth, `prflow://`
      registration — plus the updater plugin disabled in that build. Take it once
      Linux users exist in number, consistent with the dogfood-first gate in
      [11c](#11c-commercial-launch).

**Order:** Tier 0 now (docs, a flag, and the notice already queued in 11b) → AUR
(no infrastructure, fixes our own machine) → APT + DNF repos in one pass, sharing
the GPG key → `install.sh` on top → Flathub only after the release gate, and only
if it benchmarks at parity with `.deb`.

**Rejected:** AppImage as the recommended Linux format — self-updating is not
worth the cold-start cost, the missing desktop entry, or the lost `prflow://`
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
- [x] 🟢 **P02** — File-tree active/focus ring persists
      after `r`/`t` when a file was mouse-clicked (blur on click; audit inbox rows).
      *Also covers:* remove `qf-focusable` focus ring on file sidebar buttons.
      File sidebar was already fixed; inbox rows (`pr-list-item.tsx`) now blur
      on click too, since `role="option"` divs otherwise keep the browser's
      native focus outline after a mouse click.
- [ ] 🟢 **P03** — Occurrence navigation blocked while find
      (`mod+f`) is open — explicit handoff (select token → close find → start
      occurrences).
- [x] 🟢 **Next occurrence scroll** — **done** (`07ba9d9`, 2026-07-15);
      `cursorViewLocation` returns null when the row is already in frame, so a
      step to a visible match leaves the viewport alone. Guarded by
      `occurrences.spec.ts` "stepping to an already-visible occurrence does not
      scroll".
- [x] 🟢 **Search pane height** — **done**; `.qsp-panel` carried its own
      `max-height: 70vh`, which overrode the `min(78vh, 640px)` cap every
      other `.q-dialog` inherits — 560px vs 624px at an 800px window, so the
      `/` pane showed one fewer row than `mod+k` for no reason. Dropping the
      one override restores parity. Not a regression, despite the wording:
      both rules date from the initial commit, so the pane never had the
      height. Width stays at 680px (deliberately wider than the palette's
      620px — it carries PR titles plus repo/author meta). Note the trade
      cuts both ways by design: above a ~914px-tall window the old `70vh`
      was the *larger* value, so tall windows now cap lower (640px vs 840px
      at 1200px tall). That is the point — parity with the palette — but it
      is a reduction there, not a pure gain.
- [ ] 🟢 **GitHub org OAuth restrictions** — `[pr-flow] API error 403` when an org
      (e.g. Decodo) enables OAuth App access restrictions; surface a clear
      in-app message with the GitHub docs link and what the admin must allow.

### Wave 2 — quick wins

- [x] 🟢 **P04** — Hotkey for insert suggestion — **done** as `mod+shift+g`
      (`composer-editor.tsx`), not `mod+shift+s`.
- [x] 🟢 **P05** — Comment thread expand/collapse hotkey — **done**; `z` toggles
      the active thread (`review-screen.tsx`).
- [x] 🟢 **P06** — Next/previous diff hunk keybind — **done** a different way:
      `f` / `g` (Fast down/up) cover jumping through the diff.
- [x] 🟢 **P07** — Restore archived (`e`-archived) inbox
      PRs — **done** (archived view toggle + restore).
- [x] 🟢 **`e` skips viewed files** — **done**; `e` walks forward to the next
      unviewed file, wraps past the end to pick up files skipped earlier, and
      stays put once every file is viewed instead of parking on a viewed file
      where the next `e` would unmark it (`review-screen.tsx`).
- [x] 🟢 **Pending comment discard hotkey** — **done**; `shift+d` discards
      the pending comment at the cursor, and the button is no longer a
      transparent outline in `--muted` on `--line-2`: it now carries the
      `--del` wash, a 40%-`--del` border and a `⇧D` keycap hint, matching
      how sibling controls (`Reply` `R`, `Resolve` `X`) advertise theirs.
      The lookup resolves the `comments` block that shares the cursor row's
      anchor, so it works whether the cursor sits on the line or on the
      comment block itself — the common case being "I just added this, undo
      it". Discards the newest pending comment on that anchor.
- [x] 🟢 **Go to next/previous comment** — **done**; `q` / `w` bound in the
      Comments group (`review-screen.tsx`).

### Wave 3 — review surfaces

- [x] 🟡 **P08** — Show approvals / changes-requested in the review header —
      **done**; `ReviewVerdicts` renders two quiet pills (approved / changes
      requested) fronted by reviewer avatars in the header actions
      (`review-verdicts.tsx`), silent until someone casts a verdict.
- [x] 🟡 **P09** — Pipelines / CI status — **done**, split across two
      surfaces: a colour-coded `qf-ci-dot` on the header info button
      (`review-screen.tsx`) plus a clickable `CiPill` (state + check count,
      opens the host's checks page) in the info drawer (`ci-pill.tsx`).
      *Remaining:* the per-check list inside the drawer — see the follow-up
      in § keyboard/review surfaces below.
- [x] 🔴 **P10** — Edit own comments — **done** in both surfaces; see
      §5d, and `shift+e` edits the active thread's comment from the keyboard.
- [x] 🟡 **P11** — View full file at head SHA — **done**, but *not* as a
      modal: `shift+v` expands the file in place with synthesized head-blob
      context rows. See § "Full-file context expansion"; the modal approach
      was tried and dropped 2026-07-15.
- [ ] 🟡 **P12** — "What's new" card on first launch after
      an update (release notes via Rust command).
- [x] 🟢 **Distinct file header** — **done**. Root cause was a collision:
      the file header sat on `--surface-2`, one token away from the hunk
      header's `--surface`, so two near-identical bands competed to mean
      "something starts here". Worse, `.qf-fsec-name` was **12px — smaller
      than the 13px code it introduces**, while 13px is already the
      dominant step in the scale. Fixed structurally rather than with a
      louder colour: header moves up to `--surface-hi` (two steps off the
      hunk header), top rule doubles to 2px `--line-2` since that edge *is*
      the file break, padding 8px → 10px so it reads as a band, and the
      name joins the 13px step — giving a real hierarchy of file 13 >
      code 13 > hunk 11.
- [x] 🟢 **Astro syntax highlighting** — **done**; `.astro` now maps to the
      `xml` grammar in `LANG_BY_EXT` (`highlight.ts`), the same fallback
      `.vue` and `.svelte` already use, because highlight.js v11 ships no
      astro grammar. The template body tokenizes; the `---` frontmatter
      fence stays plain, matching how `.vue`'s `<script>` block behaves.
- [ ] 🟡 **Render SVG previews** — SVG files in diffs show raw markup instead
      of a rendered image preview.
- [x] 🟢 **Approvals indicator tooltip** — **done**; the P08 verdict pills
      now use the app-wide `<Tooltip>` instead of a native `title`, matching
      the rest of the header. The pill stays a non-focusable `<span>`
      deliberately — it reports state and has nothing to activate, so a tab
      stop would buy nothing in a keyboard-first app — and the reviewer list
      it used to expose via `title` is preserved for assistive tech with an
      `aria-label`.
- [ ] 🟡 **Per-check list in the drawer** — P09 follow-up: `CiPill` links out
      to the host's checks page; list the individual checks inline instead.
- [ ] 🟢 **File tooltip positioning** — the file-path tooltip is centered on
      the row; consider anchoring it near the filename's end instead (keep
      the large click target).
- [x] 🟢 **Info drawer author avatars** — **done**; discussion rows render
      `<Avatar>` per comment author (`right-panel.tsx`).
- [x] 🟢 **Copy comment text** — **done**; `CommentTools` grew a Copy
      button with the same "Copied" feedback the suggestion card uses, so
      both surfaces (inline threads and the Info drawer) get it from one
      change. Copy is offered on **every** comment, not just your own: the
      ownership gate moved off the two call sites onto the Edit/Delete
      handlers, which is also what the shared component's contract already
      implied (Edit and Delete self-hide when their handler is `undefined`).
      Extracted `copyTextToClipboard` to `src/lib/clipboard.ts`, replacing
      the private copy in `review-screen.tsx`.
- [ ] 🟢 **Comment text selection is cancelled by the occurrence handler** —
      the other half of the old "Copy comment text" item, and a separate
      root cause: `handleOccPointerClick` (`review-screen.tsx`) calls
      `window.getSelection()?.removeAllRanges()`, and its bail-outs cover
      editable surfaces and non-collapsed selections but **not**
      `.qf-comment-body` — so clicking into a comment kills the caret and
      makes dragging out a selection fight the handler. Fix: add the comment
      body to the handler's early-return target check. (Collapsed-thread
      previews are a second, smaller cause: the text sits inside a
      `<button>`, which the UA stylesheet makes unselectable.)

### Wave 4 — desktop shell

- [ ] 🔴 **P13** — Custom title bar for Linux & Windows
      (frameless + Quiet drag region + window controls).
- [ ] 🟡 **P14** — Responsive / small-window / zoomed
      layout (900 px min, PR header first).

### Wave 5 — bigger bets

- [ ] 🔴 **P15** — File tree: folders, indentation,
      collapse (needs decision: replace flat list vs toggle).
- [ ] 🟡 **P16** — Faster inbox via conditional polling
      (ETag/304 → ~15 s interval); optional activity-aware detail refresh (see
      also §7 GitHub notifications gate).
- [ ] 🔴 **P17** — Apply suggestion as commit (GitLab
      native first; GitHub contents-API path second — needs product decision).
- [x] 🟢 **P18** — Info drawer wide mode — **done**; `shift+i` widens the
      panel, persisted under `pr-flow:drawerWide`.

### Anytime — hygiene & design

- [ ] 🟢 **P19** — Rust line-comment sweep (~25 `//` in
      `src-tauri/src/`).
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
- [x] 🟢 **Rust tests — split into files** — break up large inline `#[cfg(test)]`
      modules into separate test files where it aids navigation.
- [x] **Split-pr skill — PR evidence in description** — skill should attach
      Playwright screenshots / UI evidence to the PR body, not just local
      artifacts.
- [ ] 🟡 **useEffect migration** — full audit below; prioritize quick wins
      (dead/redundant effects) then query adoption. Candidate #2 (bootstrap
      viewed map) shipped on main.

### Keyboard, focus & composer UX

- [x] 🟡 **`Tab` cycles files** — **done**; `Tab` / `shift+Tab` wrap forward
      and back through changed files (`cycleFile`), and the reply collision is
      gone — reply moved to `r` ("reply to the active thread, else next file").
      *Still open:* § layout wants `Tab` for Code ↔ Info, so that toggle needs
      a different key — decide when the Info tab ships.
- [x] 🟡 **Comment threads as cursor stops** — **done** (PR 1 of 2); arrow keys
      and `j`/`k` now step onto a comment block, which arms it for
      `r`/`x`/`z`/`shift+e` and paints the keyboard iris (`--accent-soft` fill +
      `--accent` border, gated on `data-mode` exactly like `qf-row-active`).
      Collapsed threads are stops too — that is the case that matters, since a
      collapsed thread is one quiet line you would otherwise never learn about.
      *How:* a comment block shares its parent row's anchor, so `nav` entries
      gained a `kind` and moved to `navKey`; `navKey(f, a, "row")` is
      deliberately byte-equal to `fileAnchorKey(f, a)`, so every anchor-keyed
      lookup still resolves rows and row rendering needed no change.
      `adjacentSelectableAnchor` steps over comment blocks — a commented line
      must not dead-end a shift+j range.
      *Selection model, not focus:* per DESIGN.md the review list is a
      selection-model surface, so no `tabIndex` was added and the state keeps
      its existing name (`activeThreadRef`). This resolves the P22 question the
      entry used to defer — the answer is "don't add one".
      *Also folded in:* `goToComment` used to center a thread and arm it while
      leaving the line cursor behind, so the next `j` jumped from somewhere
      else entirely and the thread never painted. It now places the cursor on
      the block like every other navigation path, and derives its position from
      the cursor instead of a running `commentIndex` — which deletes that state
      and fixes the old quirk where jumping files or running a find restarted
      the cycle at the first comment in the PR.
- [x] 🟢 **Comment nav moved to `q` / `w`** — was `]c` / `[c`, the only
      navigation verb in the app that was a two-key chord, borrowing a vim
      idiom that means *next hunk* (which is what `f`/`g` does here) and
      needing AltGr on most non-US layouts. `q`/`w` is a free adjacent pair
      following the app's unwritten convention: left key forward, right key
      back, same as `f`/`g` and `r`/`t`. *Fallout:* with no two-key binding
      left, the keycap splitter in `ui/kbd.tsx` was dead — and its only
      remaining effect was mis-rendering `f3` as two caps (`F` `3`), since
      `f3` is not in `NAMED`. Removed, which fixes that.
- [x] 🟡 **`f`/`g` clamps on conversations** — **done** (PR 2 of 2). `f`/`g` is
      `move(±FAST_CURSOR_STEP)` (a fixed 5-entry hop), not a semantic jump, so
      threads being nav stops was *not* enough — a fast jump still flew over
      them 4 times in 5. `clampFastStep` now lands on the first comment block
      strictly between the cursor and the arithmetic landing row: `f` never
      crosses a conversation, it arrives early, and a second `f` continues
      past. Held repeat does **not** clamp — holding means "get me far away",
      and it is the escape hatch in a comment-dense PR. An open composer clamps
      either way; it holds unsaved text.
      *Noted while wiring:* the `f`/`g` bindings discarded the event and passed
      `isRepeat: false` into the mover, so fast scroll never accelerated on
      hold the way `j`/`k` does. `e.repeat` is now threaded through, but only
      to decide clamping — giving `f`/`g` the `j`/`k` acceleration curve is a
      separate behaviour change and was left alone.
- [x] 🟡 **Composer: suggestions** — shipped with the composer toolbar PR:
      Tab indents / Shift-Tab dedents inside code blocks (caret or whole
      selected lines) instead of flipping the batch/now mode, and
      ```suggestion fences highlight live as the commented file's language
      via `suggestion-highlight.ts` — ProseMirror decorations fed by the same
      `highlightLine` (and cache) as the diff. Token spans under a
      non-collapsed selection are skipped: Chromium's native replace across
      decoration spans re-parsed as a bare deletion and ate the first typed
      character over the prefilled (selected) suggestion line.
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
- [ ] 🟡 **PR validity skill** — agent skill to check PR quality: commenting
      patterns, `useEffect` usage, shadcn usage, split-pr gate compliance.
- [ ] ⏸ **Whole-repo context index** — investigate local code index for search /
      navigation / future AI features; aligns with §9 repo snapshot layers 2–3
      (ripgrep search now, tree-sitter symbols later — no embeddings/LLM unless
      users ask).
- [ ] ⏸ **File/code autocomplete in comments** — `@file` / path completion in
      the composer; depends on §9 snapshot or live blob access.

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
| 12 | `components/review-notifier.tsx:71` | Diff-on-data-arrival effect (known-set compare, localStorage persist, toast) | Move to the query layer: `queryClient.getQueryCache().subscribe(...)` pushing notifications into the store. Borderline; defensible as-is since data arrives from a background poll | Med |
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

## Post-MVP backlog

AI · GitLab · Slack integration · streaks · celebration · Conversation mode ·
webhooks · icon · Ultracite · vim jumps · persist pending comments · Stage 3
link interception · Universal Links.

- [ ] ❓ **AI introduction (BYOK)** — bring-your-own-key model so AI features
      "just work" with the user's own key. **Nexos AI is the first key format
      to support**; others (OpenRouter, direct Anthropic/OpenAI) may follow,
      so the seam should be a provider list from day one rather than a Nexos
      special case. **The user picks the model**, not us — a key alone isn't
      enough, since the same key reaches several models at very different
      cost/latency. Conflicts with the current "no AI" go-to-market
      direction — needs a product decision before scoping.
      - **Key storage is a backend concern.** Per the layering rule the
        webview never holds credentials, so the AI key belongs beside the
        host tokens in `accounts`/keychain, with calls made from Rust —
        *not* `fetch` from React. Model choice is plain UI state.
- [ ] ❓ **"Ask questions about the code" — the first AI feature** (2026-07-30).
      The opening surface for [BYOK](#post-mvp-backlog) above: ask a question
      about the PR you're reading and get an answer grounded in the actual
      code, rather than review-writing or auto-summary. Chosen first because
      it is *pull*, not push — it never fires unless asked, so it can't
      degrade the quiet review flow, and it degrades to "no key configured"
      cleanly.
      - **Depends on repo sync.** A question about a diff is unanswerable
        from the diff alone — that is the same tunnel-vision problem
        [§9](#9-repo-snapshot--sync-layers-decided-2026-07-12) and full-file
        expansion already exist to solve. **Layer 1 (snapshot service) is a
        hard prerequisite**; layer 2 (ripgrep search over the extracted tree)
        is what turns "here is one file" into real retrieval. Note this
        finally gives layer 3 (tree-sitter symbol index) a second consumer —
        but do **not** treat that as permission to build it early; the §9
        gate ("only if beta users live in `shift+v` / repo search") still
        stands.
      - **Open questions:** scope of the context sent (open PR only vs whole
        snapshot) and how it's assembled; whether answers cite file/line so
        they land on real code instead of prose; where it lives (⌘K action,
        info drawer tab, or its own surface); and the privacy line — sending
        a private repo's source to a third-party endpoint needs to be
        explicit and opt-in per repo, which is a stronger promise than "no
        git operations" and should be written down before any code.

---

## Suggested build order

### v0.1 (validate the inside)

1. Resume where you left off
2. Keyboard nav + perf budget
3. **`mod+k` PR search**
4. Comment + submit review
5. New review notification (polling-based)
6. Auto-update
7. Inbox zero-state · orient banner

### After five friends use it for a week

8. shadcn Phase 1 · code-first layout · Info tab
9. **Repo snapshot layer 1** (§9) — invisible infra, safe to build while
   friends test; layers 2–3 gated on their `shift+v` / search usage
10. **Listen** — if *"GitHub links"* comes up → Stage 2 extension
11. If still painful → Stage 3 interception

### Explicitly do not build before user feedback

- Link interception · native messaging · Universal Links
- Webhooks · streaks · celebration · Conversation mode · AI

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

- **Subscribed repos**: watch chosen repositories (not just PRs involving you) —
  a fifth inbox source, likely per-account repo picker + polling. Shape TBD.
- **Watch repos spam** — `setWatchedRepos` fires per toggle with no debounce or
  in-flight guard (unlike viewed-map persist). Debounce or coalesce rapid
  watch/unwatch in the repos dialog.

## Tech debt

- [ ] **Split `ReviewScreenInner`** in `review-screen.tsx` into smaller
  components so React Doctor's `no-giant-component` passes without the
  `test-noise` tag ignore in `doctor.config.json` — remove that ignore once done.
- [ ] **React Doctor full-codebase score not 100/100** — run react-doctor
  across the whole codebase and address remaining findings beyond the known
  `no-giant-component` ignore above.
- [x] **E2E hardcodes `Control+…` — macOS-red for every editor shortcut** — the
  Tiptap composer binds `Mod-…` shortcuts (`composer-editor.tsx`), which
  ProseMirror resolves to **Cmd on macOS, Ctrl on Linux/Windows**. The e2e
  specs hardcode `page.keyboard.press("Control+…")`, so they pass on Linux
  CI but silently no-op on macOS — not just submit (`Control+Enter` in
  `multiline.spec.ts`, `composer.spec.ts`, `review.spec.ts`) but the whole
  class: `Control+a/b/i/e/k`, `Control+Shift+g`. Fix: sweep every editor-bound
  `Control+…` press to the platform-agnostic `ControlOrMeta+…` (precedent:
  `release-history.spec.ts:25` already uses `ControlOrMeta+k`). Test-only;
  verified via probes (`Meta+…` works on macOS, `Control+…` doesn't).
  Pre-existing, reproduces on clean `main`. Companion convention, learned on
  PR #76: specs must not use **native caret keys** (`Home`/`End`/`Shift+End`)
  inside the ProseMirror surface — the native caret move races PM's async
  selection sync, so the next keystroke acts on the stale position (CI showed
  `Tab` indenting at the old caret and the decoration skip eating the first
  typed character). Route selection through PM's own keymap (`Mod+a`, typed
  edits at the landed caret) instead; `Home`/`End` also don't move the caret
  on macOS at all, so avoiding them serves both goals.
  *Shipped: all 33 `press("Control+…")` calls across 9 specs are now
  `ControlOrMeta+…`, taking the macOS suite from 10 failed / 161 passed to
  171 passed. The sweep was safe beyond the composer because the app's own
  hotkey layer already treats `metaKey || ctrlKey` as `mod`
  (`keyboard-provider.tsx:98`). The caret-key half needed no work — no spec
  uses `Home`/`End`.*

## Inbox (2026-07-15)

- [ ] **`ctrl+c` copy on click-highlighted word** — copy doesn't fire when a word
      is highlighted via click; investigate editor-level selection handling for a
      better approach (unsure whether to follow a standard here).
- [ ] **Check for updates action** — explicit user-triggered update check.
- [x] **Info comment section design rework** — the drawer composer now
      collapses to a one-line prompt that expands on intent (Esc backs out of
      the composer, then the drawer; drafts survive collapse and the prompt
      advertises them), the PR-level composer no longer offers a Suggestion
      tool (nothing for it to apply to), and the composer footer lost its
      redundant ⌘↵/Esc hint line everywhere.
- [ ] **Theming: CSS file vs Tailwind variables** — is theming really a CSS file
      rather than Tailwind variables? Consider using TW everywhere for better
      optimization.
- [ ] **Command palette "Add comment" item** — add an "Add comment" action to
      the existing `mod+k` command palette (only in PR context). It opens a small
      dialog to quickly scribble a note — skipping the need to comment inline in
      code or open the info drawer and scroll to the comment area.
- [ ] **Hide empty tabs**.

## Inbox (2026-07-18)

- [ ] **Private repos don't show up** — on certain setups (org restrictions,
      token scopes, etc.) private repos may be missing from the list; needs
      manual debugging to find the root cause.
- [ ] **Unfocused-window hotkeys/sidebar stale** — when the app window isn't
      focused, scrolling still works but hotkeys that only surface on
      focus/hover don't appear, and the sidebar's active-file highlight stops
      updating.
- [x] **Tooltips on buttons** — many buttons only have a `title` attribute
      today; add real tooltips. Converted icon-only affordances (find bar,
      right-panel widen/close/jump-to-thread, copy-path/viewed-toggle, CI
      pill, ticket links, inbox watch/archived/tab, header show-files/info,
      branch chips) to the existing `<Tooltip>` component. Left native
      `title` where a visible label/`<Kbd>` hint already shows (composer
      toolbar, thread expand/collapse — by existing design) or where the
      button can be `disabled` (submit-review approve/request-changes,
      find-bar previous/next match —
      disabled elements don't reliably fire the pointer/focus events the
      custom Tooltip relies on) and on file-tree/file-header rows (native
      title for truncated-path overflow, not an action hint).
- [x] **Multi-line comment highlighting is partial** — block comments
      (`/* ... */`) only grey out the first line instead of the whole
      comment, e.g.:
      ```
      /* Head-blob fixtures for full-file expansion (get_file_blob). fuzzy.ts must
      agree with PATCH line-for-line on the new side — expandFileRows validates —
      and carries extra tail lines that only exist when expanded. */
      ```
      Root cause: `highlight.ts` highlights strictly per-line with no
      cross-line grammar state; the existing `COMMENT_CONTINUATION` regex
      only patches continuation lines with a leading `*` (JSDoc style), not
      flowing comments like the one above. Fixed with `markBlockCommentRows`
      (`lib/highlight.ts`) — a per-file pass over a patch's hunks (mirrors
      the existing `guideByRow`/`intraByRow` pattern in
      `review-items.ts`'s `fileRenderMeta`) that records which rows start
      inside an unterminated block comment; `highlightRowHtml` takes the new
      flag and either comments the whole row or splits it at the closing
      marker. Best-effort (ignores string/char literals, resets at hunk
      boundaries) — same spirit as the pre-existing heuristic. Full-file
      expansion's synthesized context rows aren't covered (same limitation
      `guideByRow`/`intraByRow` already have for those rows).

## Inbox (2026-07-21)

- [ ] **Info comment box loses focus, can't type** — the info/comment textbox
      intermittently becomes unfocusable (typing does nothing); seems random.
      On Linux, switching workspaces and back has been observed to clear it.
- [ ] **Pipelines sometimes not visible after GitLab MR update** — CI/pipeline
      status occasionally fails to show up once a GitLab MR receives a new
      update.
- [x] **Clicking a not-fully-visible next occurrence doesn't scroll to it** —
      **done, by removing the gesture rather than fixing it.** A plain click was
      doing two jobs — mark this word, and travel to the next match — and the
      second was what landed half-clipped. First attempt made the click land on
      the occurrence under the pointer, which only moved the complaint ("next
      occurrence doesn't work, cursor stays on the same line"). So navigation
      moved to its own gesture: a plain click only marks and never moves the
      viewport (hover already put the cursor on the row), while **mod+click**
      walks from the clicked word to the next match — or the previous one when
      it was the last — and brings it in with `CURSOR_CONTEXT_ROWS` of slack.
      mod+click resolves the word and its matches from the file rather than the
      current highlight, so it works on any identifier with nothing marked yet,
      and holding the mod key underlines the word under the pointer
      (`useOccLinkAffordance`, via `CSS.highlights`) so the gesture is
      discoverable. Double-click keeps the native selection, painted in the
      accent so a text selection never reads as an occurrence mark.
- [x] 🟢 **`f`/`g` scroll offset and line-clipping** — **done** (`98f2985`,
      2026-07-25). As the root-cause note predicted, both symptoms came from the
      one `cursorViewLocation` branch that parked the target flush against the
      fold with a 4 **px** margin. It now leaves `CURSOR_CONTEXT_ROWS` (4) of
      real rows, measured from a rendered row by `codeRowPx()`, with
      `CURSOR_EDGE_EPSILON_PX` as the separate trigger so a row already
      comfortably in frame still doesn't move. The slack also absorbs the
      half-sliced landing: Virtuoso's item geometry is estimated often enough
      that flush meant the destination row could arrive cut in two. Applies to
      every nudge — `f`/`g`, `j`/`k`, `n`/`p`, and mod+click.
- [x] **Cursor doesn't follow after `e`** — **done**; every file jump
      (`scrollToFile` — `e`, `r`/`t`, Tab, sidebar, file search) now seeds the
      line cursor on the target file's first nav row, so `f`/`g`/`j`/`k` step
      inside the file you landed on.
- [ ] **Merge button in PR view** — add a way to merge the PR directly from
      the review screen instead of switching to GitHub/GitLab.
- [ ] **Multi-line comment highlighting still broken in full-file view** —
      the flowing block-comment fix above (`markBlockCommentRows`) only
      covers `DiffRow`s built from the patch; full-file expansion's
      synthesized context rows (`expand-file.ts`) aren't run through that
      pass, so a block comment spanning into head-blob context still greys
      out only its first line there. Known limitation called out when the
      original fix shipped — needs `markBlockCommentRows` (or equivalent)
      wired into the full-file row synthesis path too.

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

- [ ] 🟢 **Viewing the last file should jump to the first unviewed one** —
      marking the final file in order as viewed leaves you parked at the end
      of the PR; it should wrap to the first still-unviewed file so the
      review keeps flowing. The `e` entry in Wave 2 claims this wrap already
      ships — reproduce first and decide whether this is a regression in `e`
      or the same gap on `v` (toggle viewed), which never wrapped.
- [ ] 🟢 **Inbox `1`/`2`/`3` should address the visible tabs** — the number
      keys currently map to fixed tabs regardless of which ones are on
      screen, so with tabs hidden they jump somewhere unexpected. Bind them
      positionally to the tabs actually rendered. Interacts with **Hide empty
      tabs** (Inbox 2026-07-15) — decide the two together.
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
- [ ] 🔴 **README rework** — the README has grown by accretion and no longer
      reads as an introduction to the product. Rewrite it. Folds in the
      per-distro install guidance already queued in
      [11d Tier 0](#11d-linux-install--update-path-2026-07-25) (`README.md:221`)
      — do that pass as part of this rather than twice.
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
      **Still open (needs a decision):** the two-pane layout, and the
      `MAX_LINES` truncation affordance.
- [ ] 🟡 **Info tab: one comment feed, one comment design** (2026-07-30) —
      code discussions in the Info drawer show no avatar, author or
      timestamp, and sit in a separate list from PR-level comments. Make
      them look like comments, and consider merging the two lists into one
      chronological feed.
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
      - **⚠️ The merged feed is a product decision, not a cleanup.**
        [DESIGN.md](./DESIGN.md) states the split deliberately — Info tab is
        "description + PR-level comments", inline stays in the code view —
        and a single blended stream is close to **Conversation mode**, which
        §layout defers as a post-MVP third tab and the
        [build order](#explicitly-do-not-build-before-user-feedback) says
        not to build before user feedback. Options: (a) unify the design
        only, keep two sections; (b) one feed with threads as a distinct
        entry kind. Prefer (a) first — it removes the complaint's real sting
        (code discussions looking like second-class rows) without spending
        the Conversation-mode decision early.
      - Pairs with **Reply in Info tab** (§keyboard/composer) — a code
        discussion that renders as a real comment is also the surface that
        would carry a reply box.
- [ ] 🔴 **Theme selection** (2026-07-30) — let users pick a colour theme:
      the current **Quiet** default plus **Monokai**, proposed as a
      licensed feature. Blocked on the theming-mechanism decision in
      [Inbox (2026-07-15)](#inbox-2026-07-15) — do that first, it is the
      whole cost of this item.
      - **A theme here is three coordinated layers, not a palette.** (1) the
        ~14 chrome tokens in `src/index.css` `@theme`; (2) the diff add/del
        row tints, which must stay legible *under* find marks, occurrence
        marks, intraline emphasis and the comment iris — the constraint an
        editor theme doesn't have; (3) the syntax palette, currently
        highlight.js `github-dark`, which is a separate stylesheet. Porting
        Monokai means authoring all three, not swapping hexes.
      - **The real blocker: `quiet.css` has ~59 hardcoded colour literals**
        (`rgba(95, 208, 138, 0.08)`, `rgba(255, 112, 136, 0.3)`, …) that
        bypass the token layer entirely. Every one is a place a second theme
        would leak the first theme's colours. Tokenising those is the bulk of
        the work and is worth doing regardless of whether themes ship.
      - **Recommended set — cover distinct axes, not a long list.** Each
        theme is real maintenance (3 layers × every diff state), so:
        **Quiet** (default) · **Quiet Light** · **High contrast** ·
        **Monokai** (high-saturation retro, requested) · **Solarized**
        dark+light (the low-eye-strain pair, and the most on-brief for a
        long-reading review tool) · **Gruvbox** (warm/low-blue — the
        counterweight to Monokai's cool neon). Hold Catppuccin, Tokyo Night,
        Nord and One Dark until asked; they are popular but occupy axes the
        set above already covers.
      - **Recommendation on the paywall: don't gate legibility.** Light and
        high-contrast should be **free** — for some users dark-on-light isn't
        a preference, and a review tool that can't be read in a bright room
        or shared on a projector is broken, not unlicensed. Gate the
        *character* themes (Monokai, Solarized, Gruvbox). "You never pay to
        read, you pay for personality" is both defensible and better
        positioning than a paywalled light mode.
      - **⚠️ Conflicts with the licensing model as designed.** Per
        [RELEASING.md](./RELEASING.md#commercial-launch), a license buys
        **updates** (`updates_until`) with client-side *updater* gating — the
        app itself keeps working, and there is deliberately no DRM. Themes
        would be the first **feature** gate, which needs runtime entitlement
        checks that don't exist and cuts against the "no license keys, the
        app just works" stance. Decide the model before building: either
        accept a second gate, or make themes a free delighter and keep the
        license purely about updates. Note the app has **no** licensing code
        at all today — see [11c status](#11c-status--what-actually-exists-audited-2026-07-30).
- [ ] ❓ **Code-similarity check between the diff and the repo** — flag hunks
      that closely match code already in the repository (duplicated logic,
      copy-paste, a helper that already exists). Open question on shape and
      whether it earns its keep: needs §9 repo snapshot (layer 1) to have
      local files to compare against, and it is a *review-assist* feature,
      which is adjacent to the "no AI" go-to-market direction even if
      implemented as plain similarity matching rather than a model.
