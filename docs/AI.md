# Ask-about-this-code — end-to-end plan (2026-08-03)

> Implementation plan for the first AI feature: BYOK "ask a question about the
> code you're reviewing", grounded in the repo snapshot. Supersedes the two
> Post-MVP backlog sketches in [BACKLOG.md](./BACKLOG.md#post-mvp-backlog);
> product decision to build it was made 2026-08-03 (owner).

## Product shape

- **Pull, not push.** Nothing fires unless the user presses `a`. No summaries,
  no auto-review, no background calls. The quiet review flow is untouched.
- **BYOK, off by default.** AI exists only after the user pastes their own key.
  Pasting the key is the consent act (privacy decision 2026-08-01); the setup
  dialog carries the one disclosure sentence: *"Selected code, file paths and
  line numbers are sent to your configured AI provider."*
- **Provider seam: generic OpenAI-compatible** (decided 2026-08-03). One
  implementation — base URL + key — covers Nexos, OpenRouter, and most
  gateways. The base URL field ships with a preset dropdown (**Nexos AI**
  default, OpenRouter, Custom). No Anthropic Messages wire format in v1.
- **The user picks the model.** Populated from `GET /v1/models`; where the
  response carries Nexos's `endpoints[]`, filter on `chat_completion`;
  otherwise list everything (generic providers don't have that field).
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

### Surface — info drawer mode, hotkey `a`

The drawer already exists, is toggled by `i`/`shift+i`, and renders markdown.
`a` (free in review scope, verified) opens it in a new **Ask** mode with an
input; answer streams/renders as markdown below, question history per PR kept
in memory only. `Esc` follows the existing ladder. No popover (no floating
primitive + virtualized rows), no modal (fights keyboard flow).

Answers are asked to cite `path:line`; v1 renders citations as text.
Click-through to the file is a follow-up, not v1.

### Onboarding — the keybind is the discovery point

Pressing `a` with no key configured opens the **AI setup dialog** — which *is*
the settings surface (none exists today; pattern: `issue-tracker-dialog.tsx`,
a `q-dialog` also reachable from the command palette as "Set up AI…"). Fields:
provider preset → base URL, key (paste, never echoed back), model picker
(fetched via a Rust `ai_list_models` command once base URL + key validate),
the disclosure sentence, Save. On save, the drawer opens in Ask mode and the
original intent continues — the ask isn't lost to setup.

Command palette also gets "Ask about this code" so the feature is
discoverable without knowing the key.

## PR sequence

Ship via split-pr (one intent per PR, ~300-line soft budget, `pnpm check` /
tests / knip green, `cargo test` for `src-tauri` changes, e2e + UI evidence
for UI changes). Run pr-validity after each. frontend-design guides PRs 2–3.

| PR | Intent | Notes |
| --- | --- | --- |
| **1** | `ai.json` storage + `get_ai_config`/`set_ai_config`/`clear_ai_config` + `ai_list_models` | Rust only; unit tests like `commands_tests.rs` |
| **2** | AI setup dialog + `a`-opens-setup onboarding + palette entries | First settings surface; disclosure copy |
| **3** | `ai_ask` non-streaming + drawer Ask mode + selection/PR prompt assembly | Degradation step 3 works here |
| **4** | Layer 2: `grep_repo` + `list_files` over the snapshot | Rust only; also registered as commands; unblocks user-facing repo search |
| **5** | Tool loop inside `ai_ask` + degradation ladder | After the tools probe (below) |
| **6** | SSE streaming + polish (history, citations styling) | Only after the chunk-shape probe |

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

- **Perf budget untouched:** all AI work is async off the review path; no new
  work on open/scroll/file-switch. e2e perf budgets must stay green.
- **Key never reaches the webview** — enforced by the command shapes above;
  no `fetch` from React to any AI endpoint, ever.
- **No background sends:** every request is user-initiated from the Ask input.
- Per-repo allowlist stays a later hardening step (2026-08-01 decision).

## Open questions (not v1 blockers)

- Citation click-through into the file (needs cross-file peek — the
  full-file-modal ghost from §"context expansion").
- Persisting ask history across restarts.
- A default model recommendation per provider preset.
