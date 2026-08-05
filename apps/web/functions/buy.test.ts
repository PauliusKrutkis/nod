/**
 * /buy either refuses (any credential missing) or hands the visitor to
 * GitHub with a fresh state nonce that matches the cookie it just set —
 * those are the only two behaviors, and both redirect internals
 * (authorizeUrl, stateCookie) are covered in lib/github-oauth.test.ts.
 */
import { describe, expect, it } from "vitest";
import { onRequestGet } from "./buy";
import type { Env } from "./lib/env";

const STATE_COOKIE = /nod_oauth_state=([^;]+)/;

const CONFIGURED = {
  GH_WEB_CLIENT_ID: "Ov23liTEST",
  GH_WEB_CLIENT_SECRET: "shhh",
  POLAR_API_KEY: "polar_oat_test",
  POLAR_PRODUCT_ID: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
} as Env;

function buy(env: Env): Promise<Response> {
  const context = {
    request: new Request("https://nodreview.com/buy"),
    env,
  };
  return (onRequestGet as (c: typeof context) => Promise<Response>)(context);
}

describe("GET /buy", () => {
  it("answers 503 while any purchase credential is missing", async () => {
    const withoutSecret = { ...CONFIGURED, GH_WEB_CLIENT_SECRET: undefined };
    const withoutProduct = { ...CONFIGURED, POLAR_PRODUCT_ID: undefined };

    expect((await buy({} as Env)).status).toBe(503);
    expect((await buy(withoutSecret)).status).toBe(503);
    expect((await buy(withoutProduct)).status).toBe(503);
  });

  it("redirects to GitHub with a state that matches the cookie", async () => {
    const response = await buy(CONFIGURED);

    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.origin).toBe("https://github.com");
    expect(location.searchParams.get("redirect_uri")).toBe(
      "https://nodreview.com/auth/github/callback"
    );

    const cookie = response.headers.get("set-cookie") ?? "";
    const cookieState = cookie.match(STATE_COOKIE)?.[1];
    expect(cookieState).toBeTruthy();
    expect(location.searchParams.get("state")).toBe(cookieState);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
