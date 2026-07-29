/**
 * Handler-level tests for GET /license/:subject. Subjects carry colons
 * (`github:github.com:583231`), so the param handling is worth pinning: a
 * catch-all route hands back an array rather than a string, and an absent
 * record must read as inactive rather than 404, since the app treats a
 * missing license as "unlicensed", not "request failed".
 */
import { describe, expect, it } from "vitest";
import type { Env } from "../lib/env";
import { onRequestGet } from "./[subject]";

const SUBJECT = "github:github.com:583231";

function fakeKv(seed: Record<string, string> = {}): KVNamespace {
  const store = new Map<string, string>(Object.entries(seed));
  return {
    get: ((key: string, type?: string) => {
      const value = store.get(key) ?? null;
      return Promise.resolve(
        type === "json" && value !== null ? JSON.parse(value) : value
      );
    }) as KVNamespace["get"],
  } as KVNamespace;
}

function readLicense(
  kv: KVNamespace,
  subject: string | string[]
): Promise<Response> {
  const context = {
    request: new Request("https://x.test/license"),
    env: { LICENSES: kv } as Env,
    params: { subject },
  };
  return (onRequestGet as (c: typeof context) => Promise<Response>)(context);
}

describe("GET /license/:subject", () => {
  it("reports an unknown subject as inactive rather than missing", async () => {
    const response = await readLicense(fakeKv(), SUBJECT);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ active: false });
  });

  it("returns the stored expiry for a known subject", async () => {
    const kv = fakeKv({
      [`license:${SUBJECT}`]: JSON.stringify({
        orderId: "order_1",
        updatesUntil: "2027-07-18",
      }),
    });

    const response = await readLicense(kv, SUBJECT);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      active: true,
      updatesUntil: "2027-07-18",
    });
  });

  it("never leaks the order id backing a license", async () => {
    const kv = fakeKv({
      [`license:${SUBJECT}`]: JSON.stringify({
        orderId: "order_secret",
        updatesUntil: "2027-07-18",
      }),
    });

    const body = await (await readLicense(kv, SUBJECT)).text();

    expect(body).not.toContain("order_secret");
  });

  it("takes the first segment when the param arrives as an array", async () => {
    const kv = fakeKv({
      [`license:${SUBJECT}`]: JSON.stringify({
        orderId: "order_1",
        updatesUntil: "2027-07-18",
      }),
    });

    const response = await readLicense(kv, [SUBJECT, "ignored"]);

    expect(await response.json()).toEqual({
      active: true,
      updatesUntil: "2027-07-18",
    });
  });

  it("rejects an empty subject", async () => {
    const response = await readLicense(fakeKv(), "");
    expect(response.status).toBe(400);
  });
});
