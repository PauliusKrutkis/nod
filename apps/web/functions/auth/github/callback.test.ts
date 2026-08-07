/**
 * The callback's job is ordering: state is checked against the cookie
 * before any GitHub call, and the Polar checkout is created only after
 * GitHub has vouched for a numeric id — a state mismatch must cost zero
 * outbound requests. The happy path pins the full subject string, since
 * that is the identity the webhook keys the license to.
 *
 * It is also the fork between buying and re-activating, so the cases below
 * pin which one a given subject gets: an owner must never be sent to a
 * second checkout, and a stranger must still reach the first one. The
 * cookie case asserts a 200 rather than only the cleared cookie because a
 * 302 into checkout clears it too — without pinning the branch it would
 * pass against the very code it is meant to rule out.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../../lib/env";
import { verifyLicenseToken } from "../../lib/license-token";
import { onRequestGet } from "./callback";

const SUBJECT = "github:github.com:583231";
const SEED = "9".repeat(64);
const DEEP_LINK_TOKEN = /nod:\/\/purchase\?token=([^"]+)/;

/** Only the two reads this route makes; anything else is an unused stub. */
function kvWith(records: Record<string, unknown>): KVNamespace {
  return {
    get: (key: string) => Promise.resolve(records[key] ?? null),
  } as unknown as KVNamespace;
}

function envWith(kv: KVNamespace): Env {
  return {
    GH_WEB_CLIENT_ID: "Ov23liTEST",
    GH_WEB_CLIENT_SECRET: "shhh",
    POLAR_API_KEY: "polar_oat_test",
    POLAR_PRODUCT_ID: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    LICENSE_SIGNING_SEED: SEED,
    LICENSES: kv,
  } as Env;
}

const ENV = envWith(kvWith({}));

function callback(
  url: string,
  cookie?: string,
  env: Env = ENV
): Promise<Response> {
  const context = {
    request: new Request(url, {
      headers: cookie ? { cookie } : undefined,
    }),
    env,
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
      subject: SUBJECT,
    });
  });

  it("activates an existing owner instead of charging them again", async () => {
    const fetchSpy = happyUpstreams();
    vi.stubGlobal("fetch", fetchSpy);
    const env = envWith(
      kvWith({
        [`license:${SUBJECT}`]: {
          orderId: "ord_7",
          updatesUntil: "2027-08-07T00:00:00.000Z",
        },
      })
    );

    const response = await callback(
      "https://nodreview.com/auth/github/callback?code=c&state=abc",
      "nod_oauth_state=abc",
      env
    );

    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("nod://purchase?token=");
    expect(body).toContain("127.0.0.1:8766");

    expect(
      fetchSpy.mock.calls.some(([input]) =>
        String(input).includes("/v1/checkouts/")
      )
    ).toBe(false);
  });

  it("clears the state cookie when it activates, not just when it charges", async () => {
    vi.stubGlobal("fetch", happyUpstreams());
    const env = envWith(
      kvWith({
        [`license:${SUBJECT}`]: {
          orderId: "ord_7",
          updatesUntil: "2027-08-07T00:00:00.000Z",
        },
      })
    );

    const response = await callback(
      "https://nodreview.com/auth/github/callback?code=c&state=abc",
      "nod_oauth_state=abc",
      env
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("signs a token the app will actually accept", async () => {
    vi.stubGlobal("fetch", happyUpstreams());
    const env = envWith(
      kvWith({
        [`license:${SUBJECT}`]: {
          orderId: "ord_7",
          updatesUntil: "2027-08-07T00:00:00.000Z",
        },
      })
    );

    const response = await callback(
      "https://nodreview.com/auth/github/callback?code=c&state=abc",
      "nod_oauth_state=abc",
      env
    );

    const token = DEEP_LINK_TOKEN.exec(await response.text());
    expect(token).not.toBeNull();

    const { getPublicKeyAsync } = await import("@noble/ed25519");
    const publicKey = Array.from(
      await getPublicKeyAsync(
        Uint8Array.from(
          (SEED.match(/../g) ?? []).map((pair) => Number.parseInt(pair, 16))
        )
      ),
      (byte) => byte.toString(16).padStart(2, "0")
    ).join("");

    const payload = await verifyLicenseToken(
      decodeURIComponent(token?.[1] ?? ""),
      publicKey
    );
    expect(payload).toEqual({
      orderId: "ord_7",
      subject: SUBJECT,
      updatesUntil: "2027-08-07T00:00:00.000Z",
    });
  });
});
