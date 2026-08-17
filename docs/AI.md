# AI in Nod — position, and the ask-about-this-code plan

> Two documents in one, deliberately. **[Position](#position-2026-08-05)** governs
> every AI feature Nod will ever ship. The rest is the implementation plan for
> the first one: BYOK "ask a question about the code you're reviewing", grounded
> in the repo snapshot. Supersedes the two Post-MVP backlog sketches in
> [BACKLOG.md](./BACKLOG.md#post-mvp-backlog); decision to build made 2026-08-03
> (owner), position written down 2026-08-05. The
> [second surface](#second-surface--chat-panel--suggested-comments-decided-2026-08-16)
> — chat panel + suggested comments — was decided 2026-08-16 and is recorded
> below under the same position.

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
  inside review, not a chat. Posting dismisses the note. *Revised 2026-08-16
  (owner): "not a chat" now describes the note, not the product. A deliberate
  chat surface exists — the
  [panel](#second-surface--chat-panel--suggested-comments-decided-2026-08-16) —
  and the note keeps its narrower role: quick, anchored, one thread, no
  ceremony.*
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

> **One item landed late.** PR 4 was meant to register `grep_repo` and
> `list_files` as plain commands so user-facing whole-repo search "falls out
> for free" (§9 Layer 2). The registration has since happened —
> `list_repo_files` and `search_repo_content` are in `invoke_handler`
> (`lib.rs`) — but no UI calls them yet, so there is still no repo search *in
> the app*. Tracked in
> [BACKLOG §9 Layer 2](./BACKLOG.md#9-repo-snapshot--sync-layers-decided-2026-07-12);
> what remains is UI only, not registration and not the search engine.

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

## Second surface — chat panel + suggested comments (decided 2026-08-16)

**Owner decision 2026-08-16: build it.** The workflow it closes: reviewers
already run an agent in a terminal beside the review and hand-copy its findings
into comments. Nod should own that loop — a conversation about the PR with the
code one glance away, and findings that arrive as comment objects instead of
text to transcribe. This is the
[review-by-prompt sketch](./BACKLOG.md#ai-surfaces-beyond-ask--parked-not-planned-2026-08-05)
promoted from parked, plus the chat surface it needs.

Everything here is pull (rule 2): the chat never sends on its own, a skill runs
only when a user send carries it, and the system prompt permits `propose_comment`
only when the user asked for review feedback. Off stays complete: no key, no
panel affordance beyond the same setup dialog `a` opens.

### Surface — the right drawer becomes a docked panel

The `i` drawer grows into a right-side **panel with tabs (Info | Chat)** —
docked as a column on wide viewports so the diff stays clickable while the
conversation is open, overlay with a scrim at narrow widths. Not a new pattern:
it is the file sidebar's docked/overlay dual mode mirrored to the right edge.
The closed dock stays mounted (drafts and transcripts must survive a toggle).

- `mod+l` toggles the Chat tab — modified and registered global, because the
  toggle must also close and a plain key never fires while the chat's own
  composer holds focus. Not `mod+m`: ⌘M is macOS's window-minimise chord and
  the menu swallows it before the webview sees it, which a Chromium e2e can
  never catch. It pairs with plain `l`, which feeds the chat a region; `i`
  keeps Info semantics (chat open → switch tab,
  info open → close). Both derive palette and `?` sheet entries as usual.
- `l` adds the cursor line or fat-cursor selection to the chat as a **context
  chip** on the next message — the Cursor `⌘L` motion. Multiple chips per
  message; captured through the same frozen-cursor mechanic as `a`, never the
  DOM.
- The chat composer is a plain textarea; `/` opens a skill picker through the
  canned-list mechanism (one mechanism, two sources — the 2026-08-09 decision
  holds).

### Protocol — `ai_chat`, stateless per call

`ai_chat` reuses the ask machinery (streaming, tool loop, degradation ladder,
8-round guard) and adds what a conversation needs: the frontend sends the
settled turns back each call (tool traffic is not replayed), Rust trims oldest
turns past an input budget, and three events come back keyed
`{chatId, turnId}`: `ai-chat-delta` (content), `ai-chat-tool` (activity, so
"searching the repo" is visible), `ai-chat-proposal` (below). `ai_chat_cancel`
aborts an in-flight turn — a stop button, not an error. History persists per PR
(`nod:chatHistory:v1`), same keying as pending comments.

### Suggested comments are pending comments (revised 2026-08-16, owner)

The model may stage findings via a `propose_comment` tool. Rust validates each
proposal against the diff's commentable ranges (computed by the frontend from
the patch — the same `rowTarget` rules that gate the composer, so the model can
never anchor where the forges would reject) and returns an actionable error
listing valid ranges when it misses, letting it self-correct within the turn.

A valid proposal **is a pending comment** — the same object, the same card, the
same submission path. It shipped first as a separate `suggestedComments` slice
with an Accept step, on the theory that nothing machine-written should be one
click from your review. Dogfooding killed that: accepting every good suggestion
cost a click that never once changed the answer, and two materials for one idea
made the diff harder to read, not safer. The rule that survives is the one that
matters — **nothing posts without you pressing submit** — and a suggestion you
do not want costs exactly one Discard.

So the material rule is back to three, not four: posted thread = solid card on
surface; **pending comment = dashed hairline with an accent rail, no fill**
(the old accent wash read as a highlight over half the file once the chat
started staging comments, and it fought the diff's own tints); AI note = dotted
hairline, no fill. A pending comment the chat wrote carries a sparkle and says
*Suggested* rather than *Pending* — provenance without a second material.

Pending comments earn the affordances that implies: **edit in place**, discard,
**comment now** (post that one immediately, outside the batched review), and
the hover-armed hotkeys posted threads already had. They wear the SAME card as
a posted comment (owner decision 2026-08-17, revising the dashed-draft
material twice over): one component, a PENDING tag, an accent rail for
"leaves with the review" — and no AI-made differentiation, because a staged
comment is yours the moment you keep it. A turn that stages comments lists
them inside that turn in the transcript, so a long conversation scrolls past
its findings instead of pinning them over the composer.

### Skills — the agent-skills standard, read from the repo

Skills are `SKILL.md` files with YAML frontmatter, from two sources: the
reviewed repo's own — `.claude/skills/**`, `.agents/`, `.cursor/`, `.codex/`
or a bare `skills/**`, whichever it uses, with `.claude` winning a clash and
the folder holding the manifest naming the skill — via the snapshot — a repo carries its
review conventions with it — and your own, read from every user-level folder the
agents on this machine keep — `~/.claude/skills` first, then `~/.agents`,
`~/.cursor`, `~/.codex`, then Nod's own config directory. They hold genuinely
different sets (a review pass under one, a Jira helper under another), and a
reviewer who has already written the skill they need should not be sent
shopping for a copy of it. New skills are written to `~/.claude/skills`,
where every one of those tools can see them. The repo wins a name clash.

Invoking one injects its body into the
outgoing turn as instructions — several can ride one message, numbered in the
order they were invoked, because "run the validity pass and the security
pass" is one request. The model can also list and read them itself through
tools.

One skill ships with the app: **`/find-skill`**, which is how the other ones
get written — and, since it is always there, the reason `/` is never an empty
menu. It looks for an existing skill that already covers what you are
about to do, and when none does, it drafts one with you and saves it through a
`write_skill` tool — so the answer to "how do I add a skill?" is a message in
the chat, not a folder to go and populate. It refuses to overwrite a skill you
already have, and shows you the draft before it writes anything: a skill is
instructions the model will follow over your code, so one never appears
unread. A repo skill named `find-skill` outranks the built-in, same as any
other clash.

It also replaced the skills dialog that shipped a day earlier: a button that
opened a folder, next to a field that scaffolded a file, is a worse answer to
"how do I add a skill?" than asking for one in the chat. The dialog and its
two commands are gone; `write_skill` names the folder it saved to, for anyone
who wants to edit the file by hand.

**The search reaches past this machine.** `search_skills` queries the public
catalog at skills.sh — the index `npx skills find` reads — and `fetch_skill`
pulls one skill's `SKILL.md` from its repository as text. Nothing is
installed and nothing runs: the instructions land in the transcript, where
you read them, and only `write_skill` puts a file on disk. That keeps the
position this doc has always taken — fetching prompt files from a registry
and running them over your code is a supply-chain decision, so it stays
yours, made against the actual text rather than a name and an install count.
Both requests go out unauthenticated, so no account credential reaches a
third-party host.

### Budgets

An ask-note is a sentence and a chat answer is a review pass, so they share
neither budget. The chat asks for 8000 completion tokens and allows
thirty-two tool rounds: a review skill reads a file per round and hit the
ask-note's eight before it had seen the diff, at which point the tools were
taken away mid-plan and the turn ended with nothing.

The number matters less than what happens at it. Agent loops either run
unbounded until the model stops asking (Cursor, Claude Code, with a
"continue?" prompt around 25 calls) or cap and fail (the OpenAI Agents SDK's
10, LangChain's 15). Failing at the cap is the worst of the three — a minute
of waiting for four words of error — so reaching it here is a deadline, not a
wall: the tools come off, the model is told it is out of budget, and it
answers with what it has and says what it did not reach. A round that
produces neither text nor a tool call buys the same one extra pass. The real
ceiling is the 120k-character input budget, which trims oldest-first, and the
model's own context.

Two more things keep a skill run from being a drip-feed of round-trips. A
turn that invokes a skill carries the full (capped) diff with it — a review
pass's first act is always "read the diff", one file per round, and the diff
was sitting in the request all along. And rounds are separate paragraphs:
their streamed prose used to be glued together mid-sentence in the
transcript. Every round is logged to the dev terminal with its stream time,
tool calls and in-flight payload size, because "why did that take nine
minutes" should be answerable from data rather than vibes.

Escape never stops a run — it is the leave key everywhere else in the app,
and stopping on it would take "close the chat while it works" away. Stop is
the stop, and a message sent mid-turn queues and goes out when the turn
settles. Thinking models
spend that budget before a word reaches the reviewer, and at the ask-note's
2000 a long skill ran the tank dry mid-thought and returned nothing at all —
which the panel could only report as "empty answer". The provider's
`finish_reason` now separates the two, so running out of room says so.

### Ship order

Docs (this section) → docked panel → `ai_chat` → chat-panel component → wiring
+ persistence → region chips → `propose_comment` → suggestion cards in the
diff → skills. Fast-follows: citation click-through, replaying tool traffic in
history. Shipped since, across two dogfood rounds: the personal skills dir,
per-chat model picker (a searchable popover), chat threads, the resizable
dock, paste-to-chip, `read_diff`, reasoning-delta streaming with a per-turn
working trail, and the reversal above — suggestions as pending comments.

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
- Persisting ask history across restarts. *Half-answered 2026-08-16: chat
  panel history persists per PR; the `a` note's exchanges still do not.*
- A default model recommendation per provider preset.
