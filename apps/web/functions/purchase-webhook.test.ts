/**
 * Handler-level tests for /purchase-webhook. Signature verification and
 * payload parsing are covered in lib/polar.test.ts; what matters here is the
 * term arithmetic — a repeat purchase must extend the customer's running
 * `updatesUntil` rather than reset it, and a lapsed term must restart from
 * now, not stack onto the past.
 */
import { Webhook } from "standardwebhooks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "./lib/env";
import { getCheckoutIndex, getLicense } from "./lib/kv";
import { onRequestPost } from "./purchase-webhook";

const SECRET = `whsec_${btoa("test-webhook-secret")}`;
const SUBJECT = "github:github.com:583231";
const NOW = Date.parse("2026-08-02T00:00:00Z");
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

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

function orderPaid(
  kv: KVNamespace,
  orderId: string,
  checkoutId: string | null = `checkout_${orderId}`
): Promise<Response> {
  const payload = JSON.stringify({
    type: "order.paid",
    data: {
      id: orderId,
      checkout_id: checkoutId,
      metadata: { subject: SUBJECT },
    },
  });
  const timestamp = new Date();
  const headers = {
    "webhook-id": `msg_${orderId}`,
    "webhook-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
    "webhook-signature": new Webhook(btoa(SECRET)).sign(
      `msg_${orderId}`,
      timestamp,
      payload
    ),
  };
  const context = {
    request: new Request("https://x.test/purchase-webhook", {
      body: payload,
      headers,
      method: "POST",
    }),
    env: { LICENSES: kv, POLAR_WEBHOOK_SECRET: SECRET } as Env,
  };
  return (onRequestPost as (c: typeof context) => Promise<Response>)(context);
}

describe("POST /purchase-webhook", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("grants a first purchase one year from now", async () => {
    const kv = fakeKv();
    const response = await orderPaid(kv, "order_1");

    expect(response.status).toBe(200);
    expect(await getLicense(kv, SUBJECT)).toEqual({
      orderId: "order_1",
      updatesUntil: new Date(NOW + YEAR_MS).toISOString(),
    });
    expect(await getCheckoutIndex(kv, "checkout_order_1")).toBe(SUBJECT);
  });

  it("stores the license but no index when the order had no checkout", async () => {
    const kv = fakeKv();
    const response = await orderPaid(kv, "order_1", null);

    expect(response.status).toBe(200);
    expect(await getLicense(kv, SUBJECT)).toEqual({
      orderId: "order_1",
      updatesUntil: new Date(NOW + YEAR_MS).toISOString(),
    });
    expect(await getCheckoutIndex(kv, "checkout_order_1")).toBeNull();
  });

  it("extends a running term instead of resetting it", async () => {
    const runningUntil = NOW + 100 * 24 * 60 * 60 * 1000;
    const kv = fakeKv({
      [`license:${SUBJECT}`]: JSON.stringify({
        orderId: "order_1",
        updatesUntil: new Date(runningUntil).toISOString(),
      }),
    });

    await orderPaid(kv, "order_2");

    expect(await getLicense(kv, SUBJECT)).toEqual({
      orderId: "order_2",
      updatesUntil: new Date(runningUntil + YEAR_MS).toISOString(),
    });
  });

  it("restarts a lapsed term from now, not from the past", async () => {
    const kv = fakeKv({
      [`license:${SUBJECT}`]: JSON.stringify({
        orderId: "order_1",
        updatesUntil: new Date(NOW - YEAR_MS).toISOString(),
      }),
    });

    await orderPaid(kv, "order_2");

    expect(await getLicense(kv, SUBJECT)).toEqual({
      orderId: "order_2",
      updatesUntil: new Date(NOW + YEAR_MS).toISOString(),
    });
  });

  it("treats an unparseable stored term as lapsed", async () => {
    const kv = fakeKv({
      [`license:${SUBJECT}`]: JSON.stringify({
        orderId: "order_1",
        updatesUntil: "not-a-date",
      }),
    });

    await orderPaid(kv, "order_2");

    expect(await getLicense(kv, SUBJECT)).toEqual({
      orderId: "order_2",
      updatesUntil: new Date(NOW + YEAR_MS).toISOString(),
    });
  });
});
