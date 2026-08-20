/**
 * The price as a machine-readable surface, serialized at build time from the
 * same resolution the pages render (Polar when the build secrets are set,
 * the baked @nod/pricing constants otherwise — `source` says which). It
 * exists so a runtime consumer (the desktop purchase prompt, most likely)
 * can one day read the current price instead of shipping whatever number its
 * build was cut with. Nothing fetches it yet.
 */

import { resolvePricing } from "../lib/pricing";

export async function GET() {
  return Response.json(await resolvePricing());
}
