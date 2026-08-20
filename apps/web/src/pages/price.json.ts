/**
 * The price as a machine-readable surface, serialized from @nod/pricing at
 * build time. The pages already interpolate the same source, so this file
 * adds no second copy — it exists so a runtime consumer (the desktop
 * purchase prompt, most likely) can one day read the current price instead
 * of shipping whatever number its build was cut with. Nothing fetches it
 * yet.
 */

import { pricing } from "@nod/pricing";

export function GET() {
  return Response.json(pricing);
}
