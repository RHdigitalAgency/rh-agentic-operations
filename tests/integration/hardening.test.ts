import { afterEach, describe, expect, it, vi } from "vitest";
import { setupTestEnv } from "../helpers";
import { createPgliteDb } from "@/lib/db/pglite";
import { migrate } from "@/lib/db/migrate";
import { ConflictError, NotFoundError, toAppError, ValidationError } from "@/lib/errors";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createLead, getOpportunity } from "@/server/crm";
import { confirmAuditPayment, getAudit, offerAudit } from "@/server/audits";
import { acceptProposal, createProposal, sendProposal } from "@/server/proposals";
import { createAuditCheckout, handleStripeEvent, type StripeEvent } from "@/server/stripe";
import { ingestLead, parseLeadEvent } from "@/server/ingestion";

async function qualifiedOpp(env: Awaited<ReturnType<typeof setupTestEnv>>, name: string) {
  const id = await createLead(env.as("sales"), { company_name: name, source: "referral", next_action: "Call" });
  await env.db.query("update opportunities set stage = 'FIT_QUALIFIED' where id = $1", [id]);
  return id;
}

describe("concurrent state transitions", () => {
  it("accepting the same proposal twice at once creates exactly one deployment", async () => {
    const env = await setupTestEnv();
    const oppId = await qualifiedOpp(env, "Race Co");
    const proposalId = await createProposal(env.as("sales"), { opportunity_id: oppId, proposal_type: "PILOT", title: "Pilot", amount_cents: 300000 });
    await sendProposal(env.as("sales"), proposalId);
    const results = await Promise.allSettled([acceptProposal(env.as("sales"), proposalId), acceptProposal(env.as("sales"), proposalId)]);
    expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    const failure = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(failure.reason).toBeInstanceOf(ConflictError);
    const [{ n }] = await env.db.query<{ n: number }>("select count(*)::int as n from deployments where proposal_id = $1", [proposalId]);
    expect(n).toBe(1);
  });

  it("a Stripe webhook racing a manual confirmation marks the audit paid once", async () => {
    const env = await setupTestEnv();
    const auditId = await offerAudit(env.as("sales"), await qualifiedOpp(env, "Paid Twice Co"), { price_cents: 150000 });
    const event: StripeEvent = {
      id: "evt_race",
      type: "checkout.session.completed",
      data: { object: { id: "cs_race", payment_status: "paid", amount_total: 150000, currency: "usd", metadata: { audit_id: auditId } } },
    };
    const results = await Promise.allSettled([handleStripeEvent(env.db, event), confirmAuditPayment(env.as("sales"), auditId, {}), handleStripeEvent(env.db, event)]);
    const outcomes = results.map((r) => (r.status === "fulfilled" ? r.value ?? "manual" : (r.reason as Error).constructor.name));
    expect(outcomes.filter((o) => o === "paid" || o === "manual")).toHaveLength(1);
    expect(outcomes).toContain("duplicate"); // the redelivered event is recognised, never a 500
    const history = await env.db.query("select 1 from audit_log where entity_id = $1 and action = 'payment_confirmed'", [auditId]);
    expect(history).toHaveLength(1);
    expect((await getAudit(env.as("sales"), auditId)).status).toBe("PAID");
  });
});

describe("database-enforced business rules", () => {
  it("rejects a second active audit for the same opportunity even if the service check is bypassed", async () => {
    const env = await setupTestEnv();
    const oppId = await qualifiedOpp(env, "One Audit Co");
    await offerAudit(env.as("sales"), oppId, { price_cents: 100000 });
    const insert = env.db.query("insert into audits(company_id, opportunity_id, status, price_cents) select company_id, id, 'OFFERED', 1 from opportunities where id = $1", [oppId]);
    await expect(insert).rejects.toMatchObject({ code: "23505" });
  });

  it("allows only one active audit credit per audit at the database level", async () => {
    const env = await setupTestEnv();
    const oppId = await qualifiedOpp(env, "Credit Race Co");
    const auditId = await offerAudit(env.as("sales"), oppId, { price_cents: 100000 });
    await confirmAuditPayment(env.as("sales"), auditId, {});
    await createProposal(env.as("sales"), { opportunity_id: oppId, audit_id: auditId, proposal_type: "PILOT", title: "A", amount_cents: 300000, apply_audit_credit: "on" });
    const sneak = env.db.query(
      "insert into proposals(company_id, opportunity_id, audit_id, proposal_type, title, amount_cents, audit_credit_cents, status) select company_id, opportunity_id, id, 'PILOT', 'B', 300000, 100000, 'DRAFT' from audits where id = $1",
      [auditId],
    );
    await expect(sneak).rejects.toMatchObject({ code: "23505" });
  });
});

describe("error normalization", () => {
  it("turns a malformed id into not-found and constraint errors into user-facing errors", async () => {
    const env = await setupTestEnv();
    const err = await getOpportunity(env.as("admin"), "not-a-uuid").catch((e) => e);
    expect(toAppError(err)).toBeInstanceOf(NotFoundError);
    expect(toAppError({ code: "23505" })).toBeInstanceOf(ConflictError);
    expect(toAppError({ code: "23514" })).toBeInstanceOf(ValidationError);
    expect(toAppError(new Error("boom"))).toBeNull();
  });
});

describe("migrations", () => {
  it("concurrent runs apply each migration exactly once", async () => {
    const db = await createPgliteDb();
    const [a, b] = await Promise.all([migrate(db), migrate(db)]);
    const all = [...a, ...b].sort();
    expect(new Set(all).size).toBe(all.length);
    const [{ n }] = await db.query<{ n: number }>("select count(*)::int as n from schema_migrations");
    expect(all).toHaveLength(n);
    await db.close();
  });
});

describe("Stripe checkout idempotency", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.STRIPE_SECRET_KEY;
  });

  it("uses a stable idempotency key so double clicks share one Checkout Session, and reports timeouts cleanly", async () => {
    const env = await setupTestEnv();
    const auditId = await offerAudit(env.as("sales"), await qualifiedOpp(env, "Idem Co"), { price_cents: 150000 });
    process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
    const keys: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      keys.push((init.headers as Record<string, string>)["idempotency-key"]);
      return new Response(JSON.stringify({ id: "cs_1", url: "https://checkout.stripe.com/c/pay/cs_1", expires_at: Math.floor(Date.now() / 1000) + 600 }));
    }));
    await createAuditCheckout(env.as("sales"), auditId); // expires within the hour -> not reused next time
    await env.db.query("update audits set stripe_checkout_session_id = null, stripe_checkout_url = null where id = $1", [auditId]);
    await createAuditCheckout(env.as("sales"), auditId);
    expect(keys[0]).toBe(keys[1]);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new DOMException("timeout", "TimeoutError"); }));
    await env.db.query("update audits set stripe_checkout_url = null where id = $1", [auditId]);
    await expect(createAuditCheckout(env.as("sales"), auditId)).rejects.toThrow(/did not respond/);
  });
});

describe("ingestion contact matching", () => {
  it("does not attach new leads to contacts of archived companies", async () => {
    const env = await setupTestEnv();
    const first = await ingestLead(env.db, parseLeadEvent({ source: "instagram_organic", instagram_username: "@gone", name: "Gone Co" }));
    const [{ company_id }] = await env.db.query<{ company_id: string }>("select company_id from opportunities where id = $1", [first.opportunityId]);
    await env.db.query("update companies set archived_at = now() where id = $1", [company_id]);
    const second = await ingestLead(env.db, parseLeadEvent({ source: "instagram_organic", instagram_username: "@gone", name: "Gone Co" }));
    const [{ company_id: next }] = await env.db.query<{ company_id: string }>("select company_id from opportunities where id = $1", [second.opportunityId]);
    expect(next).not.toBe(company_id);
  });
});

describe("password verification", () => {
  it("is async, accepts the right password and rejects wrong, missing and malformed hashes", async () => {
    const stored = hashPassword("correct-horse-battery");
    expect(await verifyPassword("correct-horse-battery", stored)).toBe(true);
    expect(await verifyPassword("wrong-password-xx", stored)).toBe(false);
    expect(await verifyPassword("anything-at-all", null)).toBe(false);
    expect(await verifyPassword("anything-at-all", "scrypt$abc$x$y")).toBe(false);
  });
});
