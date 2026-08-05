/**
 * The wrapper's contract: handler behavior is untouched (same response,
 * same thrown error) whether or not a DSN exists, and a report goes out
 * only on a throw with a valid DSN. The envelope wire format is pinned
 * loosely — endpoint URL and the error message inside the payload — not
 * field-by-field, so Sentry-side additions don't churn these tests.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { envelopeUrl, withErrorReporting } from "./report";

const DSN = "https://publickey@o12345.ingest.sentry.io/67890";
const ENVELOPE_URL = "https://o12345.ingest.sentry.io/api/67890/envelope/";

function contextFor(env: { SENTRY_DSN?: string }) {
  return {
    request: new Request("https://x.test/activate?order_id=order_1"),
    env,
    waitUntil: (_promise: Promise<unknown>) => {
      /* the tests assert on fetch calls, not on completion */
    },
  };
}

type Handler = (c: ReturnType<typeof contextFor>) => Promise<Response>;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("envelopeUrl", () => {
  it("derives the ingest endpoint from a DSN", () => {
    expect(envelopeUrl(DSN)).toBe(ENVELOPE_URL);
  });

  it("rejects strings that are not a usable DSN", () => {
    expect(envelopeUrl("not a url")).toBeNull();
    expect(envelopeUrl("https://o12345.ingest.sentry.io/67890")).toBeNull();
    expect(
      envelopeUrl("https://publickey@o12345.ingest.sentry.io/")
    ).toBeNull();
  });
});

describe("withErrorReporting", () => {
  it("passes a successful response through without fetching", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const wrapped = withErrorReporting(() =>
      Promise.resolve(new Response("ok"))
    ) as Handler;

    const response = await wrapped(contextFor({ SENTRY_DSN: DSN }));

    expect(await response.text()).toBe("ok");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("reports a thrown error to the envelope endpoint and rethrows", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response(null));
    vi.stubGlobal("fetch", fetchSpy);
    const wrapped = withErrorReporting(() =>
      Promise.reject(new Error("seed is not 64 hex chars"))
    ) as Handler;

    await expect(wrapped(contextFor({ SENTRY_DSN: DSN }))).rejects.toThrow(
      "seed is not 64 hex chars"
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(ENVELOPE_URL);
    expect(init.body).toContain("seed is not 64 hex chars");
    expect(init.body).toContain("https://x.test/activate");
    expect(init.body).not.toContain("order_id");
  });

  it("stays silent without a DSN but still rethrows", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const wrapped = withErrorReporting(() =>
      Promise.reject(new Error("boom"))
    ) as Handler;

    await expect(wrapped(contextFor({}))).rejects.toThrow("boom");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("never lets a failing report replace the original error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("sentry unreachable"))
    );
    const wrapped = withErrorReporting(() =>
      Promise.reject(new Error("boom"))
    ) as Handler;

    await expect(wrapped(contextFor({ SENTRY_DSN: DSN }))).rejects.toThrow(
      "boom"
    );
  });
});
