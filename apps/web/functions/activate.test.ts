/**
 * Handler-level tests for /activate. The KV helpers are covered in
 * lib/kv.test.ts; what matters here is the ordering this endpoint imposes on
 * them — the order index is a customer's single activation link, so it must
 * survive every failure path and be consumed only once a token actually
 * exists. Swapping the sign and delete calls leaves every unit test green.
 */
import { describe, expect, it } from "vitest";
import { onRequestGet } from "./activate";
import type { Env } from "./lib/env";
import { verifyLicenseToken } from "./lib/license-token";

const SIGNING_SEED = "ab".repeat(32);
const SUBJECT = "github:github.com:583231";
const DEEP_LINK_PATTERN = /href="(prflow:\/\/purchase\?token=[^"]+)"/;

function fakeKv(seed: Record<string, string> = {}): KVNamespace {
  const store = new Map<string, string>(Object.entries(seed));
  return {
    get: ((key: string, type?: string) => {
      const value = store.get(key) ?? null;
      return Promise.resolve(
        type === "json" && value !== null ? JSON.parse(value) : value
      );
    }) as KVNamespace["get"],
    put: ((key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve();
    }) as KVNamespace["put"],
    delete: ((key: string) => {
      store.delete(key);
      return Promise.resolve();
    }) as KVNamespace["delete"],
  } as KVNamespace;
}

function licensedKv(): KVNamespace {
  return fakeKv({
    "order:order_1": SUBJECT,
    [`license:${SUBJECT}`]: JSON.stringify({
      orderId: "order_1",
      updatesUntil: "2027-07-18",
    }),
  });
}

function activate(kv: KVNamespace, url: string): Promise<Response> {
  const context = {
    request: new Request(url),
    env: { LICENSES: kv, LICENSE_SIGNING_SEED: SIGNING_SEED } as Env,
  };
  return (onRequestGet as (c: typeof context) => Promise<Response>)(context);
}

describe("GET /activate", () => {
  it("rejects a request with no order id", async () => {
    const response = await activate(licensedKv(), "https://x.test/activate");
    expect(response.status).toBe(400);
  });

  it("signs a token and bakes it into both handoff paths", async () => {
    const kv = licensedKv();
    const response = await activate(
      kv,
      "https://x.test/activate?order_id=order_1"
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");

    const html = await response.text();
    const deepLink = html.match(DEEP_LINK_PATTERN);
    expect(deepLink).not.toBeNull();
    const token = new URL(deepLink?.[1] ?? "").searchParams.get("token");
    expect(token).not.toBeNull();
    expect(html).toContain(
      `http://127.0.0.1:8765/callback?token=${token ?? ""}`
    );

    const { getPublicKeyAsync } = await import("@noble/ed25519");
    const publicKey = Array.from(
      await getPublicKeyAsync(
        Uint8Array.from(
          (SIGNING_SEED.match(/../g) ?? []).map((pair) =>
            Number.parseInt(pair, 16)
          )
        )
      ),
      (byte) => byte.toString(16).padStart(2, "0")
    ).join("");

    expect(await verifyLicenseToken(token ?? "", publicKey)).toEqual({
      orderId: "order_1",
      subject: SUBJECT,
      updatesUntil: "2027-07-18",
    });
  });

  it("consumes the activation link so a replay fails", async () => {
    const kv = licensedKv();
    const first = await activate(
      kv,
      "https://x.test/activate?order_id=order_1"
    );
    expect(first.status).toBe(200);

    const replay = await activate(
      kv,
      "https://x.test/activate?order_id=order_1"
    );
    expect(replay.status).toBe(404);
  });

  it("keeps the link usable when no license backs the order id", async () => {
    const kv = fakeKv({ "order:order_1": SUBJECT });

    const first = await activate(
      kv,
      "https://x.test/activate?order_id=order_1"
    );
    expect(first.status).toBe(404);

    expect(await kv.get("order:order_1")).toBe(SUBJECT);
  });

  it("keeps the link usable when signing fails", async () => {
    const kv = licensedKv();
    const context = {
      request: new Request("https://x.test/activate?order_id=order_1"),
      env: { LICENSES: kv, LICENSE_SIGNING_SEED: "not-a-valid-seed" } as Env,
    };

    await expect(
      (onRequestGet as (c: typeof context) => Promise<Response>)(context)
    ).rejects.toThrow();

    expect(await kv.get("order:order_1")).toBe(SUBJECT);
  });

  it("404s an order id that was never issued", async () => {
    const response = await activate(
      licensedKv(),
      "https://x.test/activate?order_id=order_nope"
    );
    expect(response.status).toBe(404);
  });
});
