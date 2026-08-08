/**
 * Handler-level tests for /activate. The KV helpers are covered in
 * lib/kv.test.ts; what matters here is the lifecycle this endpoint imposes on
 * the checkout index — it must survive every failure path untouched, and only a
 * successful token signing may start the 48-hour activation window. Swapping
 * the sign and re-put calls leaves every unit test green.
 */
import { describe, expect, it } from "vitest";
import { onRequestGet } from "./activate";
import type { Env } from "./lib/env";
import { verifyLicenseToken } from "./lib/license-token";

const SIGNING_SEED = "ab".repeat(32);
const SUBJECT = "github:github.com:583231";
const DEEP_LINK_PATTERN = /href="(nod:\/\/purchase\?token=[^"]+)"/;

interface FakeKv {
  kv: KVNamespace;
  ttls: Map<string, number | undefined>;
}

function fakeKv(seed: Record<string, string> = {}): FakeKv {
  const store = new Map<string, string>(Object.entries(seed));
  const ttls = new Map<string, number | undefined>();
  const kv = {
    get: ((key: string, type?: string) => {
      const value = store.get(key) ?? null;
      return Promise.resolve(
        type === "json" && value !== null ? JSON.parse(value) : value
      );
    }) as KVNamespace["get"],
    put: ((
      key: string,
      value: string,
      options?: { expirationTtl?: number }
    ) => {
      store.set(key, value);
      ttls.set(key, options?.expirationTtl);
      return Promise.resolve();
    }) as KVNamespace["put"],
    delete: ((key: string) => {
      store.delete(key);
      return Promise.resolve();
    }) as KVNamespace["delete"],
  } as KVNamespace;
  return { kv, ttls };
}

function licensedKv(): FakeKv {
  return fakeKv({
    "checkout:checkout_1": SUBJECT,
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

async function tokenFromPage(response: Response): Promise<string | null> {
  const html = await response.text();
  const deepLink = html.match(DEEP_LINK_PATTERN)?.[1];
  if (!deepLink) {
    return null;
  }
  return new URL(deepLink).searchParams.get("token");
}

describe("GET /activate", () => {
  it("rejects a request with no checkout id", async () => {
    const response = await activate(licensedKv().kv, "https://x.test/activate");
    expect(response.status).toBe(400);
  });

  it("signs a token into the Open Nod deep link", async () => {
    const { kv } = licensedKv();
    const response = await activate(
      kv,
      "https://x.test/activate?checkout_id=checkout_1"
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");

    const token = await tokenFromPage(response);
    expect(token).not.toBeNull();

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

  it("pushes the same token at the app's purchase listener", async () => {
    const { kv } = licensedKv();
    const response = await activate(
      kv,
      "https://x.test/activate?checkout_id=checkout_1"
    );

    const html = await response.text();
    const token = html.match(DEEP_LINK_PATTERN)?.[1]?.split("token=")[1];
    expect(token).toBeTruthy();
    expect(html).toContain(
      `http://127.0.0.1:8766/callback?token=${token ?? ""}`
    );
  });

  it("starts the activation window instead of consuming the link", async () => {
    const { kv, ttls } = licensedKv();

    const first = await activate(
      kv,
      "https://x.test/activate?checkout_id=checkout_1"
    );
    expect(first.status).toBe(200);
    expect(ttls.get("checkout:checkout_1")).toBe(48 * 60 * 60);

    const reload = await activate(
      kv,
      "https://x.test/activate?checkout_id=checkout_1"
    );
    expect(reload.status).toBe(200);
    expect(await tokenFromPage(reload)).toEqual(await tokenFromPage(first));
  });

  it("keeps the link intact when no license backs the checkout id", async () => {
    const { kv, ttls } = fakeKv({ "checkout:checkout_1": SUBJECT });

    const response = await activate(
      kv,
      "https://x.test/activate?checkout_id=checkout_1"
    );
    expect(response.status).toBe(200);
    expect(await tokenFromPage(response)).toBeNull();

    expect(await kv.get("checkout:checkout_1")).toBe(SUBJECT);
    expect(ttls.has("checkout:checkout_1")).toBe(false);
  });

  it("keeps the link intact when signing fails", async () => {
    const { kv, ttls } = licensedKv();
    const context = {
      request: new Request("https://x.test/activate?checkout_id=checkout_1"),
      env: { LICENSES: kv, LICENSE_SIGNING_SEED: "not-a-valid-seed" } as Env,
    };

    await expect(
      (onRequestGet as (c: typeof context) => Promise<Response>)(context)
    ).rejects.toThrow();

    expect(await kv.get("checkout:checkout_1")).toBe(SUBJECT);
    expect(ttls.has("checkout:checkout_1")).toBe(false);
  });

  it("answers an unknown checkout id with a waiting page, not a 404", async () => {
    const response = await activate(
      licensedKv().kv,
      "https://x.test/activate?checkout_id=checkout_nope"
    );

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Preparing your activation");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("waits by polling in the background, never by reloading itself", async () => {
    const response = await activate(
      licensedKv().kv,
      "https://x.test/activate?checkout_id=checkout_nope"
    );
    const html = await response.text();

    expect(html).not.toContain('http-equiv="refresh"');
    expect(html).not.toContain("retry=");
    expect(html).toContain("/activate?checkout_id=checkout_nope&poll=1");
  });

  it("reports not-ready as json while the license is still missing", async () => {
    const response = await activate(
      licensedKv().kv,
      "https://x.test/activate?checkout_id=checkout_nope&poll=1"
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({ ready: false });
  });

  it("reports ready as json once the license resolves", async () => {
    const response = await activate(
      licensedKv().kv,
      "https://x.test/activate?checkout_id=checkout_1&poll=1"
    );

    expect(await response.json()).toEqual({ ready: true });
  });

  it("never signs a token or extends the window while polling", async () => {
    const { kv, ttls } = licensedKv();

    const response = await activate(
      kv,
      "https://x.test/activate?checkout_id=checkout_1&poll=1"
    );

    expect(Object.keys((await response.json()) as object)).toEqual(["ready"]);
    expect(ttls.has("checkout:checkout_1")).toBe(false);
  });
});
