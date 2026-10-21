import { createHmac, timingSafeEqual } from "node:crypto";
import type { Db } from "@/lib/db/types";
import { requireCap } from "@/lib/auth/user";
import { AppError, ValidationError } from "@/lib/errors";
import { getAudit, markAuditPaid, type AuditRow } from "./audits";
import { logAudit, type Ctx } from "./context";

/**
 * Stripe adapter (TASK-025). Payment-provider details stay here; Stripe only moves an audit from OFFERED to PAID
 * through the same transition as manual confirmation. Configure with STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET.
 */
const STRIPE_API = "https://api.stripe.com/v1";
export const SIGNATURE_TOLERANCE_S = 300;

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

// ---------------------------------------------------------------------------
// Checkout link for an offered audit
// ---------------------------------------------------------------------------
export async function createAuditCheckout(ctx: Ctx, auditId: string): Promise<string> {
  requireCap(ctx.user, "audit.sell");
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new ValidationError("Stripe is not configured on this environment");
  const audit = await getAudit(ctx, auditId);
  if (audit.status !== "OFFERED") throw new ValidationError("Payment links can only be created for offered (unpaid) audits");
  if (audit.stripe_checkout_url && audit.stripe_checkout_expires_at && new Date(audit.stripe_checkout_expires_at) > new Date(Date.now() + 3600_000)) {
    return audit.stripe_checkout_url; // still valid for at least an hour: reuse instead of creating duplicates
  }

  const form = new URLSearchParams({
    mode: "payment",
    client_reference_id: audit.id,
    "metadata[audit_id]": audit.id,
    "payment_intent_data[metadata][audit_id]": audit.id,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": audit.currency.toLowerCase(),
    "line_items[0][price_data][unit_amount]": String(audit.price_cents),
    "line_items[0][price_data][product_data][name]": `Agentic Operations Audit — ${audit.company_name}`,
    success_url: `${appUrl()}/paid`,
    cancel_url: `${appUrl()}/paid?cancelled=1`,
  });
  const res = await fetch(`${STRIPE_API}/checkout/sessions`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/x-www-form-urlencoded", "idempotency-key": `audit-${audit.id}-${Date.now()}` },
    body: form,
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; url?: string; expires_at?: number; error?: { message?: string } };
  if (!res.ok || !body.id || !body.url) {
    throw new AppError(`Stripe rejected the payment link: ${body.error?.message ?? res.status}`, 502, "STRIPE_ERROR");
  }
  const expiresAt = body.expires_at ? new Date(body.expires_at * 1000) : null;
  await ctx.db.transaction(async (tx) => {
    await tx.query(
      "update audits set stripe_checkout_session_id = $2, stripe_checkout_url = $3, stripe_checkout_expires_at = $4, updated_at = now() where id = $1",
      [audit.id, body.id, body.url, expiresAt],
    );
    await logAudit(tx, ctx.user, "audit", audit.id, "stripe_checkout_created", null, { session_id: body.id, amount_cents: audit.price_cents, currency: audit.currency });
  });
  return body.url;
}

// ---------------------------------------------------------------------------
// Webhook
// ---------------------------------------------------------------------------
/** Verifies the `Stripe-Signature` header (t=…, v1=HMAC-SHA256(`${t}.${rawBody}`)) with a replay window. */
export function verifyStripeSignature(rawBody: string, header: string | null, secret: string | undefined, nowS = Math.floor(Date.now() / 1000)): boolean {
  if (!secret || !header) return false;
  const parts = header.split(",").map((p) => p.trim().split("="));
  const t = Number(parts.find(([k]) => k === "t")?.[1]);
  const signatures = parts.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!Number.isFinite(t) || signatures.length === 0 || Math.abs(nowS - t) > SIGNATURE_TOLERANCE_S) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex"));
  return signatures.some((sig) => {
    const got = Buffer.from(sig ?? "");
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
}

export interface StripeEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

export type WebhookOutcome = "paid" | "duplicate" | "ignored" | "already_paid" | "amount_mismatch" | "unknown_audit";

const PAID_EVENTS = new Set(["checkout.session.completed", "checkout.session.async_payment_succeeded"]);

/**
 * Applies one Stripe event. Idempotent on event id. Only a fully paid checkout whose amount and currency match the
 * audit price marks it paid; anything else is recorded for manual review and acknowledged so Stripe stops retrying.
 */
export async function handleStripeEvent(db: Db, event: StripeEvent): Promise<WebhookOutcome> {
  if (!event?.id || !event.type) throw new ValidationError("Malformed Stripe event");
  return db.transaction(async (tx) => {
    const [seen] = await tx.query("select 1 from integration_events where provider = 'stripe' and external_event_id = $1", [event.id]);
    if (seen) return "duplicate";

    let outcome: WebhookOutcome = "ignored";
    const obj = event.data?.object ?? {};
    const auditId = (obj.metadata as Record<string, string> | undefined)?.audit_id ?? (obj.client_reference_id as string | undefined);
    if (PAID_EVENTS.has(event.type) && obj.payment_status === "paid" && auditId) {
      const [audit] = await tx.query<Pick<AuditRow, "id" | "status" | "price_cents" | "currency" | "opportunity_id">>(
        "select id, status, price_cents, currency, opportunity_id from audits where id::text = $1",
        [auditId],
      );
      const amount = Number(obj.amount_total);
      const currency = String(obj.currency ?? "").toUpperCase();
      if (!audit) outcome = "unknown_audit";
      else if (audit.status !== "OFFERED") outcome = "already_paid";
      else if (amount !== Number(audit.price_cents) || currency !== audit.currency) outcome = "amount_mismatch";
      else {
        const created = Number(obj.created ?? 0);
        await markAuditPaid(tx, null, audit, {
          paidAt: created ? new Date(created * 1000) : new Date(),
          reference: String(obj.payment_intent ?? obj.id ?? event.id),
          actorLabel: "integration:stripe",
          via: "stripe",
        });
        outcome = "paid";
      }
    }
    await tx.query("insert into integration_events(provider, external_event_id, payload) values ('stripe', $1, $2)", [
      event.id,
      JSON.stringify({ type: event.type, outcome, audit_id: auditId ?? null, object_id: obj.id ?? null, amount_total: obj.amount_total ?? null, currency: obj.currency ?? null }),
    ]);
    if (outcome !== "ignored") {
      await logAudit(tx, null, "integration_event", null, `stripe_${outcome}`, null, { event_id: event.id, type: event.type, audit_id: auditId ?? null }, "integration:stripe");
    }
    return outcome;
  });
}
