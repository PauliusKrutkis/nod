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
([why](RELEASING.md#canonical-domain)). **Decided: `nodreview.com` is
final** (live since Aug 2026).

## 2. Apple notarization — owner account + repo secrets

Hard prerequisite for charging macOS users
([setup](RELEASING.md#apple-notarization)): Apple Developer Program
($99/yr) → Developer ID Application cert → the `APPLE_*` repo secrets.
Tauri signs + notarizes during the existing release build; no workflow
changes needed. Afterwards: drop the `xattr` note from the README, cask
template, and landing page, and re-test `brew install` on a clean machine.

## 3. Ed25519 license keypair — owner, one-time

Run `node scripts/generate-license-keypair.mjs` from `apps/web` — it
prints both halves in the exact format the signer expects. Then:

- `LICENSE_SIGNING_SEED` (64 hex chars) → Cloudflare Pages secret, never in
  the repo:

  ```sh
  pnpm --filter @nod/web exec wrangler pages secret put \
    LICENSE_SIGNING_SEED --project-name pr-flow
  ```

  Generate it in your own terminal, not through an agent session — the seed
  should exist in exactly two places, the Pages secret store and your offline
  backup.
- `NOD_LICENSE_PUBKEY` (public half, hex) → GitHub repo **variable**; the
  release workflow already forwards it into the build. **Back the seed up**
  like the updater minisign key — lose it and every sold license dies.

## 4. Polar — owner account, then verification

Create the account (sandbox first), one product: **Nod license, $39,
one-time** (renewal SKU can wait). Configure:

- Webhook → `https://nodreview.com/purchase-webhook`, secret →
  `POLAR_WEBHOOK_SECRET` Pages secret.
- Checkout success URL →
  `https://nodreview.com/activate?checkout_id={CHECKOUT_ID}`.

The two assumptions flagged in `functions/lib/polar.ts` are **verified**
against Polar's OpenAPI spec (Aug 2026):

- Checkout metadata **is** copied to the resulting order ("Metadata set on
  the checkout will be copied to the resulting order and/or subscription"),
  so `metadata.subject` on `order.paid` works as designed.
- The only success-URL template variable is `{CHECKOUT_ID}` — there is no
  order-id variable. The `order.paid` payload carries `checkout_id`
  alongside the order id, so the webhook indexes the license by
  `checkout_id` and `/activate` reads `?checkout_id=`. **Done** — the KV
  index is `checkout:<checkout_id>` and the query param matches. The signed
  token still carries the real `orderId`, which is what support traces a
  refund by and what the desktop verifier's canonical JSON expects, so no
  desktop-side change was needed.

## 5. Forge identity at checkout — the one real code task left

Nothing currently puts `metadata.subject` on a Polar order, so the webhook
has nothing to key a license to. Needs, in order: a **web** GitHub OAuth
app (owner registers; callback on the site), then a small buy-flow page —
sign in with GitHub →
redirect into Polar checkout carrying `subject = github:github.com:<id>`
(mechanism per step 4's verification). gitlab.com wants a second OAuth app
later; self-hosted GitLab stays email-restore-only by design. Buildable the
day the OAuth app exists.

**It must be a second app, not the desktop one.** Partly because it cannot
be: an OAuth App holds one callback URL, and GitHub matches `redirect_uri`
on host and port, which `127.0.0.1:8765` (`auth.rs`) and `nodreview.com` do
not share. Mostly because the desktop client secret is compiled into every
shipped binary (`option_env!("PRFLOW_GH_CLIENT_SECRET")`) and is therefore
public — fine for a loopback flow, where the redirect is the real boundary,
but this flow is what binds a GitHub identity to a paid license. Trusting a
client whose secret ships in every download would let anyone forge the
`subject` a license is keyed by. Ask for `read:user` only: the numeric id is
all checkout needs, and the desktop app's `repo read:org` on a payment
consent screen is both alarming and a wider blast radius than the flow
warrants.

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

## Live checklist (Aug 2026)

The concrete remaining actions, distilled from the steps above. Tick as
they land.

The Pages project is **`pr-flow`** (it predates the rename to Nod); every
`wrangler pages` command below needs `--project-name pr-flow`. Production and
preview hold separate secret sets — add `--env preview` for anything a
preview deployment has to exercise.

wrangler is a devDependency of `apps/web`, so run it through the workspace
rather than a global install (there isn't one) or bare `npx` (which refetches
an unpinned version each time):

```sh
pnpm --filter @nod/web exec wrangler pages secret list --project-name pr-flow
```

Owner — now (all free):

- [x] Polar **sandbox** org (`sandbox.polar.sh`, slug `nod`), product
      **Nod license, $39, one-time**.
- [x] Webhook endpoint `https://nodreview.com/purchase-webhook`, format
      **Raw**, event `order.paid`; secret → `POLAR_WEBHOOK_SECRET`.
      Verified live: an unsigned POST gets 401, so the binding is real.
- [x] Organization access token → `POLAR_API_KEY` (checkout creation now,
      `/restore` later). Stored but not yet read by any code path.
- [x] New **web** GitHub OAuth app — homepage `https://nodreview.com`,
      callback `https://nodreview.com/auth/github/callback`. That is the
      whole registration; an OAuth App has no scope field, `read:user` is
      requested in the authorize URL by the buy-flow code. Must be a second
      app, not the desktop one (step 5 says why). Client secret → Pages
      secret `GH_WEB_CLIENT_SECRET`; client id → repo variable
      `NOD_GH_WEB_CLIENT_ID` (it is public). Both set and verified
      2026-08-05; **the buy flow is unblocked**.
- [x] `node scripts/generate-license-keypair.mjs` (from `apps/web`):
      seed → `LICENSE_SIGNING_SEED` Pages secret **+ offline backup**;
      pubkey → `NOD_LICENSE_PUBKEY` repo variable. Both set 2026-08-04.
      Still unproven that the two halves are the same keypair — CF secret
      values are write-only, so only a signing round-trip through
      `/activate` can confirm it. A mismatch would surface as activation
      failures in already-shipped binaries; prove it before the first sale.

Owner — site launch prep (Aug 2026), before the forum posts:

- [ ] **Cloudflare Email Routing** for `hello@nodreview.com` — CF dashboard
      → nodreview.com zone → Email → Email Routing, forward to a personal
      inbox. The address is published by the /about page (PR #186), so set
      up routing before that PR merges.
- [ ] **`www` DNS + redirect** — `www.nodreview.com` has no DNS record at
      all today. Add a `www` CNAME on the zone (proxied) plus a redirect
      rule to the apex.
- [ ] **Merge the site-prep PRs**: #182 (og:image), #183 (404/robots/
      sitemap), #186 (about/privacy), #189 (Windows .exe) are independent;
      the copy stack #184 → #185 → #188 merges bottom-up, retargeting each
      PR to `main` after its base lands.
- [ ] After merging, spot-check production: link unfurl (paste the URL in
      Slack/Discord), `curl -I https://nodreview.com/robots.txt` returns
      text/plain, an unknown path returns 404, /about renders.
- [ ] **Cloudflare Web Analytics** — dashboard → Analytics → Web Analytics,
      add nodreview.com, copy the beacon token → `PUBLIC_CF_ANALYTICS_TOKEN`
      Pages **build** env var (production only). The site renders the
      beacon only when the token exists (PR #186), so nothing shows up
      until this is set. Cookieless; /about's privacy copy already
      describes it.
- [ ] **Sentry for the payment functions** — create a (free-tier) Sentry
      project, copy its DSN → `SENTRY_DSN` Pages secret. /activate,
      /purchase-webhook, and /license/:subject report thrown errors and
      no-op without the secret (PR #190). Do this at the latest with
      step 4, so webhook failures are visible from the first sandbox test.

Notarization stays deferred per step 2; the decision for the launch posts
is to ship without it and take the Gatekeeper criticism.

Code — unblocked once the OAuth app exists:

- [ ] Buy-flow page: GitHub sign-in → create Polar checkout with
      `metadata.subject = github:github.com:<id>` and the success URL
      above.
- [x] Re-key the license index from `order_id` to `checkout_id`
      (`functions/lib/kv.ts`, `activate.ts`, the purchase webhook + tests).
- [ ] Sandbox/production Polar API base switch (env var, defaults sandbox).
      Nothing calls the Polar API yet, so this lands with the buy flow.
- [ ] Polar secrets for the `preview` environment, if step 6 is to run
      against a preview URL rather than production — preview currently has
      only `GITHUB_TOKEN`.

Deferred until the [release gate](BACKLOG.md#release-gate) passes:

- [ ] Apple Developer Program + `APPLE_*` secrets (step 2).
- [ ] Register individuali veikla at VMI (income from Polar payouts).
- [ ] Production Polar org; re-do webhook/token secrets against it.
- [ ] Flip-on: `NOD_CHECKOUT_URL`, `PUBLIC_CHECKOUT_URL`, cut a release
      (step 7).
