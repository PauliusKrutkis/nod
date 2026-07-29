/**
 * GET /license/:subject — read-only license status. No auth: "active"
 * only means a license exists, and a lapsed updatesUntil doesn't revoke the
 * app (client-side updater gating, no DRM — see docs/RELEASING.md).
 */
import type { Env } from "../lib/env";
import { getLicense } from "../lib/kv";

export const onRequestGet: PagesFunction<Env, "subject"> = async (context) => {
  const { subject: param } = context.params;
  const subject = Array.isArray(param) ? param[0] : param;
  if (!subject) {
    return new Response("missing subject", { status: 400 });
  }

  const record = await getLicense(context.env.LICENSES, subject);
  if (record === null) {
    return Response.json({ active: false });
  }
  return Response.json({ active: true, updatesUntil: record.updatesUntil });
};
