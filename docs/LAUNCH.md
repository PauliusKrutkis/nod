# Launch runbook — from code-complete to paid

Everything code-side shipped in PRs #123–#155 (see
[RELEASING.md — Commercial launch](RELEASING.md#commercial-launch) for the
design and [BACKLOG.md §11c](BACKLOG.md#11c-commercial-launch) for history).
What remains is almost entirely **account work only the owner can do**, in
dependency order below. Work top to bottom; each step says who acts.

> **Gate first:** the [release gate](BACKLOG.md#release-gate) still applies —
> five external developers, one week, retention plausible. Steps 1–2 are
> safe to do before the gate; don't create the production Polar account
> (step 4) until it passes.

## 1. Canonical domain — owner decision

Settle the permanent host **before** the production Polar account exists:
once a payment provider holds webhook URLs and shipped binaries carry a
license-server host, moving is a provider migration instead of a redirect
([why](RELEASING.md#canonical-domain)). `nodreview.com` is the current
placeholder. Decide: keep it as final, or buy the real one now.

## 2. Apple notarization — owner account + repo secrets

Hard prerequisite for charging macOS users
([setup](RELEASING.md#apple-notarization)): Apple Developer Program
($99/yr) → Developer ID Application cert → the `APPLE_*` repo secrets.
Tauri signs + notarizes during the existing release build; no workflow
changes needed. Afterwards: drop the `xattr` note from the README, cask
template, and landing page, and re-test `brew install` on a clean machine.

## 3. Ed25519 license keypair — owner, one-time

Generate a 32-byte seed and derive the public key (any Ed25519 tool; the
web repo's `@noble/ed25519` in a scratch script works). Then:

- `LICENSE_SIGNING_SEED` (64 hex chars) → Cloudflare Pages secret
  (`wrangler pages secret put`), never in the repo.
- `NOD_LICENSE_PUBKEY` (public half, hex) → GitHub repo **variable**; the
  release workflow already forwards it into the build. **Back the seed up**
  like the updater minisign key — lose it and every sold license dies.

## 4. Polar — owner account, then verification

Create the account (sandbox first), one product: **Nod license, $39,
one-time** (renewal SKU can wait). Configure:

- Webhook → `https://<domain>/purchase-webhook`, secret →
  `POLAR_WEBHOOK_SECRET` Pages secret.
- Checkout success URL → `https://<domain>/activate?order_id=…` — and
  **verify the two assumptions** flagged in `functions/lib/polar.ts`:
  the exact success-URL template variable, and whether checkout metadata
  arrives as `metadata.subject` on the `order.paid` payload.

## 5. Forge identity at checkout — the one real code task left

Nothing currently puts `metadata.subject` on a Polar order, so the webhook
has nothing to key a license to. Needs, in order: a **web** GitHub OAuth
app (owner registers; callback on the site, distinct from the desktop app's
loopback OAuth), then a small buy-flow page — sign in with GitHub →
redirect into Polar checkout carrying `subject = github:github.com:<id>`
(mechanism per step 4's verification). gitlab.com wants a second OAuth app
later; self-hosted GitLab stays email-restore-only by design. Buildable the
day the OAuth app exists.

## 6. Sandbox end-to-end — owner + app build

With sandbox Polar + real keypair + a locally built app carrying the
pubkey: buy → webhook stores license → `/activate` → zero-click loopback
activation, deep-link activation (macOS bundled build for `prflow://`),
Safari's button path, and repeat-purchase term extension. This is the first
time the whole chain runs against reality.

## 7. Flip it on — owner, minutes

- `NOD_CHECKOUT_URL` repo variable → release builds' Buy actions work.
- `PUBLIC_CHECKOUT_URL` in the Cloudflare Pages build env → the site's
  pricing card swaps "Evaluate for free" for the real **Buy Nod** button.
- Cut a release ([release skill](RELEASING.md#tldr--cut-a-release)) so
  installed apps can actually activate.

## 8. Post-launch, not blocking

- `/restore` for real (needs `POLAR_API_KEY`) — email-fallback restore;
  until then support = manual token issuance.
- Renewal SKU ("+1 year of updates").
- `nod-keygen` CLI for support grants and refunds.
- Delete the stale pre-monorepo `src-tauri/` dir at the repo root (owner —
  it holds a local `.env` with OAuth dev credentials; now gitignored).
