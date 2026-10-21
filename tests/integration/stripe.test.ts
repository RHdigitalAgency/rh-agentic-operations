import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHmac } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { setupTestEnv, type TestEnv } from "../helpers";
import { createLead, getOpportunity } from "@/server/crm";
import { confirmAuditPayment, getAudit, offerAudit } from "@/server/audits";
import { createAuditCheckout, handleStripeEvent, verifyStripeSignature, type StripeEvent } from "@/server/stripe";

const sign = (body: string, secret: string, t = Math.floor(Date.now() / 1000)) =>
  `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;

describe("Stripe signature verification", () => {
  const body = JSON.stringify({ id: "evt_1" });
  it("accepts a valid signature and rejects tampering, wrong secrets, stale timestamps and missing headers", () => {
    expect(verifyStripeSignature(body, sign(body, "whsec_test"), "whsec_test")).toBe(true);
    expect(verifyStripeSignature(body + " ", sign(body, "whsec_test"), "whsec_test")).toBe(false);
    expect(verifyStripeSignature(body, sign(body, "other"), "whsec_test")).toBe(false);
    expect(verifyStripeSignature(body, sign(body, "whsec_test", Math.floor(Date.now() / 1000) - 3600), "whsec_test")).toBe(false);
    expect(verifyStripeSignature(body, null, "whsec_test")).toBe(false);
    expect(verifyStripeSignature(body, sign(body, "whsec_test"), undefined)).toBe(false);
  });
});

describe("Stripe audit payments (mocked Stripe API)", () => {
  let env: TestEnv;
  const audits: Record<string, string> = {};
  const opps: Record<string, string> = {};

  async function offeredAudit(name: string, priceCents = 150000) {
    const oppId = await createLead(env.as("sales"), { company_name: name, source: "outbound", next_action: "Call" });
    await env.db.query("update opportunities set stage = 'FIT_QUALIFIED' where id = $1", [oppId]); // shortcut to the relevant stage
    opps[name] = oppId;
    audits[name] = await offerAudit(env.as("sales"), oppId, { price_cents: priceCents });
    return audits[name];
  }
  const paidEvent = (id: string, auditId: string, amount: number, extra: Record<string, unknown> = {}): StripeEvent => ({
    id,
    type: "checkout.session.completed",
    data: { object: { id: `cs_${id}`, payment_status: "paid", amount_total: amount, currency: "usd", payment_intent: `pi_${id}`, metadata: { audit_id: auditId }, created: 1792500000, ...extra } },
  });

  beforeAll(async () => {
    env = await setupTestEnv();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.STRIPE_SECRET_KEY;
  });

  it("creates a Checkout link for the audit's exact price and reuses it while valid", async () => {
    const auditId = await offeredAudit("Miami Pools LLC");
    await expect(createAuditCheckout(env.as("sales"), auditId)).rejects.toThrow(/not configured/);
    process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ id: "cs_test_1", url: "https://checkout.stripe.com/c/pay/cs_test_1", expires_at: Math.floor(Date.now() / 1000) + 86400 }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const url = await createAuditCheckout(env.as("sales"), auditId);
    expect(url).toBe("https://checkout.stripe.com/c/pay/cs_test_1");
    const [calledUrl, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(calledUrl).toBe("https://api.stripe.com/v1/checkout/sessions");
    const form = new URLSearchParams(String(init.body));
    expect(form.get("line_items[0][price_data][unit_amount]")).toBe("150000");
    expect(form.get("line_items[0][price_data][currency]")).toBe("usd");
    expect(form.get("metadata[audit_id]")).toBe(auditId);
    expect(form.get("client_reference_id")).toBe(auditId);
    expect((await getAudit(env.as("sales"), auditId)).stripe_checkout_session_id).toBe("cs_test_1");
    await createAuditCheckout(env.as("sales"), auditId);
    expect(fetchMock).toHaveBeenCalledTimes(1); // reused, no duplicate session
    await expect(createAuditCheckout(env.as("analyst"), auditId)).rejects.toThrow(/permission/);
  });

  it("marks the audit paid from a verified paid event, advances the deal, and ignores replays", async () => {
    const auditId = audits["Miami Pools LLC"];
    expect(await handleStripeEvent(env.db, paidEvent("evt_paid_1", auditId, 150000))).toBe("paid");
    const audit = await getAudit(env.as("admin"), auditId);
    expect(audit).toMatchObject({ status: "PAID", payment_reference: "pi_evt_paid_1" });
    expect((await getOpportunity(env.as("admin"), opps["Miami Pools LLC"])).stage).toBe("AUDIT_PAID");
    expect(await handleStripeEvent(env.db, paidEvent("evt_paid_1", auditId, 150000))).toBe("duplicate");
    expect(await handleStripeEvent(env.db, paidEvent("evt_paid_2", auditId, 150000))).toBe("already_paid");
    const [log] = await env.db.query<{ actor_label: string }>("select actor_label from audit_log where entity_id = $1 and action = 'payment_confirmed'", [auditId]);
    expect(log.actor_label).toBe("integration:stripe");
  });

  it("never marks paid on a wrong amount/currency, unpaid sessions, unknown audits or unrelated events", async () => {
    const auditId = await offeredAudit("Coral Dental", 200000);
    expect(await handleStripeEvent(env.db, paidEvent("evt_short", auditId, 100000))).toBe("amount_mismatch");
    expect(await handleStripeEvent(env.db, paidEvent("evt_eur", auditId, 200000, { currency: "eur" }))).toBe("amount_mismatch");
    expect(await handleStripeEvent(env.db, paidEvent("evt_unpaid", auditId, 200000, { payment_status: "unpaid" }))).toBe("ignored");
    expect(await handleStripeEvent(env.db, paidEvent("evt_unknown", "00000000-0000-0000-0000-000000000000", 200000))).toBe("unknown_audit");
    expect(await handleStripeEvent(env.db, { id: "evt_other", type: "customer.created", data: { object: {} } })).toBe("ignored");
    expect((await getAudit(env.as("admin"), auditId)).status).toBe("OFFERED");
  });

  it("manual confirmation still works for non-US clients (no Stripe involved)", async () => {
    const auditId = await offeredAudit("Lima Salon SAC", 90000);
    await confirmAuditPayment(env.as("sales"), auditId, { payment_reference: "YAPE-123" });
    expect((await getAudit(env.as("sales"), auditId)).status).toBe("PAID");
  });
});

describe("POST /api/integrations/stripe", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rh-stripe-"));
  let POST: (req: NextRequest) => Promise<Response>;
  beforeAll(async () => {
    process.env.PGLITE_DATA_DIR = dir;
    delete process.env.DATABASE_URL;
    ({ POST } = await import("@/app/api/integrations/stripe/route"));
  });
  afterAll(async () => {
    await (await (await import("@/lib/db")).getDb()).close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const post = (body: string, sig?: string) =>
    POST(new NextRequest("http://localhost/api/integrations/stripe", { method: "POST", body, headers: sig ? { "stripe-signature": sig } : {} }));

  it("is disabled without a webhook secret, rejects bad signatures, accepts verified events", async () => {
    const body = JSON.stringify({ id: "evt_route_1", type: "customer.created", data: { object: {} } });
    delete process.env.STRIPE_WEBHOOK_SECRET;
    expect((await post(body, sign(body, "whsec_route"))).status).toBe(503);
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_route";
    expect((await post(body, sign(body, "wrong"))).status).toBe(400);
    expect((await post(body)).status).toBe(400);
    const ok = await post(body, sign(body, "whsec_route"));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ received: true, outcome: "ignored" });
  });
});
