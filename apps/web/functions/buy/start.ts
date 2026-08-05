/**
 * GET /buy/start — the OAuth leg of the purchase flow: mint a state nonce
 * into the Path=/auth cookie and hand the visitor to GitHub's consent
 * screen. The callback (auth/github/callback.ts) finishes the loop into a
 * Polar checkout.
 *
 * Deliberately NOT the /buy route: /buy is a static page (src/pages/
 * buy.astro) that explains why sign-in comes before payment, and a Pages
 * function on the same path would shadow it. Nobody should land on
 * GitHub's consent screen without that page setting it up first.
 *
 * 503 until every credential exists: the pricing card only points at /buy
 * once PUBLIC_CHECKOUT_URL is set at flip-on (docs/LAUNCH.md step 7), but
 * the route is public before that, and half-configured purchasing should
 * read as "not open", not as a GitHub error page or a checkout that cannot
 * be fulfilled. redirect_uri is derived from the request origin — on
 * production it equals the registered callback; anywhere else GitHub
 * rejects the mismatch instead of silently sending a stranger's code here.
 */
import type { Env } from "../lib/env";
import { authorizeUrl, stateCookie } from "../lib/github-oauth";
import { isCheckoutConfigured } from "../lib/polar";
import { withErrorReporting } from "../lib/report";

export const onRequestGet: PagesFunction<Env> = withErrorReporting(
  (context) => {
    const { env } = context;
    const clientId = env.GH_WEB_CLIENT_ID;
    if (!(clientId && env.GH_WEB_CLIENT_SECRET && isCheckoutConfigured(env))) {
      return new Response("purchasing is not open yet", { status: 503 });
    }

    const origin = new URL(context.request.url).origin;
    const state = crypto.randomUUID();
    return new Response(null, {
      status: 302,
      headers: {
        location: authorizeUrl(
          clientId,
          `${origin}/auth/github/callback`,
          state
        ),
        "set-cookie": stateCookie(state),
        "cache-control": "no-store",
      },
    });
  }
);
