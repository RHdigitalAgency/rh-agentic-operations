import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { handleStripeEvent, verifyStripeSignature, type StripeEvent } from "@/server/stripe";
import { jsonError } from "../../_lib";

/**
 * POST /api/integrations/stripe — Stripe webhook (checkout.session.completed / async_payment_succeeded).
 * Verified with STRIPE_WEBHOOK_SECRET; disabled (503) until configured.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return jsonError(503, "DISABLED", "Stripe webhook is not configured on this environment");
  const raw = await req.text();
  if (raw.length > 512 * 1024) return jsonError(413, "TOO_LARGE", "Payload too large");
  if (!verifyStripeSignature(raw, req.headers.get("stripe-signature"), secret)) {
    return jsonError(400, "BAD_SIGNATURE", "Invalid Stripe signature");
  }
  let event: StripeEvent;
  try {
    event = JSON.parse(raw);
  } catch {
    return jsonError(400, "VALIDATION", "Body must be JSON");
  }
  try {
    const outcome = await handleStripeEvent(await getDb(), event);
    return NextResponse.json({ received: true, outcome });
  } catch (e) {
    if (e instanceof AppError) return jsonError(e.status, e.code, e.message);
    console.error("stripe webhook failed", e);
    return jsonError(500, "INTERNAL", "Unexpected error"); // Stripe retries 5xx
  }
}
