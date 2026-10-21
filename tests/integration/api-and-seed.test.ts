import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHmac } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { migrate } from "@/lib/db/migrate";
import { seedDemo } from "@/server/seed";
import { getDashboard } from "@/server/analytics";
import { followUpQueue } from "@/server/crm";
import type { SessionUser } from "@/lib/auth/user";
import { createTestDb } from "../helpers";

describe("POST /api/integrations/leads (HTTP contract)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rh-api-"));
  const secret = "local-test-ingestion-secret";
  let POST: (req: NextRequest) => Promise<Response>;

  beforeAll(async () => {
    process.env.PGLITE_DATA_DIR = dir;
    delete process.env.DATABASE_URL;
    ({ POST } = await import("@/app/api/integrations/leads/route"));
  });
  afterAll(async () => {
    const { getDb } = await import("@/lib/db");
    await (await getDb()).close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const body = JSON.stringify({ external_event_id: "ig-http-1", source: "instagram_organic", campaign: "agentic_operations", content_id: "reel-x", keyword: "AGENTES", contact: { instagram_handle: "http_tester" } });
  const req = (b: string, headers: Record<string, string>) =>
    new NextRequest("http://localhost/api/integrations/leads", { method: "POST", body: b, headers: { "content-type": "application/json", ...headers } });
  const sign = (b: string) => `sha256=${createHmac("sha256", secret).update(b).digest("hex")}`;

  it("is disabled (503) until a secret is configured", async () => {
    delete process.env.INSTAGRAM_INGESTION_SHARED_SECRET;
    expect((await POST(req(body, {}))).status).toBe(503);
    process.env.INSTAGRAM_INGESTION_SHARED_SECRET = secret;
  });

  it("rejects bad signatures (401)", async () => {
    expect((await POST(req(body, { "x-rh-signature": "sha256=deadbeef" }))).status).toBe(401);
    expect((await POST(req(body, {}))).status).toBe(401);
  });

  it("creates once (201) and replays idempotently (200, same id)", async () => {
    const first = await POST(req(body, { "x-rh-signature": sign(body) }));
    expect(first.status).toBe(201);
    const a = (await first.json()).data;
    const again = await POST(req(body, { "x-rh-signature": sign(body) }));
    expect(again.status).toBe(200);
    expect((await again.json()).data).toEqual({ opportunity_id: a.opportunity_id, duplicate: true });
  });

  it("validates payloads (400)", async () => {
    const bad = JSON.stringify({ campaign: "no source" });
    const r = await POST(req(bad, { "x-rh-signature": sign(bad) }));
    expect(r.status).toBe(400);
    expect((await r.json()).error.code).toBe("VALIDATION");
  });
});

describe("demo seed", () => {
  it("builds a realistic dataset through the real services and the dashboard reconciles", async () => {
    const db = await createTestDb();
    await migrate(db);
    await seedDemo(db, "seed-test-password");
    const [admin] = await db.query<{ id: string; email: string; full_name: string }>("select id, email, full_name from app_users where role = 'ADMIN_MANAGER'");
    const user: SessionUser = { id: admin.id, email: admin.email, fullName: admin.full_name, role: "ADMIN_MANAGER" };
    const dash = await getDashboard({ db, user }, {});
    const [sql] = await db.query<{ leads: number; paid: number; rev: number; won: number }>(
      `select (select count(*)::int from opportunities where created_at >= current_date - 89) as leads,
              (select count(*)::int from audits where paid_at >= current_date - 89 and status <> 'CANCELLED') as paid,
              (select coalesce(sum(price_cents),0)::int8 from audits where paid_at >= current_date - 89 and status <> 'CANCELLED') as rev,
              (select count(*)::int from proposals where status = 'ACCEPTED' and proposal_type <> 'RETAINER' and decision_at >= current_date - 89) as won`,
    );
    expect(dash.metrics.leads.value).toBe(sql.leads);
    expect(dash.metrics.paidAudits.value).toBe(sql.paid);
    expect(dash.metrics.auditRevenueCents.value).toBe(sql.rev);
    expect(dash.metrics.wonDeployments.value).toBe(sql.won);
    expect(dash.metrics.mrrCents.value).toBe(120000);
    expect(dash.metrics.grossMargin.value).not.toBeNull();
    const q = await followUpQueue({ db, user });
    expect(q.overdue.length).toBeGreaterThan(0);
    await expect(seedDemo(db, "seed-test-password")).rejects.toThrow(/already has users/);
    await db.close();
  });
});
