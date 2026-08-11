# Nod — backlog

> **Planning only.** Captures requested improvements as a prioritized, actionable
> backlog. Check items off as they ship.

> **Dogfood status (2026-08-05):** the [release gate](#release-gate) is fully
> satisfied — it shipped, and the freeze it imposed ("no new items until five
> external developers have used the app for a week") has served its purpose and
> is retired. External dogfooding has **not** happened at scale yet: the app is
> in daily use by its author, and the five-developer round is still gated behind
> the commercial launch in [§11c](#11c-commercial-launch). Read every "after
> users tell us" gate below as still binding on *build order* — it is only the
> ban on *writing things down* that is lifted.

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

Yes: *"How do I make opening a PR in Nod effortless?"*

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
- [x] Auto-update (before external users) — shipped; see [§11b](#11b-auto-updates)
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
| Code-first layout + Info drawer | § layout |
| Viewed workflow + verdict v1 | §4 |
| Orient banner | § delta |
| PR-level comments in Info + badge | §5 |
| Inbox zero-state | § inbox |
| Remove manual refresh | §7 |
| ~~shadcn Phase 1~~ (closed — §8) | §8 |

### 🏗 Category 2 — Product infrastructure

*"Can people realistically adopt it?"*

| Item | Section | When |
| --- | --- | --- |
| **Auto-updates** | §11b | Before external users |
| CI releases + signing | §11b | With auto-update |
| **Commercial launch** | §11c | After §11c release gate |
| **`nod://` scheme** | §11a | Stage 2 (simple extension); also §11c purchase activation |

### ✨ Category 3 — Delighters (prove the pain first)

| Item | Section | When |
| --- | --- | --- |
| Simple **"Open in Nod"** extension | §11a Stage 2 | After daily-use users |
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

- **"Open in Nod"** button on GitHub/GitLab PR pages (content script)
- Toolbar button + context menu ("Open in Nod")
- Calls **`nod://pr/owner/repo/123`** — register scheme in Tauri app

No native messaging. No auto-intercept. Easy to build and test.

- [ ] 🟡 **Stage 2 extension** — content script + toolbar + `nod://` handler.
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

**Code** is the app. Description and PR-level comments live one keystroke away.

- [x] 🟡 Code-first · Info surface · comment badge — **done, differently.** The
      spec here was a second *tab* toggled by `Tab`; what shipped is the
      **`i` / `shift+i` info drawer** (`right-panel.tsx`), and it is the better
      answer: a drawer keeps the code on screen while you read the description,
      where a tab swaps it away — and the diff is the thing you came for. `Tab`
      went to cycling files instead, which is the higher-frequency move. The
      comment badge shipped as the CI/comment affordances on the header info
      button. **No key needs reassigning** — there is no Code↔Info toggle left
      to bind, which closes the follow-up the `Tab` item in § keyboard used to
      carry.
- [ ] ⏸ Conversation mode (third surface) — still deferred, and note it is the
      decision the merged-feed half of
      [Info tab: one comment feed](#inbox-2026-07-30) would spend early.

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
- [x] ❓ ~~Open: does expanding lock j/k / scroll into the file, or stay part
      of the continuous scroll?~~ **Closed 2026-08-05: continuous confirmed.**
      Shipped continuous on 2026-07-15 (fewer modes; matches "the review pane
      is one scroll") and the revisit is now due — three weeks of daily use
      produced no complaint about scrolling out of an expanded file, while the
      same period produced plenty of *other* scroll feedback (`f`/`g` offset,
      clipped landings, occurrence scroll). Silence next to that noise is
      evidence. Locking would also have to answer what `r`/`t`/`e` mean inside
      a locked file, which is cost with no demand behind it.
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

> Shipped keys, verified against `review-screen.tsx`. `Tab` cycles files, and
> nothing contends for it — the Code ↔ Info toggle that once wanted it was
> resolved as the `i` drawer (see § layout).

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
- [x] 🟢 **Branch name not visible in index/search** — **done**; the head
      branch now shows in the inbox row meta line and in the `/` search
      results, and the search **matches on it** so you can find a PR by
      branch. The real blocker was backend: `pr_from_graphql` hardcoded
      `head_ref`/`base_ref` to empty strings and `FRAGMENT_P` never requested
      them, so GitHub list PRs carried no refs at all (GitLab already filled
      both). Adding `headRefName baseRefName` to the fragment costs no extra
      request and also unblocks the
      [stacked-PR indicator](#stacked-prs-2026-07-30).

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
      *Also decide when building:* whether the toggle hides **all** threads or
      **resolved only**. Resolved-only is the safer default reading of the
      complaint (resolved threads are noise by definition), but the request as
      given is about the stub line itself, which both kinds leave.

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

- [x] 🟡 **Submit review** — `submitReview.isPending` is now wired to
      `SubmitReviewModal` `busy`. The modal still closes before the mutation
      resolves — that is a **deliberate optimistic flow** (it also calls
      `advanceAfterSubmit()` and surfaces failures as a flash), so `busy` is a
      guard for the reopened-modal case rather than a visible state. Whether
      submit should become awaited is a separate design decision, untouched.
- [x] 🟡 **Reply to thread** — **done**; `addPending` was a single prop
      feeding *both* the reply box and the inline add box, so wiring one
      would have spuriously disabled the other. Split into `replyPending`
      (fed by `reply.isPending`) and `addPending`
      (`addReviewComment.isPending`). The anticipated "intent coalescing"
      turned out to be **required, not optional** — see below.
- [x] 🟡 **Inline "Comment now"** — **done**, but *not* by awaiting: the
      review pass caught that `use-comments.ts` documents these mutations as
      **optimistic by design ("no loading states")**, and awaiting held the
      composer open next to the comment that had already appeared
      optimistically. The actions stay fire-and-forget.
      **`isPending` alone did not fix it either.** A spec that presses ⌘↵ twice
      against a hanging mutation still produced **2** `create_review_comment`
      calls: `pending` is a prop, so it only becomes true after a render, and
      both presses in the same tick pass the guard. `AddCommentBox` now also
      holds a synchronous `inFlightRef`, which is what actually closes the
      window. Guarded by `e2e/double-submit.spec.ts` plus a new
      `hangReviewComment` bridge option and a call counter.
- [x] 🟢 **Issue comment (Info drawer)** — **done**; `addIssueComment.isPending`
      is wired through a new `addIssueCommentPending` prop. The drawer's
      fire-and-forget collapse was deliberately **left alone**: awaiting it
      broke the existing "comment posting is optimistic even when the network
      hangs" spec, which proves the optimism is intended. The `pending` prop
      plus the composer's in-flight lock cover the double-submit risk without
      fighting that design.

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

## 8. shadcn/ui — closed, decided against (2026-08-05)

- [x] 🟡 ~~`command`, `dialog`, `tooltip` — incremental with MVP modals.~~
      **Won't do (owner).** Every surface this was queued for shipped
      hand-rolled and shipped well: `q-dialog` + `useModalDialog` over the
      native `<dialog>`, the `mod+k` command palette, and `ui/tooltip.tsx`
      (which the tooltip sweep then rolled out app-wide). The app carries
      **zero** Radix / shadcn / cmdk dependencies, so adopting them now would
      mean re-theming working components into a second design language rather
      than saving work — the Quiet tokens in `quiet.css` are the design system
      here. `apps/design-lab` keeps shadcn-on-Radix as a **mocking** tool only;
      that is deliberate and does not imply a migration path for the app.
      Revisit only if a genuinely new primitive (popover, combobox, context
      menu) turns out to be expensive to hand-roll — and then as a scoped
      one-component decision, not a phase.

---

## 9. Repo snapshot — sync layers (decided 2026-07-12)

Extend cache-first from "PR metadata + diffs" to **the file tree at head SHA**.
Not a new direction — the existing thesis applied deeper. Tarball download
(one API call, `GET /repos/{owner}/{repo}/tarball/{sha}`), extracted into the
cache keyed by commit SHA like everything else. **No git operations** — the
README promise holds. Converts every future context feature from a project
(fetch + cache + loading state) into a local file read.

Three layers, three separate decision points — only layer 3 is a real bet:

- [x] 🔴 **Layer 1 — snapshot service** — *shipped (PRs #75 store, #113
      fetch/extract; `get_file_blob` reads local-first with host fallback).*
      Original spec: (after PR #47 merges; buildable during
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
      *Status 2026-08-05 — the engine exists, the surface does not.* The AI
      tool loop (#176) implements `list_files`, `read_file` and `grep_repo`
      over the snapshot, so the search AI.md promised would "fall out for free"
      is written and working. But it is reachable **only from inside
      `ai_ask`** — `grep_repo` is *not* in the `invoke_handler` list, so no
      user-facing repo search exists and the free lunch is unclaimed. What is
      left is registering the commands and building the UI, not the search.
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
| **2** | Extension: "Open in Nod" on PR page | Browser → one click → app | Daily users |
| **3** | Interception + native messaging | Brief flash → app | Users ask for it |

**Stage 2 UX (good enough):** user clicks GitHub link in Slack → lands on GitHub
→ clicks **"Open in Nod"** (or toolbar) → app opens. One extra click, ~10%
of Stage 3 effort.

**Stage 3 UX (best for raw links):** click → brief browser flash → app. Only
worth it after validation.

- [x] 🟡 **`nod://` scheme** — **registration done**, via
      `tauri-plugin-deep-link` in `activation.rs` (`watch_deep_links`), shipped
      for purchase activation. *Remaining for this section, tracked by the
      Stage 2 extension item:* only `nod://pr/owner/repo/123` **routing** —
      the scheme understands `purchase` today and nothing else. The
      infrastructure blocker this item represented is gone.
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
activation (`nod://purchase?token=…`) — Raycast-style **Open Nod** after
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
- [x] 🟡 **Phase 1** — endpoint code (`/purchase-webhook`, `/activate`,
      `/license/:subject`); `/restore` still a 501 stub.
- [x] 🟡 **Phase 1** — `nod://purchase` deep link + Ed25519 token verify in Rust.
- [x] 🟡 **Phase 1** — Trial (first-launch timestamp) + purchase prompt UI.
- [x] 🟡 **Phase 1** — Updater gating on local `updates_until` (static `latest.json`).
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
- [x] 🔴 ~~**No `nod://` scheme / no `tauri-plugin-deep-link`.**~~
      **Closed** — `tauri-plugin-deep-link` is a dependency and
      `activation.rs` (`watch_deep_links`) wires the scheme, draining a
      launch URL and listening while running; `activate.ts` is now a success
      page with a zero-click loopback push on port 8766 *and* the deep link as
      the fallback. Note this also satisfies the scheme half of
      [11a](#11a-opening-prs-from-githubgitlab-links--staged) — only
      `nod://pr/...` routing remains there, not the registration.
- [x] 🔴 ~~**Desktop app has zero licensing code.**~~ **Closed** —
      `ed25519-dalek` is a dependency and `license.rs` / `activation.rs`
      (+ their test files) do offline token verify, local license storage, the
      evaluation timestamp, the purchase prompt and updater gating on
      `updates_until`.
- [x] 🟡 ~~**Repeat purchases reset instead of extend `updatesUntil`**~~ —
      **Closed**; repeat purchases now extend the term as specified.
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
- [ ] 🟢 **Fix the "Sublime-style" comment** — `purchase-prompt.tsx` describes
      the model as *"Sublime-style — no countdown, no lock"*, but Sublime nags
      forever and never stops unlicensed users updating. The comment names a
      model the code does not implement; reword it to describe the actual
      deal (unlimited use, patches always, features on a license).

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

- [x] 🔴 **One honest recommendation per distro** — README (`README.md:221`),
      release notes and the Phase 0 landing page list `.msi` / `.deb` /
      `.AppImage` flat with no guidance. Replace with a per-distro table:
      Debian/Ubuntu → apt repo, Arch → AUR, Fedora → dnf repo, everything else →
      `.deb`/`.rpm` direct, AppImage last and labelled "portable, slower cold
      start, no desktop integration".
      *Done for the README as part of the rework below: native package per
      distro in a table, AppImage last and labelled portable/slower/no desktop
      integration, plus a line saying updates mean installing the newer package
      until the repos exist. The apt/AUR/dnf rows land with Tier 1; there is
      nothing to point at yet. Release notes and the landing page still list
      the builds flat.*
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
- [x] 🟢 **P02** — File-tree active/focus ring persists
      after `r`/`t` when a file was mouse-clicked (blur on click; audit inbox rows).
      *Also covers:* remove `qf-focusable` focus ring on file sidebar buttons.
      File sidebar was already fixed; inbox rows (`pr-list-item.tsx`) now blur
      on click too, since `role="option"` divs otherwise keep the browser's
      native focus outline after a mouse click.
- [x] 🟢 **P03** — Occurrence navigation blocked while find
      (`mod+f`) is open — **done**; the handoff is explicit and automatic.
      `useOccurrenceTracking` closes the find bar the moment a new occurrence
      spec commits (`closeFindRef` at `use-occurrence-tracking.ts:177`), so
      selecting a token while find is open hands the marks over instead of
      leaving `n`/`p` fighting two owners. `resolveMarks` still lets find win
      while it holds the query, which is the correct precedence.
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
- [x] 🟡 **P12** — "What's new" card on first launch after
      an update — **done**; `whats-new.tsx` renders the card from the release
      notes on the GitHub release, mounted in `app.tsx` behind the route chrome
      and linking through to the full release history. The
      [release skill](../.claude/skills/release/SKILL.md) now curates those
      notes at tag time so the card shows a real changelog rather than the
      generic placeholder.
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
- [x] 🟢 **Comment text selection is cancelled by the occurrence handler** —
      **done**; `handleOccPointerClick` now bails out on `.md` (every
      Markdown surface, comment bodies included) and `.qf-resolved-snip`
      alongside the editable surfaces. A comment body
      matches neither `.qf-row` nor `.qf-code`, so a click inside one fell
      through to the branch that clears the DOM selection whenever occurrence
      marks happen to be lit — killing the caret. Original text below.
- [x] ~~🟢 **Comment text selection is cancelled by the occurrence handler**~~ —
      *superseded by the entry above, which shipped the fix; this is the
      original diagnosis, kept for history. (It was left as an open checkbox by
      mistake, inflating the open count.)*
      The other half of the old "Copy comment text" item, and a separate
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
- [x] 🟡 **P14** — Responsive / small-window / zoomed
      layout — **done**; the PR header sheds its branch chips below 1100px
      (`.qf-branch` in `quiet.css`), the inbox detail pane drops out below
      900px (`min-[900px]:flex` in `inbox.tsx`) with the toast host reclaiming
      its margin, and the file sidebar already had its overlay mode for narrow
      windows. Zoom rides the same breakpoints because they are `px` against a
      zoom-scaled viewport — 900px at 1.5× behaves like ~600px, noted inline in
      `quiet.css`.

### Wave 5 — bigger bets

- [x] 🔴 **P15** — File tree: folders, indentation, collapse.
      **done** in #112 on the decided terms: tree as the default mode, flat
      list one click away, choice persisted (`nod:fileTreeMode`).
      **Decided 2026-07-30 (owner):** the tree is an *added mode*, not a
      replacement — the flat list stays — and the tree is the **default**.
      Keyboard navigation inside the tree is **explicitly out of scope for
      the first pass and accepted as a known limitation**; `r`/`t`/`Tab`/`e`
      keep walking the flat file order, which is why the tree can ship
      without answering the hard question below.
      *Scoping notes (verified against the code):*
      - `data-file-index` is read via `e.currentTarget.dataset` inside
        `file-sidebar.tsx` only — nesting rows inside folder containers is
        safe. Folder rows must **not** carry `data-file-index`.
      - `revealInList` (`file-sidebar.tsx:92`) is a ref-callback, so a row
        inside a *collapsed* folder never fires it. Collapse state must
        auto-expand the folder containing `selectedIndex`.
      - Needs `src/lib/file-tree.ts` (+ colocated test): `buildFileTree` and
        a `flattenTree(tree, collapsed)` returning rows with a `depth`, with
        the original `files` index preserved so `onSelect(index)` is
        unchanged.
      - Indentation must come from a depth custom property
        (`padding-left: calc(6px + var(--qf-depth) * 12px)`), because
        `.qf-file` has a fixed `width: calc(100% - 12px)` a naive
        `padding-left` would misalign.
      - **Folder collapse must be instant** — no height/`grid-template-rows`
        transition. See the sidebar note in `quiet.css`; that motion was
        removed deliberately.
      - `nod:fileTreeMode` + collapsed-folder state follow the existing
        `nod:drawerWide` localStorage pattern, whose `TODO: extract a
        useLocalStorage hook when a second persisted UI pref lands` this
        finally makes actionable.
      *Open question, deferred not dropped — now owned by its own item below,
      since nothing tracked "keyboard nav in the tree" and this question had no
      home:* once keyboard nav arrives, does a file inside a **collapsed**
      folder stay in the `r`/`t`/`e` cycle? If yes, `e` can advance into a file
      you cannot see; if no, "next file" silently skips changed files. The
      second is worse. Recommendation when the time comes: **keep collapsed
      files in the cycle and auto-expand the folder on arrival** — the cycle is
      about the diff, not the tree.
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
- [x] 🟢 **P18** — Info drawer wide mode — **done**; `shift+i` widens the
      panel, persisted under `nod:drawerWide`.

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
      *Follow-up closed:* this used to note that § layout wanted `Tab` for
      Code ↔ Info. That toggle no longer exists — the Info surface shipped as
      the `i` drawer, so `Tab` keeps files uncontested.
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
- [x] 🟡 **PR validity skill** — **done**; `.claude/skills/pr-validity`
      reviews a PR or branch diff against this repo's conventions (comment
      placement per ARCHITECTURE.md, unnecessary effects, hand-rolled UI,
      naming/placement, perf) and confirms findings before fixing anything.
      Sits alongside `split-pr` and `react-doctor`; the "shadcn usage" check in
      the original wording is moot — see §8, that direction was closed.
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
      count-limited, announced in the launch posts. Anchors the real price
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

- [x] ❓ **AI introduction (BYOK)** — *shipped (#172); kept for history.*
      Original sketch: bring-your-own-key model so AI features
      "just work" with the user's own key. **Nexos AI is the first key format
      to support**; others (OpenRouter, direct Anthropic/OpenAI) may follow,
      so the seam should be a provider list from day one rather than a Nexos
      special case. **The user picks the model**, not us — a key alone isn't
      enough, since the same key reaches several models at very different
      cost/latency. *The "conflicts with our no-AI positioning" caveat this
      item used to carry is resolved:* the owner decided to build (2026-08-03,
      [AI.md](./AI.md)) and the site reframed from "no AI" to **"not rented,
      not bundled"** (PR #201) — BYOK is the position, not an exception to
      it.
      - **Key storage is a backend concern.** Per the layering rule the
        webview never holds credentials, so the AI key belongs beside the
        host tokens in `accounts`/keychain, with calls made from Rust —
        *not* `fetch` from React. Model choice is plain UI state.
- [x] 🔴 **Ask-about-this-code — implementation plan** (2026-07-30).
      *Superseded by [AI.md](./AI.md) and shipped (#172–#177); kept for
      history — the probe findings it called for were run 2026-08-03.*
      Concrete plan for the feature above, now that the provider contract is
      known. **Nexos AI is OpenAI-compatible**, which changes the shape of
      this work: it is a generic integration, not a vendor one.
      *Verified from the Nexos OpenAPI spec (docs.nexos.ai, append `.md` to
      any page for raw markdown):*
      - Base `https://api.nexos.ai`, `POST /v1/chat/completions`,
        `Authorization: Bearer nexos-…`.
      - Standard body (`model`, `messages[{role,content}]`, `temperature`,
        `max_completion_tokens`, `stream`); answer at
        `choices[0].message.content`.
      - `GET /v1/models` returns `data[]` with `id`, `context_length`,
        `pricing`, and an `endpoints[]` — **filter on `chat_completion`** to
        populate the model picker rather than hardcoding names.
      - SSE streaming terminates with `data: [DONE]`. **The chunk shape is
        not documented** — assume standard `delta` only after probing a real
        key; do not ship streaming on an inferred contract.
      - Errors: only `400`/`402` (out of credits)/`500` are documented. 401,
        403 and 429 are **not** — parse `error.message` best-effort, don't
        hardcode statuses.
      *What exists to build on (verified):* nothing AI-related at all — zero
      LLM deps in `package.json` and `Cargo.toml`. And **no settings surface
      exists**; the closest pattern is `issue-tracker-dialog.tsx`, which is a
      `q-dialog` opened from a keyless command-palette binding in `app.tsx`.
      *Recommended shape:*
      1. **Key storage mirrors accounts exactly.** Tokens live in plain JSON
         in the app config dir (`storage.rs`) — there is no keychain today —
         and the webview only ever receives a token-free info struct. Add
         `ai.json` + `has_ai_key`/`set_ai_key`/`clear_ai_key` shaped like
         `commands.rs`'s token trio. **The key must never reach the webview**,
         so the request is made from Rust; a new `ai_complete` command is
         required because every existing `reqwest` client is built with a
         provider auth header baked in.
      2. **Surface: the info drawer as a new mode.** It already exists, is
         already toggled by `i`/`shift+i`, and already renders markdown. A
         popover anchored to a row is the wrong bet — there is no floating
         primitive and the virtualized list makes row anchoring expensive. A
         modal dialog fights the keyboard flow. A toast is the wrong shape
         for a multi-paragraph answer.
      3. **Hotkey: `a` ("ask")** — free in both the review and global scopes,
         adjacent to nothing destructive.
      4. **Selection → prompt.** `LineSelection` carries anchors, not text;
         reuse the `contentByAnchor` walk in `review-items.ts`
         (`appendCommentBlock`) to reconstruct the selected lines, and send
         file path + line numbers + the code.
      5. **Prompt template in settings**, per the owner's ask — which means
         the settings surface is a prerequisite, not a follow-up.
      *Sequencing recommendation:* settings surface + key storage first
      (shippable and useful on its own, proves the Rust seam), then
      non-streaming ask/answer in the drawer, then streaming **only after**
      the chunk shape is confirmed against a live key.
      *Privacy — decided 2026-08-01 (owner):* the standard vendor pattern is
      enough; per-repo opt-in is not a launch blocker. AI features are off
      until the user enables them in settings and pastes their own key, with
      one clear disclosure sentence at that moment ("selected code, file
      paths and line numbers are sent to Nexos AI"). Nothing is ever sent
      silently or by default — pasting the key is the consent act. A
      per-repo allowlist stays as a later hardening step for people
      reviewing client or org code.

- [x] ❓ **"Ask questions about the code" — the first AI feature** (2026-07-30).
      *Shipped (#175–#177); kept for history. Its two open questions were both
      answered: context scope is selection-or-PR with snapshot-backed tool
      retrieval, and the privacy line was decided 2026-08-01 and is now written
      down as [AI.md § Position](./AI.md#position-2026-08-05).*
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

### AI surfaces beyond ask — parked, not planned (2026-08-05)

Three ideas recorded so they stop being re-invented, **none of them scoped**.

*Corrected 2026-08-05:* an earlier draft of this section said all three broke
[AI.md](./AI.md)'s pull-not-push guardrail. That was wrong. The rule governs the
**trigger, not the size of the answer** — each of these would be user-invoked,
which is exactly what pulling means, and none of them needs the position
revisited. See [AI.md § Position](./AI.md#position-2026-08-05). They stay parked
for ordinary product reasons: ask-about-this-code should prove itself first, and
each carries an unresolved design question of its own, noted below.

- [ ] ❓ **Review-by-prompt → inline comments** — point the AI at the PR with a
      prompt (or one of the repo's skills, e.g. `pr-validity`) and have it
      produce findings **as the same inline comment objects you write by hand**,
      which you then accept, edit or discard into your review.
      *Why it's the most interesting of the three:* it reuses the surface that
      already exists — pending comments — instead of inventing an AI panel, so
      an accepted finding is indistinguishable from your own comment by the
      time it reaches GitHub.
      *Why it's parked* — and it is **not** the pull rule, which this satisfies:
      you run it, per PR, per prompt, and it never fires on open. The open
      questions are about trust, not policy: whether AI-suggested comments stay
      visually distinct *after* you accept them (once posted they carry your
      name and your credibility, not the model's), what happens to the ones you
      ignore, and whether a bad batch is cheap enough to discard that the
      feature stays worth invoking. Answer those before scoping.
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

### v0.1 (validate the inside)

1. Resume where you left off
2. Keyboard nav + perf budget
3. **`mod+k` PR search**
4. Comment + submit review
5. New review notification (polling-based)
6. Auto-update
7. Inbox zero-state · orient banner

### After five friends use it for a week

8. ~~shadcn Phase 1~~ (closed, §8) · code-first layout · Info drawer — all
   resolved; kept for the ordering below
9. **Repo snapshot layer 1** (§9) — invisible infra, safe to build while
   friends test; layers 2–3 gated on their `shift+v` / search usage
10. **Listen** — if *"GitHub links"* comes up → Stage 2 extension
11. If still painful → Stage 3 interception

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

- ~~**Subscribed repos**~~ — **shipped, no longer parked.** Watching chosen
  repositories is a real inbox source: `get_watched_repos`/`set_watched_repos`
  + `list_subscribed`/`get_cached_subscribed` commands, `use-subscribed.ts`,
  the repo picker in `watch-repos-dialog.tsx` and a **Watching** tab (which the
  hide-empty-tabs work then taught to keep a keyless palette binding, precisely
  so it stays reachable when empty — which is when you would go there to add a
  repo).
- [ ] 🟢 **Watch repos spam** — `setWatchedRepos` fires per toggle
  (`watch-repos-dialog.tsx:154`) with no debounce or in-flight guard, unlike
  the viewed-map persist. Debounce or coalesce rapid watch/unwatch. *Still
  open, and now a plain bug rather than a parked idea — promoted to a checkbox
  since the feature it belongs to shipped.*

## Tech debt

- [x] **Split `ReviewScreenInner`** in `review-screen.tsx` into smaller
  components so React Doctor's `no-giant-component` passes without the
  `test-noise` tag ignore in `doctor.config.json` — remove that ignore once done.
  *Staged plan (2026-07-30).* The file is ~4,100 lines; the component itself
  is ~995 (2714–3709), and **only the component split moves the metric** —
  stages 1–6 shrink the file, stage 7 shrinks the rule's target. Each stage
  is a pure refactor verifiable by the existing e2e suite:
  1. `src/lib/code-dom.ts` — DOM/word hit-testing + selection-offset family
     (366–578, 3932–4072). No React. Over budget (~350) but a verbatim cut.
  2. `src/lib/review-cursor.ts` (pure half) + fold `buildCommentsByFile` /
     `buildPendingByFile` into `review-items.ts`.
  3. Find → `review-find.ts` + `use-review-find.ts`.
  4. `use-review-hotkeys.ts` — one contiguous ~340-line binding literal;
     over budget and unsplittable without changing the array.
  5. Occurrences — 5a pure module, 5b the two hooks.
  6. Four hook moves, one PR each: list callbacks, thread actions, submit,
     file navigation + resume scroll.
  7. **The one that moves the metric:** 7a `review-skeleton.tsx`,
     7b `ReviewHeader`, 7c `ReviewDiffPane`.
  8. State clusters, then delete the `biome-ignore` and the doctor ignore.
  *Hazards — do not "clean up" while extracting:* `selectLineRef` is
  deliberately created empty and filled in a layout effect (a genuine init
  cycle — see candidate 4 in the useEffect audit, marked won't-do);
  `cursorMoverRefs`/`occNavRefs` are intentionally fresh literals per event;
  the mount-only cleanup effect owns rAF handles from several hooks and must
  move whole or not at all; and the `pendingBoxNudge` layout effect must stay
  after `model` is built in the same render.
  *Do not extract:* `selectLine`/`selectLineRef`, the `buildReviewItems` call
  + `modelRef`, the 20-`useState` block (a "state bag" hook adds an object
  identity per render and reduces nothing), or anything below the early
  return at 3454.
  *Shipped 2026-08-02 (PRs #126–#151, after the apps/desktop move in #124):
  all 8 stages landed as verbatim-move PRs — code-dom / review-cursor /
  review-find / review-occurrences libs, 9 review hooks, and the
  ReviewScreenPending / ReviewHeader / ReviewDiffPane components.
  review-screen.tsx went 4,153 → ~1,000 lines, the
  noExcessiveCognitiveComplexity biome-ignore is deleted (complexity now
  under the threshold), and doctor.config.json dropped the test-noise
  ignore — no-giant-component passes clean. The do-not-extract list held:
  selectLine, the model build, and the 20-useState block stay in the
  component.*
- [x] **React Doctor full-codebase score not 100/100** — run react-doctor
  across the whole codebase and address remaining findings beyond the known
  `no-giant-component` ignore above.
  *Shipped 2026-08-02 (PRs #157–#166): 100/100, no findings (was 46/100 with
  5 errors + 16 warnings). Real fixes: tooltip open-delay redesigned around
  an intent effect (rules-of-hooks + compiler bails), expansion-restore
  timers wired into cancel(), comment resolve-intents in a useState-lazy
  map + a thread-resolved index, versioned localStorage keys with one-time
  legacy migration at store init, RightPanel split into section components
  (395 → 265 lines). Deliberate disagreements scoped in doctor.config.json
  per react-doctor.yml's policy: exhaustive-deps (biome enforces it with
  documented per-site ignores) and the unmemoized-context-value rule
  (covered by the React Compiler).*
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
- [x] **Info comment section design rework** — the drawer composer now
      collapses to a one-line prompt that expands on intent (Esc backs out of
      the composer, then the drawer; drafts survive collapse and the prompt
      advertises them), the PR-level composer no longer offers a Suggestion
      tool (nothing for it to apply to), and the composer footer lost its
      redundant ⌘↵/Esc hint line everywhere.
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
      rebases, but a second diff source). **Recommendation: start as a filter**
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
- [ ] 🟢 **"Author responded" notifications** — `review-notifier.tsx` fires
      only on `reviewRequested` (`data.reviewRequested.prs`), so the app
      announces work arriving but never announces **your** review being
      addressed: the author pushed after you requested changes, or replied to
      your thread. That is the higher-signal event and the one most likely to
      be dropped, because nothing pulls you back. Cheapest item here that
      changes daily behaviour — the polling, the toast and the seen-set
      persistence all exist; this adds a second source to the same notifier.
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
- [ ] 🟡 **Side-by-side diff** — the app is unified-only. Not a killer
      feature, and deliberately listed last: it is **table stakes** whose
      absence is a live objection, especially for renames and refactors where
      unified genuinely reads worse. Worth knowing it costs a real
      architectural conversation — the row stream, cursor, find marks,
      occurrence marks, fat-cursor ranges and comment anchoring are all built
      around one row per line — so this is much bigger than it looks and
      should not be picked up as a quick win.

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

- [x] 🟡 ~~**Drop the Homebrew cask?**~~ — **Decided (owner, 2026-08-08):
      keep it.** Notarization (§11c Phase 1) is the fix; dropping brew is not.
      Kept below because the reasoning is the answer to the next person who
      proposes it.
      Originally proposed to sidestep Apple
      notarization. *Recorded with a correction, because the premise does not
      hold:* removing the cask does **not** remove the Gatekeeper problem. The
      `.dmg` on the Releases page is the same unnotarized build, and a user who
      downloads it hits the same quarantine wall — they just hit it in a dialog
      instead of in a command they pasted. `BREW_INSTALL_COMMANDS` in
      `apps/web/src/lib/site.ts` already ships the `xattr -dr` line for exactly
      this reason, and its own file header explains why splitting the two
      halves hands out a broken install.
      *So the real choice is:* **notarize** (§11c Phase 1, already on the list,
      and the only option that makes either path clean), or **keep both and
      change nothing**. Dropping brew is the one move that costs the smoothest
      install path and buys nothing.
      *If it is dropped anyway* — an owner call, not a technical one — the
      blast radius is `README.md` § macOS, `site.ts`, `downloads.astro`
      (`#homebrew`), the `/downloads#homebrew` link in `index.astro`, the tap
      bump step in the release workflow, and `packaging/homebrew/`. The tap
      repo itself would need a tombstone, not deletion: casks that vanish break
      `brew upgrade` for everyone who already installed.

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

- [x] 🟡 ~~**Fold ask into the comment composer as a tab**~~ — **Decided
      (owner, 2026-08-08): no. The ask note stays its own surface.** The
      separation argument below won: three distinct comment materials is a
      deliberate design, and one tab away from a button that posts to GitHub is
      too close. *What is being built instead:* the multi-line reproduction
      below (🟢, the actual defect the proposal was reaching for) and prompt
      suggestions on the note. Reopen only if the separation stops earning its
      keep in daily use.
      Originally proposed: `c`
      opens the composer on Comment, `a` opens the same composer on Ask, and
      the separate `AskNote` surface goes away.
      *One premise is wrong and it matters, because it was offered as the
      reason to do this:* multi-line ask **already works**. `a` is wired to the
      live selection (`liveSelectionRef` → `useAskNoteWiring`), and
      `selectionContext` in `ask-context.ts` walks `fromItem`..`toItem` and
      ships every row in the range — the chip renders `file:12–15` exactly like
      the composer's range header. So if selecting with `shift+j/k` and
      pressing `a` asks about one line in practice, **that is a bug to
      reproduce and fix**, and it is a 🟢 fix inside today's design, not a
      reason to rebuild the surface.
      *The rest of the proposal still stands on its own merits, and it is a
      genuine tension.* For: one composer, one place your writing lives, and
      "Start comment from this" stops being a hand-off between two surfaces and
      becomes a tab switch. Against: `ask-note.tsx`'s file header records that
      the dotted, unfilled skin exists **so that nothing machine-written can be
      mistaken for something published** — three deliberately distinct comment
      materials, of which ask is the third. Putting the answer inside the
      composer, one tab away from a box whose button posts to GitHub, spends
      exactly that separation. Answer that before building, not after.
      *Prompt suggestions* (the other half of the ask) are independent of the
      tab decision, cheap, and pair naturally with **canned comments on a key**
      in § feature-ideas — build them as one list mechanism with two sources,
      or they will diverge.

### Code navigation

- [ ] 🔴 **`mod`+click should go to the definition, VS Code style** — today it
      steps to the next textual occurrence. The ask is the semantic version:
      click a token, land on where it is *defined*; click the definition, get a
      peek listing where it is *used*, with snippets. **This is
      [§9 layer 3](#9-repo-snapshot--sync-layers-decided-2026-07-12) arriving
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
         make you pick. Runs in milliseconds over the already-extracted
         snapshot and needs nothing installed on the user's machine.
         **This is the stack GitHub's own code navigation runs on**, and its
         imprecision is evidently tolerable at that scale.
      2. **A precomputed SCIP / LSIF index** — exact, but produced by CI *in
         the repo being reviewed*, so it exists only for projects that opted
         in. Fine as an enhancement when present; a non-starter as the primary
         path.
      3. **Real language servers** (rust-analyzer, tsserver) driven over the
         snapshot — exact, and zero per-language work for us. But it needs the
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
