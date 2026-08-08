# Launch runbook — from code-complete to paid

Everything code-side shipped in PRs #123–#155 (see
[RELEASING.md — Commercial launch](RELEASING.md#commercial-launch) for the
design and [BACKLOG.md §11c](BACKLOG.md#11c-commercial-launch) for history).
What remains is almost entirely **account work only the owner can do**, in
dependency order below. Work top to bottom; each step says who acts.

> **Gate first:** the [release gate](BACKLOG.md#product-position) still applies —
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

Create the account (sandbox first), one product: **Nod license, $59,
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
activation, deep-link activation (macOS bundled build for `nod://`),
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
- ~~Delete the stale pre-monorepo `src-tauri/` dir at the repo root.~~ Done
  2026-08-06. The warning about it holding a local `.env` with OAuth dev
  credentials was already out of date: what remained was 5.1 GB of
  regenerable build output (`target/` plus Tauri's `gen/schemas/`) and no
  `.env` at all. The live build directory is `apps/desktop/src-tauri/target`
  and was untouched.

## Live checklist (Aug 2026)

The concrete remaining actions, distilled from the steps above. Tick as
they land.

The Pages project is **`pr-flow`** — it predates the rename to Nod and stays
that way, because Cloudflare has no rename for a Pages project and recreating
one means re-pointing `nodreview.com`. Every `wrangler pages` command below
therefore needs `--project-name pr-flow`. Production and
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
      **Nod license, $59, one-time**.
- [x] Webhook endpoint `https://nodreview.com/purchase-webhook`, format
      **Raw**, event `order.paid`; secret → `POLAR_WEBHOOK_SECRET`.
      **Verified with real deliveries 2026-08-05** — and the original
      "unsigned POST gets 401" check turned out to prove nothing: every
      genuine delivery also got 401 until PR #194 fixed the HMAC key
      derivation (Polar keys off the raw secret string; standardwebhooks
      base64-decodes its input, so the verifier must pass `btoa(secret)`).
      The secret was also re-put from the API-readable endpoint value
      (`GET /v1/webhooks/endpoints/{id}` exposes it), and Pages secrets
      only bind on the **next deployment** — remember that when rotating.
- [x] Organization access token → `POLAR_API_KEY` (checkout creation now,
      `/restore` later). Stored but not yet read by any code path.
- [x] New **web** GitHub OAuth app — homepage `https://nodreview.com`,
      callback `https://nodreview.com/auth/github/callback`. That is the
      whole registration; an OAuth App has no scope field, `read:user` is
      requested in the authorize URL by the buy-flow code. Must be a second
      app, not the desktop one (step 5 says why). Client secret → Pages
      secret `GH_WEB_CLIENT_SECRET`; client id → `GH_WEB_CLIENT_ID` in
      `apps/web/wrangler.jsonc` (it is public). Both set and verified
      2026-08-05; **the buy flow is unblocked**. The id was briefly also a
      repo variable named `NOD_GH_WEB_CLIENT_ID`; that copy was deleted
      2026-08-06 because no workflow ever read it and a second home for the
      same value is a chance for the two to disagree.
- [x] `node scripts/generate-license-keypair.mjs` (from `apps/web`):
      seed → `LICENSE_SIGNING_SEED` Pages secret **+ offline backup**;
      pubkey → `NOD_LICENSE_PUBKEY` repo variable. Both set 2026-08-04.
      **Keypair PROVEN 2026-08-05**: a live sandbox purchase ran the whole
      chain (checkout → webhook → license stored → `/activate` signed a
      token) and the token's Ed25519 signature verifies against
      `NOD_LICENSE_PUBKEY`. Step 6's remaining scope is only the app-side
      part: deep-link/loopback activation in a build that embeds the
      pubkey (no shipped release has it yet), plus repeat-purchase term
      extension.

Owner — site launch prep (Aug 2026), before the forum posts:

- [x] **Cloudflare Email Routing** for `hello@nodreview.com` — CF dashboard
      → nodreview.com zone → Email → Email Routing, forward to a personal
      inbox. Live (MX → `route{1,2,3}.mx.cloudflare.net`); the address is
      published by the /about page (PR #186). It is inbound-only and it
      forwards, which leaves the three gaps below.
- [x] **Keep forwarded mail out of spam.** Routing preserves the original
      `From:` and rewrites only the envelope (SRS), so SPF passes without
      aligning, and CF's own DKIM (`cf2024-1._domainkey`, present) signs as
      `nodreview.com`, which does not align either. DMARC then rides
      entirely on the sender's own signature surviving the hop, so any
      sender that doesn't DKIM-sign arrives DMARC-fail from an IP the
      receiving side has never seen them use. Fixed inbox-side 2026-08-07: a
      Gmail filter on `to:hello@nodreview.com` → *Never send it to Spam*,
      plus a `nod/hello` label. The match is on the recipient, not the
      sender, so it holds regardless of whose signature survives the hop.
      Verified with a real inbound message. Diagnose any future stray with
      Show original before assuming. Note that mailing hello@ from your own
      personal address is not a valid test — the forward comes back claiming
      to be from you, off a non-Google IP, which always scores as spoofing.
- [x] **Publish DMARC** — was NXDOMAIN, so the domain was spoofable and
      outbound mail as `hello@` trusted less. This does not fix the
      forwarding problem above; it is table stakes for the domain. Live
      2026-08-07 at monitoring strength:

      ```
      _dmarc  TXT  "v=DMARC1; p=none; rua=mailto:hello@nodreview.com; fo=1"
      ```

      `p=none` changes no delivery decisions. Read a week or two of the
      aggregate reports landing at `hello@` before tightening to
      `quarantine`, and do not tighten until Resend below is verified —
      that is what makes outbound actually align.

- [x] **Reply as `hello@`, not from a personal address.** There is no SMTP
      behind Email Routing, so hitting reply puts a personal address on mail
      answering the product's published contact address. Decided: **Resend
      free tier** (3,000/month, 100/day, one domain, SMTP relay included on
      every tier) wired into Gmail's *Send mail as*; its AUP restricts
      content and purpose, not message type, and replying to someone who
      wrote to you is opted-in by definition. Resend puts the envelope
      sender on `send.nodreview.com` with its own SPF, so the root SPF
      record stays as it is and nothing collides with the CF include —
      alignment comes from the DKIM key it issues at the root. Verification
      wants three records, not two: DKIM (TXT at the root), SPF (TXT on
      `send.`), and an **MX on `send.`** pointing at
      `feedback-smtp.<region>.amazonses.com` priority 10, which is the
      bounce/complaint return path. MX records only affect the subdomain
      they sit on, so this one does not disturb the root MX — Routing keeps
      receiving while Resend sends. Zoho's free
      tier was the alternative and lost: no IMAP/POP/SMTP and no forwarding
      on free, so it cannot connect to Gmail in either direction. If a real
      mailbox on the domain is ever wanted, Zoho Mail Lite (~$1/user/month)
      is the destination, not a larger Resend plan.

      Live 2026-08-07. Resend's Cloudflare integration wrote all three
      records itself; region `eu-west-1`, so the MX is
      `feedback-smtp.eu-west-1.amazonses.com`. Gmail *Send mail as* uses
      host `smtp.resend.com`, port 587, TLS, username the literal string
      `resend`, password an API key. Scope that key to **Sending access**
      on this domain — the default Full-access key can also mint and revoke
      keys and add or remove domains, which an SMTP password has no business
      doing. Ownership is proven by a code Google mails to `hello@`, which
      arrives through Routing, so the verify step exercises both directions
      at once.

      Gmail's *When replying to a message → reply from the same address the
      message was sent to* only appears once the alias is verified, and it
      governs Gmail's own clients only. Third-party clients keep their own
      copy: in Shortwave, run Settings → Support → **Refresh Gmail data** to
      pick up an alias added after sign-in, then set its alias preference
      separately. Any other client will need the same treatment.
- [x] **`www` DNS + redirect** — done 2026-08-07. Proxied `www` CNAME to the
      apex, plus a Redirect Rule (`http_request_dynamic_redirect` phase) on
      `http.host eq "www.nodreview.com"` → 301 with target expression
      `concat("https://nodreview.com", http.request.uri.path)` and
      `preserve_query_string`. Both halves are required together: the CNAME
      alone would serve a Pages error, since `www` is not a custom domain on
      the project. The rule answers at the edge, so Pages never sees the
      request and the CNAME target is irrelevant — it exists only to make
      the hostname proxied. Verified: `/about?ref=test` survives the hop
      with path and query intact; apex still 200.
- [ ] **Merge the site-prep PRs**: #182 (og:image), #183 (404/robots/
      sitemap), #186 (about/privacy), #189 (Windows .exe) are independent;
      the copy stack #184 → #185 → #188 merges bottom-up, retargeting each
      PR to `main` after its base lands.
- [ ] After merging, spot-check production: link unfurl (paste the URL in
      Slack/Discord), `curl -I https://nodreview.com/robots.txt` returns
      text/plain, an unknown path returns 404, /about renders.
- [x] **Cloudflare Web Analytics** — **live and verified in production
      2026-08-06** (PR #205): every Base.astro page serves the beacon, held
      across 12 consecutive samples once the edge cache turned over. Ticked
      only on that evidence, because the whole point of this entry is that a
      dashboard which *looks* configured proved nothing. The site was
      created 2026-07-29
      (site tag `2b3423c5…`, beacon token `92b8fbe9…`, zone
      `nodreview.com`) but has been **effectively dead since 2026-08-02**.
      It was set up with `auto_install`, which injects the beacon by
      rewriting HTML at the zone edge — a path that does not apply to
      Pages-served responses. All it ever recorded was 40 sampled-adjusted
      views on three days (Jul 29 / 31, Aug 2), every one of them a direct
      US hit to `/`; the counts are all multiples of 10, consistent with a
      10× sample rate over ~4 real events, and it reads as bot or monitor
      traffic rather than visitors. Nothing since, and the served HTML
      carries no beacon at all. The fix feeds the token to the in-code
      beacon (PR #186's path) via `vars` in `apps/web/wrangler.jsonc` —
      **not** the dashboard/API, which is silently ignored for plain-text
      vars once that file declares a `vars` block. That mechanism is
      verified: a preview deployment carrying the token under
      `env.preview.vars` rendered the beacon, which is also what proves a
      `vars` entry reaches the *build* and not just Functions at runtime.
      One thing is still owed, and needs the dashboard because a Pages-scoped
      API token cannot write RUM config: **turn `auto_install` off** on the
      Web Analytics site. It injects nothing for Pages, so it is inert today,
      but leaving it armed means a future Cloudflare change could start a
      second beacon and double every number.
      Cookieless; /about's privacy copy already describes it.
      Verify after any change with
      `curl -sS https://nodreview.com/ | grep -c cloudflareinsights`
      — expect `1`, and expect `0` on preview deployments by design.
- [x] **Sentry for the payment functions** — set up 2026-08-06, EU region
      (`ingest.de.sentry.io`, chosen to match what /about promises about
      where data goes). DSN → `SENTRY_DSN` production Pages secret, bound on
      the deploy after it was set, since a Pages secret only takes effect on
      the next build. The DSN itself is proven: a hand-built envelope in the
      shape `errorEnvelope()` produces was accepted with a `200`.
      **Not** proven is a real production error reaching Sentry — every
      wrapped handler is payment plumbing (`/activate`,
      `/purchase-webhook`, `/license/:subject`, `/auth/github/callback`,
      `/buy/start`) and none has a safe synthetic failure path, so
      manufacturing one to test a logger was not worth it. The next sandbox
      purchase run exercises all of them and settles it.
      Note `report.ts` only fires on **thrown** errors: a handler that
      catches its own failure and returns a status — `/buy/start`'s 503 when
      unconfigured — stays invisible by design.

Notarization stays deferred per step 2; the decision for the launch posts
is to ship without it and take the Gatekeeper criticism.

Code — unblocked once the OAuth app exists:

- [x] Buy-flow page: GitHub sign-in → create Polar checkout with
      `metadata.subject = github:github.com:<id>` and the success URL
      above. Built as /buy + /auth/github/callback in PRs #192 + #193
      (stacked on this branch); both routes answer 503 until every
      credential exists. At flip-on, `PUBLIC_CHECKOUT_URL` points at
      `https://nodreview.com/buy`.
- [x] Re-key the license index from `order_id` to `checkout_id`
      (`functions/lib/kv.ts`, `activate.ts`, the purchase webhook + tests).
- [x] Sandbox/production Polar API base switch: `POLAR_API_BASE` var,
      code defaults to the sandbox API (PR #192). Production flip-on adds
      `"POLAR_API_BASE": "https://api.polar.sh"` to wrangler.jsonc vars.
- [x] **Owner:** copy the sandbox product id (Polar dashboard → the Nod
      license product → its uuid) into `POLAR_PRODUCT_ID` in
      wrangler.jsonc `vars`. Done 2026-08-05 on the buy-flow branch
      (`3ed56e3a-edbd-4723-a89d-52bdadcba7ac`); at production flip-on the
      value swaps to the production org's product id.
- [ ] Polar secrets for the `preview` environment, if step 6 is to run
      against a preview URL rather than production — preview currently has
      only `GITHUB_TOKEN`.

Deferred until the [release gate](BACKLOG.md#product-position) passes:

- [ ] Apple Developer Program + `APPLE_*` secrets (step 2).
- [ ] Register individuali veikla at VMI (income from Polar payouts).
- [ ] Production Polar org; re-do webhook/token secrets against it.
- [ ] Flip-on: `NOD_CHECKOUT_URL`, `PUBLIC_CHECKOUT_URL`, cut a release
      (step 7).
