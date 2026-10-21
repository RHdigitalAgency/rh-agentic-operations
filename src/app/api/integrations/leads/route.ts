import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { toAppError } from "@/lib/errors";
import { ingestLead, parseLeadEvent, rateLimit, verifyIngestionAuth } from "@/server/ingestion";
import { jsonError } from "../../_lib";

const MAX_BODY_BYTES = 64 * 1024;

/**
 * POST /api/integrations/leads — lead events from Instagram Growth Automation, website forms, etc.
 * Auth: `x-rh-signature: sha256=<hex HMAC-SHA256 of the raw body>` using INSTAGRAM_INGESTION_SHARED_SECRET.
 * Idempotent on external_event_id. Contract: README "Lead ingestion API".
 */
export async function POST(req: NextRequest) {
  const secret = process.env.INSTAGRAM_INGESTION_SHARED_SECRET;
  if (!secret) return jsonError(503, "DISABLED", "Lead ingestion is not configured on this environment");
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!rateLimit(`ingest:${ip}`)) return jsonError(429, "RATE_LIMITED", "Too many requests");

  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return jsonError(413, "TOO_LARGE", "Payload too large");
  const raw = await req.text();
  if (Buffer.byteLength(raw) > MAX_BODY_BYTES) return jsonError(413, "TOO_LARGE", "Payload too large");
  if (!verifyIngestionAuth(raw, req.headers, secret)) return jsonError(401, "UNAUTHORIZED", "Missing or invalid x-rh-signature");

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return jsonError(400, "VALIDATION", "Body must be JSON");
  }
  try {
    const event = parseLeadEvent(body);
    const db = await getDb();
    let result;
    try {
      result = await ingestLead(db, event);
    } catch (e) {
      // Concurrent replay of the same event: the unique index wins, the retry returns the original.
      if ((e as { code?: string }).code === "23505" && event.external_event_id) result = await ingestLead(db, event);
      else throw e;
    }
    return NextResponse.json({ data: { opportunity_id: result.opportunityId, duplicate: result.duplicate } }, { status: result.duplicate ? 200 : 201 });
  } catch (e) {
    const err = toAppError(e);
    if (err) return jsonError(err.status, err.code, err.message);
    console.error("lead ingestion failed", e);
    return jsonError(500, "INTERNAL", "Unexpected error");
  }
}
