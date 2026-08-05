/**
 * The callback's job is ordering: state is checked against the cookie
 * before any GitHub call, and the Polar checkout is created only after
 * GitHub has vouched for a numeric id — a state mismatch must cost zero
 * outbound requests. The happy path pins the full subject string, since
 * that is the identity the webhook keys the license to.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../../lib/env";
import { onRequestGet } from "./callback";

const ENV = {
  GH_WEB_CLIENT_ID: "Ov23liTEST",
  GH_WEB_CLIENT_SECRET: "shhh",
  POLAR_API_KEY: "polar_oat_test",
  POLAR_PRODUCT_ID: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
} as Env;

function callback(url: string, cookie?: string): Promise<Response> {
  const context = {
    request: new Request(url, {
      headers: cookie ? { cookie } : undefined,
    }),
    env: ENV,
  };
  return (onRequestGet as (c: typeof context) => Promise<Response>)(context);
}

function happyUpstreams(): ReturnType<typeof vi.fn> {
  return vi.fn((input: string) => {
    const target = String(input);
    if (target.includes("login/oauth/access_token")) {
      return Promise.resolve(Response.json({ access_token: "gho_test" }));
    }
    if (target.includes("api.github.com/user")) {
      return Promise.resolve(Response.json({ id: 583_231 }));
    }
    return Promise.resolve(
      Response.json({ id: "co_1", url: "https://sandbox.polar.sh/c/co_1" })
    );
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GET /auth/github/callback", () => {
  it("rejects a state mismatch before any upstream call", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const response = await callback(
      "https://nodreview.com/auth/github/callback?code=c&state=forged",
      "nod_oauth_state=genuine"
    );

    expect(response.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects a missing cookie the same way", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const response = await callback(
      "https://nodreview.com/auth/github/callback?code=c&state=abc"
    );

    expect(response.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("trades the code for an id and redirects into the checkout", async () => {
    const fetchSpy = happyUpstreams();
    vi.stubGlobal("fetch", fetchSpy);

    const response = await callback(
      "https://nodreview.com/auth/github/callback?code=c&state=abc",
      "nod_oauth_state=abc"
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://sandbox.polar.sh/c/co_1"
    );
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");

    const checkoutCall = fetchSpy.mock.calls.find(([input]) =>
      String(input).includes("/v1/checkouts/")
    ) as [string, RequestInit];
    expect(JSON.parse(checkoutCall[1].body as string).metadata).toEqual({
      subject: "github:github.com:583231",
    });
  });
});
