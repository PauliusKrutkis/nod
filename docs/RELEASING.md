# Releasing Nod

Everything about shipping desktop builds: cutting a release, testing
auto-updates, Homebrew, going public, and the [commercial launch](#commercial-launch)
plan (forge-account-as-license, browser-brokered activation — no license keys).

## TL;DR — cut a release

```bash
# 1. Bump the app version (this is what the updater compares against)
#    apps/desktop/src-tauri/tauri.conf.json  →  "version": "0.1.1"

# 2. Commit, tag, push
git commit -am "release: v0.1.1"
git push
git tag v0.1.1 && git push origin v0.1.1
```

The `v*` tag triggers `.github/workflows/release.yml`, which:

1. Builds bundles on macOS (arm64 + x64), Windows (`.msi`) and Linux
   (`.deb` / `.AppImage`).
2. Signs the updater artifacts (`.app.tar.gz` + `.sig`, etc.) with the
   minisign key from the repo secrets.
3. Publishes a GitHub Release with all assets **plus `latest.json`** — the
   manifest the in-app updater polls
   (`https://github.com/PauliusKrutkis/pr-flow/releases/latest/download/latest.json`).
4. Bumps the Homebrew tap (only when the `TAP_DEPLOY_KEY` secret exists —
   skipped quietly otherwise).

Installed apps poll that manifest, show the "Update available" prompt, and
install + relaunch in one click.

## One-time setup (already done / still to do)

| Item | Status |
| --- | --- |
| Updater signing keypair | ✅ `~/.tauri/prflow.key` (passwordless). **Back this file up** (password manager / secure storage). If it's lost, installed apps can never verify another update — the chain is dead and users must reinstall manually. |
| Public key in `tauri.conf.json` | ✅ `plugins.updater.pubkey` |
| Repo secrets | ✅ `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (empty) |
| Homebrew tap repo | ✅ `PauliusKrutkis/homebrew-tap` (public), seeded with the v0.1.0 cask. The release workflow pushes bumps over SSH via the `TAP_DEPLOY_KEY` secret — a deploy key that can write only to that one repo. Cask template: `packaging/homebrew/Casks/nod.rb`. |
| OAuth in released builds | ✅ Baked in at compile time (`option_env!` in auth.rs): secrets `PRFLOW_GH_CLIENT_ID` / `PRFLOW_GH_CLIENT_SECRET` are set; the repo **variable** `NOD_GITLAB_CLIENT_ID` activates GitLab sign-in once the gitlab.com app is registered (`gh variable set NOD_GITLAB_CLIENT_ID`). Runtime `.env` still overrides in dev. Note: a client secret inside a desktop binary is extractable — a known, accepted trade-off for GitHub OAuth apps (GitHub CLI does the same); GitLab uses PKCE and has no secret at all. |
| Apple notarization | ⬜ **Required before paid launch (Phase 1)** — Apple Developer cert ($99/yr). Until then macOS users clear quarantine after install (`xattr -dr com.apple.quarantine /Applications/Nod.app`) or approve the app once under System Settings → Privacy & Security. (Homebrew 6 removed `--no-quarantine`.) An app that needs an `xattr` incantation to open is not shippable to paying customers — notarization is a Phase 1 gate, not a nice-to-have. Setup and env vars: [Apple notarization](#apple-notarization). |
| Commercial launch (Phase 0 + 1) | ⬜ See [Commercial launch](#commercial-launch) below. |

## Goal: a true one-line `brew install`

The landing page (`apps/web`) shows the install command as a single line —
`brew install pauliuskrutkis/tap/nod` — matching every other keyboard-first
dev tool's install story. Three of the four commands this section used to
list turned out to be avoidable; only one real gap is left:

```bash
brew install pauliuskrutkis/tap/nod
xattr -dr com.apple.quarantine /Applications/Nod.app   # ← the only gap
```

What closed, and why:

1. **`--cask` flag** — never needed. No formula shares the `nod` token, so
   the bare cask token resolves on its own (`brew info nod` confirms it
   against the installed tap).
2. **`brew tap` step** — `brew install <user>/<tap>/<token>` auto-taps an
   untapped repo, so it folds into the install line. Still worth confirming
   on a clean machine, since every box here already has the tap.
3. **`brew trust --tap` step** — not a proxy for "unsigned binary" as
   previously guessed. `brew trust --help` (Homebrew 6.0.9) states it applies
   only "when `$HOMEBREW_REQUIRE_TAP_TRUST` is set" — an opt-in that is unset
   by default. It guards third-party tap *Ruby code*, and is unrelated to
   code signing, so notarization will not change it either way.
4. **`xattr` step** — the genuine gap, caused by the missing Gatekeeper
   signature, and the reason the landing-page CTA is still aspirational.
   Resolved by notarization only (below).

So the one-liner becomes literally correct the moment notarization ships —
no Homebrew work is left. Re-verify on a clean machine before removing this
note. Note that an install script (`curl … | sh`) is **not** the shortcut it
looks like: curl doesn't apply `com.apple.quarantine`, so such a script would
merely bypass the signature check rather than pass it, while costing the
Homebrew upgrade path. Not an option for a paid tool.

### Apple notarization

The one remaining gap, and a hard Phase 1 gate — see the one-time setup table
above. Requires the Apple Developer Program ($99/yr) for a **Developer ID
Application** certificate; Tauri's bundler signs and notarizes during
`tauri build` when the environment below is present, so no workflow step is
needed beyond adding secrets.

Signing (export the cert from Keychain Access as `.p12`, then
`openssl base64 -A -in cert.p12 -out cert-base64.txt`):

| Variable | Holds |
| --- | --- |
| `APPLE_CERTIFICATE` | base64 of the `.p12` |
| `APPLE_CERTIFICATE_PASSWORD` | password used on export |
| `APPLE_SIGNING_IDENTITY` | identity name from `security find-identity -v -p codesigning` |
| `KEYCHAIN_PASSWORD` | scratch keychain password for CI |

Notarization credentials — pick one pair:

| App Store Connect API (preferred for CI) | Apple ID |
| --- | --- |
| `APPLE_API_ISSUER` (Issuer ID) | `APPLE_ID` (account email) |
| `APPLE_API_KEY` (Key ID) | `APPLE_PASSWORD` (app-specific password) |
| `APPLE_API_KEY_PATH` (path to `.p8`) | `APPLE_TEAM_ID` |

Prefer the API key: it isn't tied to one person's Apple ID, and app-specific
passwords break whenever that account's 2FA is reset. Both are set as repo
secrets alongside the existing `TAURI_SIGNING_*` pair — note these are Apple's
Gatekeeper chain and entirely separate from the updater's minisign keypair,
which keeps working exactly as it does today.

After the first notarized release: drop the `xattr` line from
[README.md](../README.md#install--auto-updates), the cask template header
(`packaging/homebrew/Casks/nod.rb`), and the landing page's `get__note`, then
re-test the one-liner on a machine that has never had the tap.

## Repo visibility vs auto-updates

**The repo is public** (`PauliusKrutkis/pr-flow`). Installed apps can fetch
`latest.json` from GitHub Releases without auth — the updater works as-is.

If the code should go private again later, use a **public releases-only repo**
(e.g. `PauliusKrutkis/nod-releases`): point `plugins.updater.endpoints` and
the workflow's release target at it (`tauri-action` accepts `owner`/`repo`
inputs). Code stays private; only installers are public. Reconcile visibility
**before the first external user** — a private main repo breaks the updater
unless you split releases.

For local testing without publishing anything, see [Testing auto-updates
locally](#testing-auto-updates-locally-no-public-anything) below.

## Testing auto-updates locally (no public anything)

The updater doesn't care where `latest.json` lives — point it at localhost and
drive the whole loop on your machine:

1. **Build + install the "old" version** (0.1.0):

   ```bash
   cd /path/to/pr-flow
   TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/prflow.key)" pnpm tauri build --bundles app
   cp -r "apps/desktop/src-tauri/target/release/bundle/macos/Nod.app" /Applications/
   ```

2. **Point the updater at localhost** — temporarily, in `tauri.conf.json`:

   ```jsonc
   "updater": {
     "endpoints": ["http://localhost:8000/latest.json"],
     "dangerousInsecureTransportProtocol": true,   // http allowed for the test
     "pubkey": "…unchanged…"
   }
   ```

   ⚠️ This edit must be in the *installed* 0.1.0 build — so make it **before**
   step 1, and revert both settings after the test.

3. **Build the "new" version**: bump `version` to `0.1.1` in
   `tauri.conf.json`, rebuild with the same command. Collect from
   `apps/desktop/src-tauri/target/release/bundle/macos/`:
   - `Nod.app.tar.gz`
   - `Nod.app.tar.gz.sig`

4. **Serve a manifest**. In an empty dir next to the copied `.tar.gz`
   (rename it `update.tar.gz` to avoid space-escaping), create `latest.json`:

   ```json
   {
     "version": "0.1.1",
     "notes": "Local update test",
     "pub_date": "2026-07-02T00:00:00Z",
     "platforms": {
       "darwin-aarch64": {
         "signature": "<paste the full contents of Nod.app.tar.gz.sig>",
         "url": "http://localhost:8000/update.tar.gz"
       }
     }
   }
   ```

   Then `python3 -m http.server 8000` in that dir.

5. **Launch the installed 0.1.0 app** → the update prompt appears (the app
   checks on launch and on an interval) → Install → it verifies the signature,
   swaps the bundle, and relaunches as 0.1.1.

6. **Revert** the endpoint + `dangerousInsecureTransportProtocol` before any
   real build.

## Local builds (for handing someone a one-off)

```bash
cd /path/to/pr-flow
TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/prflow.key)" pnpm tauri build --bundles app
```

Gotchas learned the hard way:

- The bundler wants the key **contents** in `TAURI_SIGNING_PRIVATE_KEY`; the
  `_PATH` variant is not read at build time.
- The DMG step (`--bundles dmg` / default `all`) scripts Finder via
  AppleScript and **fails in non-interactive shells**. Use `--bundles app`
  locally; CI runners build DMGs fine.

## Before going public — checklist

- [x] **Name: Nod** — renamed 2026-07-02 (`productName`, identifier
  `com.pauliuskrutkis.nod`, cask `nod.rb`, workflow asset names `Nod_…`,
  README, window title). The identifier names the config dir, so it had to be
  final before the first real release — it now is. Note: the *repo* is still
  `pr-flow`; renaming it on GitHub is optional (GitHub redirects old URLs,
  including release downloads, so the updater endpoint keeps working).
- [x] **Icon: the keycap** (resting variant from the original design exploration,
  view 9) — `app-icon.svg` is the source; platform sizes in
  `apps/desktop/src-tauri/icons/` were regenerated with `pnpm tauri icon`. To change it
  later: edit the SVG, export 1024×1024 PNG, re-run `pnpm tauri icon <png>`.
- [x] **Repo visibility** — public (`PauliusKrutkis/pr-flow`). If the code goes
  private later, split to a public releases-only repo (above).
- [x] Homebrew tap + `TAP_DEPLOY_KEY` secret (see one-time setup table).
- [ ] First tagged release: expect one round of CI fixup on the Windows/Linux
  builders (first full build on those runners).

---

## Web (landing page)

The marketing site lives in `apps/web` — an Astro + Tailwind v4 static build
(package `@nod/web`). It ships ~zero JS and reuses the app's "Quiet" design
tokens so the site reads as an extension of the product.

```bash
pnpm --filter @nod/web dev      # local dev server
pnpm --filter @nod/web build    # static output → apps/web/dist
pnpm --filter @nod/web check    # astro check (types + templates)
```

### Deploy — Cloudflare Pages (git integration)

Hosting is **Cloudflare Pages**, connected to this repo through Cloudflare's
GitHub App (works with the private repo). It's a one-time dashboard step; after
that every push builds and every PR gets a preview URL. No CI workflow to
maintain.

| Setting          | Value        |
| ---------------- | ------------ |
| Root directory   | `apps/web`   |
| Build command    | `pnpm build` |
| Output directory | `dist`       |

The site is served from **`nodreview.com`** (Cloudflare Registrar, same
account as the Pages project), set as `site` in `apps/web/astro.config.mjs`.
The project also answers on `pr-flow-73o.pages.dev` — Cloudflare suffixed the
subdomain because `pr-flow.pages.dev` was already claimed by another account.
That name is a placeholder, and picking the permanent one is time-sensitive:
see [Canonical domain](#canonical-domain).

Future `/activated` / `/restore` pages and the license webhook will live
alongside the site as Pages Functions (see
[Commercial launch](#commercial-launch)).

### Downloads page

`/downloads` (`apps/web/src/pages/downloads.astro`) lists the latest installer
per platform and the release notes, with older versions collapsed. It reads
GitHub Releases **during `astro build`** — `apps/web/src/lib/releases.ts` — so
the page ships as static HTML and doesn't depend on GitHub's API at runtime.

That build-time read has one consequence worth knowing: **publishing a
release does not update the page.** Cloudflare Pages rebuilds on git push, so
without a nudge the page keeps serving the previous release until an
unrelated commit lands. The nudge is a Cloudflare **deploy hook** —
Workers & Pages → the project → Settings → Builds → Deploy hooks — stored as
`CF_PAGES_DEPLOY_HOOK` and POSTed by the "Refresh the downloads page" step of
the `release` skill.

The hook URL lives in the password manager and must be exported as
`CF_PAGES_DEPLOY_HOOK` in the shell before running the release skill — it is
deliberately **not** a GitHub secret, because the skill runs locally, not in
CI. Without the export the skill's "not set — skipping" branch fires every
release and the page silently stops updating.

It fires from the skill rather than from `release.yml` on purpose:
`release.yml` publishes with the placeholder body and the curated notes are
edited in afterwards, so a rebuild triggered by the workflow would bake the
placeholder into the page. The hook URL is the credential — treat it like a
secret.

If the build ever fails against a rate-limited GitHub API, the fetch picks up
`GITHUB_TOKEN` from the build environment when present. Setting it in the
dashboard may not be enough: `apps/web/wrangler.jsonc` is authoritative for
this project, and Cloudflare ignores dashboard-configured bindings and
variables once that file exists (the build log reports `Build environment
variables` straight from it). Confirm the value actually reaches the build
before concluding the token is the fix — it may need to live in the config
file instead.

### License server (Pages Functions)

The license server is `apps/web/functions` — Cloudflare **Pages Functions**
(file-based routing, deployed automatically by the same git integration as
the rest of `apps/web`), not a standalone Worker. This is a skeleton: the
endpoints and crypto are real and tested, but nothing calls them yet (no
landing-page buy button, no in-app Rust verification) and no live Cloudflare
KV namespace or secrets exist.

```
functions/
  lib/
    env.ts             Env type: KV binding + secret bindings
    kv.ts               get/put license record + single-use order_id index
    license-token.ts    Ed25519 sign + verify (@noble/ed25519) — a separate
                         keypair from the updater's minisign chain
    polar.ts             Standard Webhooks verify (standardwebhooks package)
  purchase-webhook.ts   POST — verify Polar signature, store license in KV
  activate.ts           GET  — look up license, sign token, redirect
  license/[subject].ts   GET — read-only { active, updatesUntil }
  restore.ts            GET  — stubbed 501 until POLAR_API_KEY exists
```

```bash
pnpm --filter @nod/web test               # vitest — real sign+verify round-trips
pnpm --filter @nod/web run typecheck:functions
```

**Corrections to the plan below, found while building this:**

- **Redirect target.** The plan below says `/activate` redirects to
  `prflow://purchase?token=…`. The app doesn't have a custom URL scheme —
  `tauri-plugin-deep-link` isn't a dependency. The *existing* GitHub sign-in
  (`apps/desktop/src-tauri/src/auth.rs`) uses a loopback HTTP server instead
  (`127.0.0.1:8765/callback`), which is what `activate.ts` redirects to today
  (`ACTIVATION_REDIRECT_BASE`, one constant). Swap it for a real `prflow://`
  deep link when/if that plugin gets added — until then this is the
  faithful reuse of the mechanism that already works.
- **Checkout metadata field name** (`metadata.subject` on the Polar
  order) is still an assumption, not confirmed against a real Polar account
  — flagged in `functions/lib/polar.ts`'s file header. Verify against
  Polar's API reference once an account exists.
- **`/activate` is keyed by `?order_id=`, not `?subject=`.** An earlier
  version of this took a bare subject, which is public — anyone could
  have minted themselves a signed license token for any known customer's
  account with zero proof of purchase. The webhook now also stores a
  single-use `order_id → subject` index (`putOrderIndex` / `getOrderIndex`
  / `deleteOrderIndex` in `functions/lib/kv.ts`); `/activate` deletes it once
  it has signed a token, so an activation link only works once and only if
  you have the opaque order id, not just a username. Which query param Polar's actual checkout success URL templates
  in is still to be confirmed once an account exists.

- **Repeat purchases reset the term, they don't extend it.** The webhook
  writes `updatesUntil = now + 1 year` on every `order.paid`, so a customer
  who buys a second time before their first year is up loses the remainder
  rather than stacking it. Fine while there is no renewal flow — worth
  revisiting the moment one exists, since "buy early, lose time" is a bad
  surprise. The fix is to read the existing record and take
  `max(existing.updatesUntil, now) + 1 year`.

**Required secrets** (not in the repo, set via `wrangler pages secret put`
or the Cloudflare dashboard once an account exists): `POLAR_WEBHOOK_SECRET`,
`LICENSE_SIGNING_SEED` (32-byte hex Ed25519 seed). The public half of the
signing keypair is not a Worker secret — it ships embedded in the desktop
app, which is the only thing that verifies tokens. `POLAR_API_KEY` is only
needed once `/restore` is implemented for real.

## Commercial launch

Paid distribution layered on top of the existing updater feed, signing chain,
and CI releases (most of the hard infrastructure is already done).

### Canonical domain

`nodreview.com` is deliberately a placeholder. Every short form of the name is
gone — `nod.com` (1998), `.dev`, `.app`, `.io`, `.sh` are all registered, and
`nod.review` is registry-premium at $500 up front plus $65/yr, which is not
proportionate to a product still behind the validation gate in
[BACKLOG.md](BACKLOG.md) §11c.

Because it's a placeholder, keep it out of anywhere durable: the Homebrew
cask's `homepage` and the README both point at GitHub today, and should stay
that way until the canonical host is final.

**Settle the permanent host before the Polar account exists**, not at some
later traction milestone. Once a payment provider holds a webhook URL, and
shipped binaries have a license-server host compiled in, changing it means
coordinating a provider migration against installed apps — where a redirect
would have been enough beforehand. Traction is precisely when this stops
being cheap.

### Product decision: no license keys

**Rejected:** copy-paste license keys in a receipt email. It breaks the
product philosophy (keyboard-first, zero friction, instant feel) and feels like
software from 2005.

**Chosen:** OAuth-style activation — the browser is the broker, like GitHub
sign-in today but for purchase. User pays → clicks **Open Nod** → app receives
a signed token via deep link → done. No key, no paste, no support tickets about
lost keys.

**Identity: the forge account is the license, not GitHub specifically.** The
app signs in against GitHub, gitlab.com and self-hosted GitLab, and
`accounts::account_id` (apps/desktop/src-tauri/src/accounts.rs) already identifies an
account by `(provider, host, login)`. The license server mirrors that with a
**subject**: `<provider>:<host>:<id>`, e.g. `github:github.com:583231`. An
earlier draft keyed on a bare `github_id`, which would have left paying GitLab
users unrepresentable — and the field name is inside the Ed25519 signature
(`canonicalBytes` in `functions/lib/license-token.ts`), so it is renameable
only until the first token is signed. `id` is the provider's stable numeric
id, never the login, since logins get renamed and this must still resolve at
restore time.

```
Purchase → /activate  →  browser proves identity, server signs a token,
                          loopback hands it to the app  (no in-app OAuth)
Every launch after    →  verify signature + updatesUntil offline against the
                          public key baked into the app  (no network)
New machine / lost    →  browser again → fresh token
```

**The app verifies the signature and expiry only — it does not compare
`subject` against the signed-in account.** That is what keeps every provider
working: a GitLab-only buyer gets a token that verifies, with no GitHub
account anywhere in the app. `subject` is a restore key, not a runtime gate,
and `GET /license/:subject` exists to support restore rather than normal
operation.

Accepted trade-off: a signature-only token is copyable between machines and
people. Binding it to the account would barely help — anyone willing to share
a token file will share the account too — and would cost the multi-provider
property above, which matters more.

Still open: what checkout can actually prove. GitHub OAuth at checkout yields
a github subject; gitlab.com needs a second OAuth app; **self-hosted GitLab is
not verifiable by a public license server at all** and will need a fallback
(`/restore` is already email-first for this reason). That is a web-side
problem with no app impact — see the `metadata.subject` note in
`functions/lib/polar.ts`.

Fallback restore (email-only buyers, support): a lightweight web page queries
the merchant-of-record API by email and redirects back with a signed token —
same deep-link path, no keys.

### What you need (surprisingly little)

| Piece | What | Where |
| --- | --- | --- |
| **Landing page** | Static site — speed video, download links to GitHub release assets, buy button → MoR checkout. No backend. | Cloudflare Pages (preferred — Worker lives next to it) or Vercel. Custom domain (~$15/yr) — `nod.something`, not `*.vercel.app`, before anyone sees it. |
| **Payments** | Merchant of record (MoR), **not** raw Stripe. MoR hosts checkout, processes cards, handles global VAT/sales tax. ~5% + ~50¢/sale. | Paddle, Lemon Squeezy (Stripe-owned), or **Polar** (dev-focused, GitHub-native — good audience fit). Paddle requires site approval → landing page comes first regardless. |
| **License server** | One Cloudflare Worker — three endpoints, tiny KV or D1 for `subject → license` mapping. Not zero-state, but minimal. | Same Cloudflare account as the landing page. |
| **Auth** | None new. The forge account already in the app **is** the license identity (subject = `<provider>:<host>:<id>`). | Existing `auth.rs` + compile-time OAuth secrets. |
| **In-app (Rust)** | Trial, license verify, updater gating, deep-link handler. | `apps/desktop/src-tauri/` — see below. |

No traditional backend. No user database you operate — the MoR is the customer
record; the Worker holds only `subject → { updates_until, order_id }`.

### Cloudflare Worker endpoints

```
POST /purchase-webhook     MoR order.created → verify signature → store license by subject
GET  /activate             Post-checkout success page → sign token → redirect prflow://purchase?token=…
GET  /license/:subject     Restore support → { active, updates_until }
GET  /restore              Email fallback → MoR lookup → same prflow:// redirect
```

Built as Cloudflare **Pages Functions** in `apps/web/functions` (see [License
server](#license-server-pages-functions) above), not a standalone Worker —
see that section for why, and for a correction to the `prflow://` redirect
target assumed above.

Webhook flow: checkout proves a forge identity (OAuth on the success page) →
webhook maps the purchase to that `subject` → Worker stores it. What checkout
can actually prove differs per provider — see [Identity](#product-decision-no-license-keys).

Activation token payload (Ed25519-signed by the Worker, verified in-app with an
embedded public key — same mental model as updater signatures, second keypair):

```json
{
  "order_id": "…",
  "subject": "github:github.com:583231",
  "updates_until": "2028-09-01",
  "signature": "…"
}
```

Renewals: second MoR product ("+1 year of updates") → webhook updates
`updates_until` for the same `subject`.

### In-app work (Rust)

- **`ed25519-dalek` verify** with embedded public key (parallel to existing
  updater minisign chain).
- **Trial:** first-launch timestamp in config dir; on expiry → purchase prompt
  with checkout link (no key field).
- **Deep link:** `prflow://purchase?token=…` via `tauri-plugin-deep-link`
  (also used by §11a extension flow in the backlog). App verifies token,
  stores license locally, dismisses prompt.
- **Launch check:** none needed — the signed token verifies offline against
  the embedded public key. `GET /license/:subject` is for restore, not the
  normal path.
- **Updater gating:** `latest.json` stays fully static; client checks local
  `updates_until` before offering an update. Gating is client-side — fine under
  the no-DRM stance.
- **`nod-keygen` CLI** (optional): same signing crate for manual/support grants
  and refund fixes.

### User flows

**Trial expired → purchase**

```
Your trial has ended.
[ Purchase ]  →  browser opens MoR checkout  →  pay
Thanks!  [ Open Nod ]  →  prflow://purchase?token=…
App: ✓ Purchase verified. Welcome back.
```

**Second machine (common case — signed into GitHub)**

```
Install Nod → Sign in with GitHub → license auto-resolves on launch
```

**Restore (fallback — email only)**

```
[ Restore purchase ]  →  browser: enter email  →  [ Open Nod ]
```

Raycast-style goal: user almost forgets licensing exists.

### Phases, sequencing, and cost

**Phase 0 — free beta (now)**

- Custom domain + static landing page (speed video + GitHub release download
  links).
- No MoR, no Worker, no license code — none of it earns anything until
  retention is proven.
- Gate: own §11c release gate in the backlog (five external devs, one week).
- Cost: ~$15/yr (domain). Fixed monthly: $0.

**Phase 1 — retention proven (~1 week engineering)**

Prerequisites in order:

1. Apple Developer account + notarization (hard gate — see one-time setup).
2. MoR account + product setup (needs approved landing page for Paddle).
3. Cloudflare Worker (webhook + activate + license lookup).
4. In-app: verify / trial / gating / `prflow://purchase` handler (~2–3 days).
5. Wire checkout → GitHub identity on success page.

Running costs: domain + Apple $99/yr + per-sale MoR fees. Fixed monthly: $0
(domain amortized; no database host).

### Commercial launch checklist

**Phase 0**

- [ ] Domain + DNS
- [ ] Static landing page (Astro or Vite + existing Tailwind language)
- [ ] Download buttons → GitHub release assets
- [ ] §11c release gate satisfied

**Phase 1**

- [ ] Apple Developer cert → signing + notarization (drop `xattr` from install docs)
- [ ] MoR account + product(s) — base license + renewal SKU
- [ ] Cloudflare Worker deployed (`/purchase-webhook`, `/activate`, `/license/:id`, `/restore`)
- [ ] Ed25519 license signing keypair (separate from updater minisign key)
- [ ] `tauri-plugin-deep-link` — `prflow://purchase` handler
- [ ] Trial + purchase prompt UI
- [ ] Updater gating on `updates_until`
- [ ] Checkout success page with **Open Nod** button
- [ ] GitHub identity linked at purchase (checkout field or success-page OAuth)
