import { createHmac } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { setupTestEnv, type TestEnv } from "../helpers";
import { ingestLead, parseLeadEvent, verifyIngestionAuth } from "@/server/ingestion";

describe("external lead ingestion", () => {
  let env: TestEnv;
  beforeAll(async () => {
    env = await setupTestEnv();
  });

  const count = async (table: string) => (await env.db.query<{ n: number }>(`select count(*)::int as n from ${table}`))[0].n;

  it("validates payloads strictly", () => {
    expect(() => parseLeadEvent({})).toThrow(/source/);
    expect(() => parseLeadEvent({ source: "x", contact: { email: "not-an-email" } })).toThrow(/email/);
    expect(parseLeadEvent({ source: "Instagram_Organic", contact: { email: "" } }).source).toBe("instagram_organic");
  });

  it("is idempotent on external_event_id: replays never create duplicates", async () => {
    const e = parseLeadEvent({ external_event_id: "evt-1", source: "instagram_organic", campaign: "c1", content_id: "reel-1", keyword: "AGENTES", contact: { instagram_handle: "salonmia" } });
    const results = await Promise.all([ingestLead(env.db, e).catch((x) => x), ingestLead(env.db, e).catch((x) => x)]);
    const ok = results.filter((r) => r && r.opportunityId);
    expect(ok.length).toBeGreaterThanOrEqual(1);
    const again = await ingestLead(env.db, e);
    expect(again.duplicate).toBe(true);
    expect(await count("opportunities")).toBe(1);
    expect(await count("integration_events")).toBe(1);
    const [opp] = await env.db.query<Record<string, unknown>>("select * from opportunities");
    expect(opp).toMatchObject({ source: "instagram_organic", campaign: "c1", content_id: "reel-1", keyword: "AGENTES", external_event_id: "evt-1", stage: "NEW_LEAD" });
  });

  it("reuses an existing contact/company for a known handle but records a new attributed opportunity", async () => {
    await ingestLead(env.db, parseLeadEvent({ external_event_id: "evt-2", source: "instagram_organic", keyword: "AUDIT", contact: { instagram_handle: "@SalonMia" } }));
    expect(await count("companies")).toBe(1);
    expect(await count("contacts")).toBe(1);
    expect(await count("opportunities")).toBe(2);
  });

  it("without an external id each event is a new lead (website forms)", async () => {
    const e = parseLeadEvent({ source: "website", utm: { utm_source: "google", utm_campaign: "audit" }, contact: { email: "owner@coastal.example.com", name: "Owner" }, company: { name: "Coastal HVAC" } });
    await ingestLead(env.db, e);
    const [opp] = await env.db.query<{ utm: Record<string, string> }>("select utm from opportunities where source = 'website'");
    expect(opp.utm).toEqual({ utm_source: "google", utm_campaign: "audit" });
  });

  it("writes an audit-log entry per ingested lead", async () => {
    const rows = await env.db.query<{ n: number }>("select count(*)::int as n from audit_log where action = 'lead_ingested'");
    expect(rows[0].n).toBe(3);
  });

  it("verifies HMAC signatures or the shared secret, and is disabled without a secret", () => {
    const body = JSON.stringify({ source: "x" });
    const secret = "test-secret-value";
    const sig = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
    expect(verifyIngestionAuth(body, new Headers({ "x-rh-signature": sig }), secret)).toBe(true);
    expect(verifyIngestionAuth(body + " ", new Headers({ "x-rh-signature": sig }), secret)).toBe(false);
    expect(verifyIngestionAuth(body, new Headers({ "x-rh-ingestion-secret": secret }), secret)).toBe(true);
    expect(verifyIngestionAuth(body, new Headers({ "x-rh-ingestion-secret": "wrong" }), secret)).toBe(false);
    expect(verifyIngestionAuth(body, new Headers({ "x-rh-ingestion-secret": secret }), undefined)).toBe(false);
  });
});
