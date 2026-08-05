/**
 * Error reporting for the payment-path functions, talking to Sentry's
 * envelope endpoint directly instead of pulling in the SDK. A root
 * functions/_middleware.ts would be the SDK's integration point, but Pages
 * runs root middleware for every request including static assets, which
 * would put a function invocation in front of a site designed to serve
 * statically. Reports are fire-and-forget through waitUntil and the error
 * always rethrows, so a handler behaves identically with and without a
 * DSN; no DSN configured means no fetch at all.
 */

interface ReportEnv {
  SENTRY_DSN?: string;
}

export function envelopeUrl(dsn: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(dsn);
  } catch {
    return null;
  }
  const projectId = parsed.pathname.slice(1);
  if (!(parsed.username && projectId)) {
    return null;
  }
  return `${parsed.protocol}//${parsed.host}/api/${projectId}/envelope/`;
}

export function errorEnvelope(
  dsn: string,
  error: unknown,
  request: Request
): string {
  const event = {
    event_id: crypto.randomUUID().replaceAll("-", ""),
    timestamp: Date.now() / 1000,
    platform: "javascript",
    level: "error",
    exception: {
      values: [
        {
          type: error instanceof Error ? error.name : "Error",
          value: error instanceof Error ? error.message : String(error),
        },
      ],
    },
    request: {
      method: request.method,
      url: request.url,
    },
  };
  return [
    JSON.stringify({ dsn, sent_at: new Date().toISOString() }),
    JSON.stringify({ type: "event" }),
    JSON.stringify(event),
  ].join("\n");
}

export function withErrorReporting<
  E extends ReportEnv,
  P extends string = never,
>(handler: PagesFunction<E, P>): PagesFunction<E, P> {
  return async (context) => {
    try {
      return await handler(context);
    } catch (error) {
      const dsn = context.env.SENTRY_DSN;
      const url = dsn ? envelopeUrl(dsn) : null;
      if (dsn && url) {
        context.waitUntil(
          fetch(url, {
            method: "POST",
            body: errorEnvelope(dsn, error, context.request),
          }).catch(() => undefined)
        );
      }
      throw error;
    }
  };
}
