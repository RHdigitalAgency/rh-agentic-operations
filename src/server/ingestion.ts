import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { Db, Queryable } from "@/lib/db/types";
import { ValidationError } from "@/lib/errors";
import { insertOpportunity } from "./crm";
import { logAudit } from "./context";
import { getDefaultLeadOwner } from "./settings";

const trimmed = (max: number) => z.string().trim().max(max).transform((v) => (v === "" ? null : v));
const opt = (max: number) => trimmed(max).nullish().transform((v) => v ?? null);

/** Normalized lead event (docs/06_API_SPEC.md). Provider metadata is retained but never trusted for core fields. */
export const LeadEventSchema = z.object({
  external_event_id: opt(200),
  source: z.string().trim().min(1).max(80).transform((v) => v.toLowerCase()),
  campaign: opt(120),
  content_id: opt(200),
  keyword: opt(80),
  referrer: opt(200),
  utm: z.record(z.string().max(40), z.string().max(300)).nullish(),
  contact: z
    .object({
      name: opt(200),
      instagram_handle: opt(100),
      email: z.string().trim().toLowerCase().email().max(320).nullish().or(z.literal("")).transform((v) => v || null),
      phone: opt(40),
    })
    .nullish(),
  company: z.object({ name: opt(200), website: opt(500) }).nullish(),
  metadata: z.record(z.string(), z.unknown()).nullish(),
});
export type LeadEvent = z.infer<typeof LeadEventSchema>;

export interface IngestResult {
  opportunityId: string;
  duplicate: boolean;
}

export function verifyIngestionAuth(rawBody: string, headers: Headers, secret: string | undefined): boolean {
  if (!secret) return false;
  const eq = (a: string, b: string) => {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    return ba.length === bb.length && timingSafeEqual(ba, bb);
  };
  const signature = headers.get("x-rh-signature");
  if (signature) {
    const expected = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
    return eq(signature, expected);
  }
  const shared = headers.get("x-rh-ingestion-secret");
  return Boolean(shared) && eq(shared!, secret);
}

export function parseLeadEvent(body: unknown): LeadEvent {
  const r = LeadEventSchema.safeParse(body);
  if (!r.success) throw new ValidationError(r.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "));
  return r.data;
}

async function findExistingContact(tx: Queryable, c: NonNullable<LeadEvent["contact"]>) {
  const handle = c.instagram_handle?.replace(/^@/, "") ?? null;
  const checks: [string, string | null][] = [
    ["lower(email) = lower($1)", c.email],
    ["lower(instagram_handle) = lower($1)", handle],
    ["phone = $1", c.phone],
  ];
  for (const [cond, val] of checks) {
    if (!val) continue;
    const [row] = await tx.query<{ id: string; company_id: string }>(
      `select id, company_id from contacts where ${cond} and archived_at is null and company_id is not null order by created_at limit 1`,
      [val],
    );
    if (row) return row;
  }
  return null;
}

/**
 * Ingest one normalized lead. Idempotent on (provider, external_event_id): a replayed event returns the
 * original opportunity and creates nothing. Attribution (source/campaign/content/keyword/UTM) is persisted.
 */
export async function ingestLead(db: Db, event: LeadEvent, provider = "lead_ingestion"): Promise<IngestResult> {
  return db.transaction(async (tx) => {
    if (event.external_event_id) {
      const [existing] = await tx.query<{ opportunity_id: string | null }>(
        "select opportunity_id from integration_events where provider = $1 and external_event_id = $2",
        [provider, event.external_event_id],
      );
      if (existing?.opportunity_id) return { opportunityId: existing.opportunity_id, duplicate: true };
    }

    const owner = await getDefaultLeadOwner(tx);
    const contactIn = event.contact ?? null;
    const handle = contactIn?.instagram_handle?.replace(/^@/, "") ?? null;
    const matched = contactIn ? await findExistingContact(tx, contactIn) : null;

    let companyId = matched?.company_id ?? null;
    let contactId = matched?.id ?? null;
    if (!companyId) {
      const name = event.company?.name || contactIn?.name || (handle ? `@${handle}` : null) || `Inbound lead ${event.external_event_id ?? new Date().toISOString()}`;
      const [c] = await tx.query<{ id: string }>(
        "insert into companies(name, website, source, owner_user_id) values ($1,$2,$3,$4) returning id",
        [name, event.company?.website ?? null, event.source, owner],
      );
      companyId = c.id;
    }
    if (!contactId && contactIn && (contactIn.name || contactIn.email || contactIn.phone || handle)) {
      const [ct] = await tx.query<{ id: string }>(
        "insert into contacts(company_id, name, email, phone, instagram_handle) values ($1,$2,$3,$4,$5) returning id",
        [companyId, contactIn.name, contactIn.email, contactIn.phone, handle],
      );
      contactId = ct.id;
    }

    const opportunityId = await insertOpportunity(
      tx,
      null,
      {
        companyId,
        contactId,
        ownerId: owner,
        title: event.keyword ? `${event.source} - ${event.keyword}` : event.source,
        source: event.source,
        campaign: event.campaign,
        contentId: event.content_id,
        keyword: event.keyword,
        referrer: event.referrer,
        utm: event.utm ?? {},
        externalEventId: event.external_event_id,
        estimatedValueCents: null,
        currency: "USD",
        nextAction: "First outreach",
        nextActionAt: new Date(Date.now() + 24 * 3600 * 1000),
      },
      `integration:${provider}`,
    );

    await tx.query(
      "insert into integration_events(provider, external_event_id, payload, opportunity_id) values ($1,$2,$3,$4)",
      [provider, event.external_event_id, JSON.stringify(event), opportunityId],
    );
    await logAudit(tx, null, "integration_event", null, "lead_ingested", null, { provider, external_event_id: event.external_event_id, opportunityId }, `integration:${provider}`);
    return { opportunityId, duplicate: false };
  });
}

/** Naive fixed-window rate limiter (per process). Adequate for a single internal instance; replace at the edge for scale. */
const windows = new Map<string, { start: number; count: number }>();
export function rateLimit(key: string, limit = 60, windowMs = 60_000): boolean {
  const now = Date.now();
  const w = windows.get(key);
  if (!w || now - w.start > windowMs) {
    windows.set(key, { start: now, count: 1 });
    return true;
  }
  w.count += 1;
  return w.count <= limit;
}
