/**
 * GET /buy — start of the purchase flow: mint a state nonce into the
 * Path=/auth cookie and hand the visitor to GitHub's consent screen. The
 * callback (auth/github/callback.ts) finishes the loop into a Polar
 * checkout.
 *
 * 503 until every credential exists: the pricing card only points here once
 * PUBLIC_CHECKOUT_URL is set at flip-on (docs/LAUNCH.md step 7), but the
 * route is public before that, and half-configured purchasing should read
 * as "not open", not as a GitHub error page or a checkout that cannot be
 * fulfilled. redirect_uri is derived from the request origin — on
 * production it equals the registered callback; anywhere else GitHub
 * rejects the mismatch instead of silently sending a stranger's code here.
 */
import type { Env } from "./lib/env";
import { authorizeUrl, stateCookie } from "./lib/github-oauth";
import { isCheckoutConfigured } from "./lib/polar";

export const onRequestGet: PagesFunction<Env> = (context) => {
  const { env } = context;
  const clientId = env.GH_WEB_CLIENT_ID;
  if (!(clientId && env.GH_WEB_CLIENT_SECRET && isCheckoutConfigured(env))) {
    return Promise.resolve(
      new Response("purchasing is not open yet", { status: 503 })
    );
  }

  const origin = new URL(context.request.url).origin;
  const state = crypto.randomUUID();
  return Promise.resolve(
    new Response(null, {
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
    })
  );
};
