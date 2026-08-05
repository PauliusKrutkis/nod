import { Webhook } from "standardwebhooks";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createCheckout,
  extractCheckoutId,
  extractSubject,
  isCheckoutConfigured,
  isOrderPaidEvent,
  polarApiBase,
  verifyPolarWebhook,
} from "./polar";

const secret = `whsec_${btoa("test-webhook-secret")}`;

/**
 * Signs the way Polar actually signs: HMAC key = UTF-8 bytes of the whole
 * secret string, expressed as base64 for the standardwebhooks constructor —
 * the exact derivation in polar-js's validateEvent. Deliberately independent
 * of verifyPolarWebhook's internals so a regression to `new Webhook(secret)`
 * fails these tests instead of round-tripping.
 */
function sign(webhookSecret: string, msgId: string, payload: string) {
  const timestamp = new Date();
  const signature = new Webhook(btoa(webhookSecret)).sign(
    msgId,
    timestamp,
    payload
  );
  return {
    "webhook-id": msgId,
    "webhook-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
    "webhook-signature": signature,
  };
}

describe("polar webhook verification", () => {
  it("accepts a validly signed order.paid event and extracts the subject", () => {
    const event = {
      type: "order.paid",
      data: {
        id: "order_1",
        metadata: { subject: "github:github.com:583231" },
      },
    };
    const payload = JSON.stringify(event);
    const headers = sign(secret, "msg_1", payload);

    const result = verifyPolarWebhook(payload, headers, secret);

    expect(result.verified).toBe(true);
    if (result.verified) {
      expect(isOrderPaidEvent(result.event)).toBe(true);
      if (isOrderPaidEvent(result.event)) {
        expect(extractSubject(result.event)).toBe("github:github.com:583231");
      }
    }
  });

  it("reads the checkout id an order.paid event was created from", () => {
    const event = {
      type: "order.paid",
      data: { id: "order_1", checkout_id: "checkout_1" },
    } as const;

    expect(extractCheckoutId(event)).toBe("checkout_1");
  });

  it("reports no checkout id for an order created outside a checkout", () => {
    expect(
      extractCheckoutId({ type: "order.paid", data: { id: "order_1" } })
    ).toBeNull();
    expect(
      extractCheckoutId({
        type: "order.paid",
        data: { id: "order_1", checkout_id: null },
      })
    ).toBeNull();
  });

  it("rejects a payload signed with a different secret", () => {
    const payload = JSON.stringify({
      type: "order.paid",
      data: { id: "order_1" },
    });
    const headers = sign(`whsec_${btoa("wrong-secret")}`, "msg_2", payload);

    expect(verifyPolarWebhook(payload, headers, secret)).toEqual({
      verified: false,
    });
  });

  it("rejects a payload tampered with after signing", () => {
    const original = JSON.stringify({
      type: "order.paid",
      data: { id: "order_1" },
    });
    const headers = sign(secret, "msg_3", original);
    const tampered = JSON.stringify({
      type: "order.paid",
      data: { id: "order_evil" },
    });

    expect(verifyPolarWebhook(tampered, headers, secret)).toEqual({
      verified: false,
    });
  });

  it("ignores event types other than order.paid", () => {
    expect(isOrderPaidEvent({ type: "checkout.updated", data: {} })).toBe(
      false
    );
  });
});

const CHECKOUT_ENV = {
  POLAR_API_KEY: "polar_oat_test",
  POLAR_PRODUCT_ID: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
};

describe("polarApiBase", () => {
  it("defaults to the sandbox so a bare deploy can never charge", () => {
    expect(polarApiBase({})).toBe("https://sandbox-api.polar.sh");
  });

  it("uses the configured base when one is set", () => {
    expect(polarApiBase({ POLAR_API_BASE: "https://api.polar.sh" })).toBe(
      "https://api.polar.sh"
    );
  });
});

describe("createCheckout", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts the product, subject metadata, and templated success url", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(
        Response.json({ id: "co_1", url: "https://sandbox.polar.sh/c/co_1" })
      );
    vi.stubGlobal("fetch", fetchSpy);

    const url = await createCheckout(
      CHECKOUT_ENV,
      "github:github.com:583231",
      "https://nodreview.com"
    );

    expect(url).toBe("https://sandbox.polar.sh/c/co_1");
    const [endpoint, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(endpoint).toBe("https://sandbox-api.polar.sh/v1/checkouts/");
    expect(init.headers).toMatchObject({
      authorization: "Bearer polar_oat_test",
    });
    expect(JSON.parse(init.body as string)).toEqual({
      products: ["3fa85f64-5717-4562-b3fc-2c963f66afa6"],
      success_url: "https://nodreview.com/activate?checkout_id={CHECKOUT_ID}",
      metadata: { subject: "github:github.com:583231" },
    });
  });

  it("throws on missing configuration without fetching", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    expect(isCheckoutConfigured({})).toBe(false);
    await expect(
      createCheckout({}, "github:github.com:1", "https://nodreview.com")
    ).rejects.toThrow("not configured");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("throws on a Polar error response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("nope", { status: 401 }))
    );

    await expect(
      createCheckout(CHECKOUT_ENV, "github:github.com:1", "https://x.test")
    ).rejects.toThrow("401");
  });

  it("throws when the response carries no checkout url", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ id: "co_1" }))
    );

    await expect(
      createCheckout(CHECKOUT_ENV, "github:github.com:1", "https://x.test")
    ).rejects.toThrow("no url");
  });
});
