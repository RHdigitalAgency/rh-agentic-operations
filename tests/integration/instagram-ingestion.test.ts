import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { signLeadPayload } from "@/server/ingestion";
import type { Db } from "@/lib/db/types";

/**
 * Simulates the external Instagram Growth Automation calling POST /api/integrations/leads
 * with the flat payload in tests/fixtures/instagram-lead.json. No external system needed.
 */
describe("Instagram lead ingestion (simulated external system)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rh-ig-"));
  const secret = "instagram-test-secret";
  const fixture = fs.readFileSync(path.join(import.meta.dirname, "../fixtures/instagram-lead.json"), "utf8");
  let POST: (req: NextRequest) => Promise<Response>;
  let db: Db;

  beforeAll(async () => {
    process.env.PGLITE_DATA_DIR = dir;
    delete process.env.DATABASE_URL;
    process.env.INSTAGRAM_INGESTION_SHARED_SECRET = secret;
    ({ POST } = await import("@/app/api/integrations/leads/route"));
    db = await (await import("@/lib/db")).getDb();
  });
  afterAll(async () => {
    await db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const send = (body: string, headers: Record<string, string>) =>
    POST(new NextRequest("http://localhost/api/integrations/leads", { method: "POST", body, headers: { "content-type": "application/json", ...headers } }));
  const count = async () => (await db.query<{ n: number }>("select count(*)::int as n from opportunities"))[0].n;

  it("ingests a signed Instagram lead with every expected field", async () => {
    const res = await send(fixture, { "x-rh-signature": signLeadPayload(fixture, secret) });
    expect(res.status).toBe(201);
    const { opportunity_id } = (await res.json()).data;

    const [opp] = await db.query<Record<string, unknown>>(
      `select o.source, o.campaign, o.content_id, o.keyword, o.stage, o.external_event_id, o.created_at,
              c.name, c.instagram_handle, c.email, c.phone
       from opportunities o join contacts c on c.id = o.primary_contact_id where o.id = $1`,
      [opportunity_id],
    );
    expect(opp).toMatchObject({
      source: "instagram_organic",
      campaign: "agentic_operations",
      content_id: "reel_2026_10_20_01", // from "post"
      keyword: "AGENTES",
      stage: "NEW_LEAD",
      external_event_id: "ig-comment-fixture-0001",
      name: "Mariela Torres",
      instagram_handle: "casa_verde_landscaping", // from "instagram_username"
      email: "mariela@casaverde.example.com",
      phone: "+1 305 555 0199",
    });
    expect(new Date(opp.created_at as string).toISOString()).toBe("2026-10-20T14:32:00.000Z"); // from "created_at"
    const [note] = await db.query<{ notes: string }>("select notes from activities where opportunity_id = $1", [opportunity_id]);
    expect(note.notes).toContain("asked about automating quote follow-ups"); // from "notes"
  });

  it("rejects an invalid signature (401) and creates nothing", async () => {
    const before = await count();
    const tampered = fixture.replace("ig-comment-fixture-0001", "ig-comment-fixture-0002");
    const res = await send(tampered, { "x-rh-signature": signLeadPayload(fixture, secret) }); // signature of a different body
    expect(res.status).toBe(401);
    expect((await send(tampered, { "x-rh-signature": signLeadPayload(tampered, "wrong-secret") })).status).toBe(401);
    expect((await send(tampered, {})).status).toBe(401); // unsigned
    expect(await count()).toBe(before);
  });

  it("rejects malformed payloads (400) even when correctly signed", async () => {
    for (const bad of [
      "{not json",
      JSON.stringify({ post: "reel-1", instagram_username: "x" }), // missing source
      JSON.stringify({ source: "instagram_organic", email: "not-an-email" }),
      JSON.stringify({ source: "instagram_organic", name: "x", created_at: "2999-01-01T00:00:00Z" }), // future
    ]) {
      const res = await send(bad, { "x-rh-signature": signLeadPayload(bad, secret) });
      expect(res.status).toBe(400);
    }
  });
});
