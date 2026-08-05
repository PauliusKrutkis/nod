# AI in Nod — position, and the ask-about-this-code plan

> Two documents in one, deliberately. **[Position](#position-2026-08-05)** governs
> every AI feature Nod will ever ship. The rest is the implementation plan for
> the first one: BYOK "ask a question about the code you're reviewing", grounded
> in the repo snapshot. Supersedes the two Post-MVP backlog sketches in
> [BACKLOG.md](./BACKLOG.md#post-mvp-backlog); decision to build made 2026-08-03
> (owner), position written down 2026-08-05.

## Position (2026-08-05)

**Nod is not against AI. Nod is against renting it to you.**

The thing being refused is a specific business model: a subscription that
bundles inference you did not choose, on a model somebody else picked, at a
markup, which stops working the day you stop paying. That is most of the AI
review market, and it is the opposite of what Nod sells — a tool you own
outright, where [a license buys updates, not
permission](./RELEASING.md#commercial-launch).

AI features that genuinely make review better are welcome. They just have to
arrive on the user's terms. Three rules, which are what *"not rented, not
bundled"* means once you get past the tagline:

1. **You bring the key.** Nod never resells inference and never stands between
   your code and the provider. No Nod account, no markup, no model chosen on
   your behalf. Your code goes to *your* provider, on *your* key, under the
   terms you agreed to with them. If Nod vanished tomorrow, your AI setup would
   be untouched — because it was never ours to switch off.
2. **You pull; nothing pushes.** No AI feature fires on its own. Not on PR
   open, not on a background poll, not helpfully. Every request traces back to
   a key *you* pressed, on the PR *you* were looking at. **This rule is about
   the trigger, not the size of the answer** — a feature that reviews an entire
   PR is fine if you asked it to; a one-line summary that shows up uninvited is
   not. Read it as *"never automatic"*, not *"never ambitious"*.
3. **Off is the default, and stays a real state.** Ship with no key and the app
   is complete, because the review loop is the product. No nagging, no upsell,
   no half-lit "AI unavailable" surfaces. The feature is invisible until wanted.

**The hard line: Nod never operates inference.** No proxy, no gateway, no
"we'll manage the key for you" convenience tier — because every one of those
turns Nod into the middleman this whole position exists to refuse, and quietly
recreates the subscription by the back door. Worth naming the specific
temptation: the license server
([§11c](./BACKLOG.md#11c-commercial-launch), Pages Functions) is exactly where
somebody would eventually put such a proxy, and it must never become one. If
BYOK onboarding is painful, the answer is better onboarding.

**Why this is a position and not a limitation.** BYOK is the better deal in
public: the user picks the model, sees the real per-token cost instead of a
margin, and moves to whatever ships next month without waiting for us to
integrate it. It is also the smaller thing to maintain — no inference bills, no
capacity planning, no becoming a data processor for other people's source code.
The constraint and the pitch point the same way, which is the only kind of
principle that survives contact with a roadmap.

### What this permits

More AI features are allowed. The three surfaces parked in
[BACKLOG.md](./BACKLOG.md#ai-surfaces-beyond-ask--parked-not-planned-2026-08-05)
— review-by-prompt, diff layers, change heat map — are **not blocked by rule
2**, and an earlier draft of that section was wrong to imply they were: each
would be user-invoked, which is precisely what pulling means. They stay parked
for ordinary product reasons (ask-about-code should prove itself first, and the
heat map has a trust problem no rule can fix), not because the position forbids
them.

What the position *does* forbid is narrow and worth stating plainly: an
auto-summary on PR open, a background pre-fetch of answers, a Nod-hosted model,
a bundled key, and any "AI credits" line item next to the license price.

## Product shape

- **Pull, not push** (rule 2). Nothing fires unless the user presses `a`. No
  summaries, no auto-review, no background calls. The quiet review flow is
  untouched.
- **BYOK, off by default** (rules 1 and 3). AI exists only after the user pastes
  their own key. Pasting the key is the consent act (privacy decision
  2026-08-01); the setup dialog carries the one disclosure sentence:
  *"Selected code, file paths and line numbers are sent to your configured AI
  provider."*
- **Provider seam: generic OpenAI-compatible** (decided 2026-08-03). One
  implementation — base URL + key — covers Nexos, OpenRouter, and most
  gateways. The base URL field ships with a preset dropdown (**Nexos AI**
  default, OpenRouter, Custom). No Anthropic Messages wire format in v1.
- **The user picks the model** (rule 1 — we never pick one for you, and there is
  no "recommended" default that is really a deal). Populated from
  `GET /v1/models`; where the response carries Nexos's `endpoints[]`, filter on
  `chat_completion`; otherwise list everything (generic providers don't have
  that field).
- **Ask scope: selection or whole PR** (decided 2026-08-03). With a cursor
  line or fat-cursor range, the question is about those lines (file path +
  line numbers + reconstructed code). With no cursor, it's about the PR
  (title, description, file list, diff stats).

## Architecture

### Key storage — mirrors accounts exactly

Per the layering rule the webview never holds credentials. `ai.json` lives
beside the host tokens in the app config dir (`storage.rs`); the webview only
ever sees a key-free info struct. New commands shaped like the
`has_token`/`set_token`/`clear_token` trio in `commands.rs`:

- `get_ai_config() -> AiInfo` — `{ configured: bool, base_url, model }`, no key.
- `set_ai_config(base_url, key, model)` / `clear_ai_config()`.

Base URL and model ride in `ai.json` with the key: the request is assembled
entirely in Rust, so Rust must own everything that shapes it. Model *choice*
UI state (last picker position) is webview state like any other.

### The request path — `ai_ask` in Rust

A new `ai_ask` command owns the whole exchange; a dedicated `reqwest` client
(every existing client has a forge auth header baked in). Non-streaming first:
`POST {base_url}/v1/chat/completions`, answer at
`choices[0].message.content`. Errors surface `error.message` best-effort —
Nexos documents only 400/402/500, so no hardcoded status mapping.

**Streaming ships only after probing the live key** — the SSE chunk shape is
undocumented. Same for tool calling: OpenAI-compatibility does not guarantee
`tools` support, so the loop degrades (below) and we probe before relying on it.

### Grounding — the snapshot is the retrieval layer

A question about a diff is unanswerable from the diff alone (§9's
tunnel-vision thesis). Layer 1 (snapshot service) **already shipped** — PRs
#75/#113, `snapshot/` module, `ensure_repo_snapshot`/`snapshot_status`
commands, local-first blob serving in `get_file_blob`. The AI feature is its
second consumer and finally motivates **Layer 2**:

**Tools the model can call** (agentic loop inside `ai_ask`, all pure local
reads over the extracted tree — no network, no git):

| Tool | Backing |
| --- | --- |
| `list_files(glob?)` | walk `snapshot_dir` (respect `safe_join`) |
| `read_file(path, start?, end?)` | `snapshot_store::read_file`, capped + line-sliced |
| `grep_repo(pattern, glob?)` | new Layer 2 search (`grep` crate or hand-rolled; ripgrep-style over the tree) |

Loop guards: max 8 tool rounds, per-read byte cap (~64 KB slice), binary
detection, total-context budget, hard wall-clock timeout. Results are
truncated with an explicit `[truncated]` marker so the model knows.

**Degradation ladder** (each step is a working feature):

1. Model supports tools + snapshot ready → agentic loop, best answers.
2. No tool support → single-shot: selection + surrounding file content
   (from the snapshot or `get_file_blob`) + our own `grep_repo` pass on
   identifiers in the selection, assembled in Rust.
3. Snapshot not ready/too large (>100 MB guard) → selection + diff only.
4. No key → the setup dialog (below). Never an error state.

`grep_repo` is also registered as a plain command — user-facing whole-repo
search (§9 Layer 2) falls out of this work for free.

### Surface — inline AI note, hotkey `a` (revised 2026-08-05)

Originally shipped as a drawer mode; revised by owner decision 2026-08-05
(design mock first): the answer renders next to its subject, not across the
screen from it.

- `a` anchors a **note in the diff** under the cursor row (or the selection's
  end row, carrying the range); with no cursor it pins above the first file —
  whole-PR scope. One note at a time; re-anchoring elsewhere starts a fresh
  conversation, Esc keeps it for a same-spot reopen.
- **Material rule** (the third comment material): posted thread = solid card
  on surface; pending comment = dashed accent wash; AI note = dotted hairline
  with **no fill** — ink, not paper, so machine text can never be mistaken
  for a published comment. Sparkle glyph instead of an avatar, `you · local`
  tag.
- Exchanges and the in-flight ask live in `use-ask-note.ts`, outside the
  virtualized list — scrolling the note out of frame must not lose an answer.
- **"Start comment from this"** prefills the normal composer at the ask's
  anchor with the answer as plain editable text — ask is a drafting step
  inside review, not a chat. Posting dismisses the note.
- `Esc` closes the note ahead of the info drawer in the ladder; `a` and `i`
  are independent surfaces now (the drawer-mode dance is gone).

Answers are asked to cite `path:line`; v1 renders citations as text.
Click-through to the file is a follow-up, not v1.

### Onboarding — the keybind is the discovery point

Pressing `a` with no key configured opens the **AI setup dialog** — which *is*
the settings surface (none exists today; pattern: `issue-tracker-dialog.tsx`,
a `q-dialog` also reachable from the command palette as "Set up AI…"). Fields:
provider preset → base URL, key (paste, never echoed back), model picker
(fetched via a Rust `ai_list_models` command once base URL + key validate),
the disclosure sentence, Save. On save, the inline note opens and the
original intent continues — the ask isn't lost to setup.

Command palette also gets "Ask about this code" so the feature is
discoverable without knowing the key.

## PR sequence — shipped

**All six landed (2026-08-03 → 2026-08-05).** Kept as the record of what was
built and in what order. Shipped via split-pr (one intent per PR, ~300-line soft
budget, `pnpm check` / tests / knip green, `cargo test` for `src-tauri` changes,
e2e + UI evidence for UI changes), pr-validity after each.

| PR | Intent | Shipped as |
| --- | --- | --- |
| **1** | `ai.json` storage + `get_ai_config`/`set_ai_config`/`clear_ai_config` + `ai_list_models` | **#172** |
| **2** | AI setup dialog + `a`-opens-setup onboarding + palette entries | **#173** |
| **3** | `ai_ask` non-streaming + Ask surface + selection/PR prompt assembly | **#175** — surface later revised from drawer mode to the inline note |
| **4** | Layer 2: `grep_repo` + `list_files` over the snapshot | folded into **#176** |
| **5** | Tool loop inside `ai_ask` + degradation ladder | **#176** |
| **6** | SSE streaming + polish | **#177** |

> **One item did not land as specced.** PR 4 was meant to register `grep_repo`
> and `list_files` as plain commands so user-facing whole-repo search "falls out
> for free" (§9 Layer 2). They exist and work, but **only inside the `ai_ask`
> tool loop** — neither is in `invoke_handler`, so there is still no repo search
> in the app. Tracked in
> [BACKLOG §9 Layer 2](./BACKLOG.md#9-repo-snapshot--sync-layers-decided-2026-07-12);
> what remains is registration plus UI, not the search engine.

**Probe (before PR 5/6, owner's live Nexos key):** `scripts/probe-nexos.mjs`
hits `/v1/chat/completions` with `tools` and with `stream: true`.

**Probe findings (run 2026-08-03, live key, 56 models):**

- **Tool calling works** — standard OpenAI shape end to end:
  `finish_reason: "tool_calls"`, `message.tool_calls[]` entries of
  `{ id, type: "function", function: { name, arguments } }` with `arguments`
  a JSON **string**. Verified through `anthropic.claude-sonnet-4-5` on
  Vertex, i.e. the translation layer holds even for non-OpenAI upstreams.
- **Streaming is standard OpenAI SSE** — `data: {chunk}` lines with
  `choices[0].delta.content` string pieces, a final chunk with empty `delta`
  and `finish_reason: "stop"`, then `data: [DONE]`. Chunks may carry extra
  fields (`provider`, `usage.nexos_credits_cost`) — ignore unknown keys.
- **`endpoints[]` is an array of bare strings** (`["batches","embeddings"]`
  observed), confirming PR 1's `chat_completion` filter contract. Model ids
  can contain spaces and parentheses
  (`…@20250929 (aoxy-analytics europe-west1)`) — treat ids as opaque.
- Models also advertise `timeout_ms` / `stream_timeout_ms` — available if
  the fixed 120 s ask timeout ever needs to be per-model.

## Guardrails

The first three are [Position](#position-2026-08-05) made testable — if one of
them is failing, the product is off-position, not merely buggy.

- **No background sends** (rule 2): every request is user-initiated from the Ask
  input. A reviewer should be able to sit in a PR all day with a key configured
  and send nothing. Any future feature that wants to warm a cache or pre-fetch
  an answer fails this and needs the position revisited first, not a flag.
- **No Nod-operated endpoint** (the hard line): the only host the AI path ever
  talks to is the base URL the user typed. Nothing AI-shaped is ever added to
  the license server. A PR that routes inference through anything of ours is
  wrong on its face, regardless of how well it works.
- **Off must stay complete** (rule 3): with no key configured, every surface
  behaves as though the feature does not exist — `a` opens setup rather than an
  error, and nothing elsewhere in the app gets an empty AI affordance.
- **Key never reaches the webview** — enforced by the command shapes above;
  no `fetch` from React to any AI endpoint, ever. This is the privacy promise
  the site makes ("your code goes straight to that provider, never through me")
  expressed as an architecture rule.
- **Perf budget untouched:** all AI work is async off the review path; no new
  work on open/scroll/file-switch. e2e perf budgets must stay green.
- Per-repo allowlist stays a later hardening step (2026-08-01 decision).

## Open questions (not v1 blockers)

- Citation click-through into the file (needs cross-file peek — the
  full-file-modal ghost from §"context expansion").
- Persisting ask history across restarts.
- A default model recommendation per provider preset.
