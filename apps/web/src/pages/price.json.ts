/**
 * The price as a machine-readable surface, serialized at build time from the
 * same resolution the pages render (Polar when the build secrets are set,
 * its baked fallback constants otherwise — `source` says which). The desktop
 * app's `fetch_site_pricing` command reads it at runtime, so installed builds
 * quote the current price instead of whatever number they were compiled with.
 */

import { resolvePricing } from "../lib/pricing";

export async function GET() {
  return Response.json(await resolvePricing());
}
