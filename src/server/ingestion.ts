import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { Db, Queryable } from "@/lib/db/types";
import { ValidationError } from "@/lib/errors";
import { insertOpportunity } from "./crm";
import { logAudit } from "./context";
import { getDefaultLeadOwner } from "./settings";

const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

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
  notes: opt(2000),
  /** When the lead happened at the source (e.g. the Instagram comment). ISO 8601. Defaults to receipt time. */
  created_at: z
    .string()
    .datetime({ offset: true })
    .nullish()
    .transform((v) => (v ? new Date(v) : null))
    .refine((d) => !d || d.getTime() <= Date.now() + MAX_CLOCK_SKEW_MS, "must not be in the future"),
  metadata: z.record(z.string(), z.unknown()).nullish(),
});
export type LeadEvent = z.infer<typeof LeadEventSchema>;

/** Flat field names used by the Instagram Growth Automation, mapped onto the canonical (nested) contract. */
const FLAT_FIELDS = ["post", "instagram_username", "name", "email", "phone"] as const;

/**
 * Accepts both payload shapes:
 *  - flat (Instagram):  { source, campaign, post, keyword, instagram_username, name, email, phone, notes, created_at, external_event_id }
 *  - nested (canonical): { source, campaign, content_id, keyword, contact: {...}, company: {...}, ... }
 * Explicit nested values win over flat aliases.
 */
export function normalizeLeadPayload(body: unknown): unknown {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return body;
  const b = body as Record<string, unknown>;
  if (!FLAT_FIELDS.some((k) => k in b)) return body;
  const { post, instagram_username, name, email, phone, ...rest } = b;
  const contact = (typeof b.contact === "object" && b.contact !== null ? b.contact : {}) as Record<string, unknown>;
  return {
    ...rest,
    content_id: rest.content_id ?? post,
    contact: {
      name: contact.name ?? name,
      instagram_handle: contact.instagram_handle ?? instagram_username,
      email: contact.email ?? email,
      phone: contact.phone ?? phone,
    },
  };
}

export interface IngestResult {
  opportunityId: string;
  duplicate: boolean;
}

/** `x-rh-signature: sha256=<hex HMAC-SHA256 of the exact raw request body>` signed with the shared secret. */
export function signLeadPayload(rawBody: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
}

/** Only signed requests are accepted; unsigned requests and wrong signatures are rejected. */
export function verifyIngestionAuth(rawBody: string, headers: Headers, secret: string | undefined): boolean {
  const signature = headers.get("x-rh-signature");
  if (!secret || !signature) return false;
  const a = Buffer.from(signature);
  const b = Buffer.from(signLeadPayload(rawBody, secret));
  return a.length === b.length && timingSafeEqual(a, b);
}

export function parseLeadEvent(body: unknown): LeadEvent {
  const r = LeadEventSchema.safeParse(normalizeLeadPayload(body));
  if (!r.success) throw new ValidationError(r.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "));
  return r.data;
}

async function findExistingContact(tx: Queryable, c: NonNullable<LeadEvent["contact"]>) {
  const handle = c.instagram_handle?.replace(/^@/, "") ?? null;
  const checks: [string, string | null][] = [
    ["lower(ct.email) = lower($1)", c.email],
    ["lower(ct.instagram_handle) = lower($1)", handle],
    ["ct.phone = $1", c.phone],
  ];
  for (const [cond, val] of checks) {
    if (!val) continue;
    // Contacts of archived companies are not reused: the new lead would be invisible in the pipeline.
    const [row] = await tx.query<{ id: string; company_id: string }>(
      `select ct.id, ct.company_id from contacts ct join companies c on c.id = ct.company_id
       where ${cond} and ct.archived_at is null and c.archived_at is null
       order by ct.created_at limit 1`,
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

    // Keep the real lead time from the source so sales-cycle metrics start when the lead actually happened.
    if (event.created_at) {
      await tx.query("update opportunities set created_at = $2, stage_changed_at = $2 where id = $1", [opportunityId, event.created_at]);
      await tx.query("update opportunity_stage_history set changed_at = $2 where opportunity_id = $1 and from_stage is null", [opportunityId, event.created_at]);
    }
    if (event.notes) {
      await tx.query(
        "insert into activities(opportunity_id, company_id, activity_type, notes, occurred_at) values ($1,$2,'NOTE',$3,$4)",
        [opportunityId, companyId, `Lead note from ${event.source}: ${event.notes}`, event.created_at ?? new Date()],
      );
    }

    await tx.query(
      "insert into integration_events(provider, external_event_id, payload, opportunity_id) values ($1,$2,$3,$4)",
      [provider, event.external_event_id, JSON.stringify(event), opportunityId],
    );
    await logAudit(tx, null, "integration_event", null, "lead_ingested", null, { provider, external_event_id: event.external_event_id, opportunityId }, `integration:${provider}`);
    return { opportunityId, duplicate: false };
  });
}

/**
 * Fixed-window rate limiter (per server instance) — a first line of defence; add an edge limit (Vercel firewall)
 * if the endpoint sees abuse. Expired windows are swept so memory stays bounded under many distinct keys.
 */
const windows = new Map<string, { start: number; count: number }>();
const MAX_TRACKED_KEYS = 10_000;
export function rateLimit(key: string, limit = 60, windowMs = 60_000): boolean {
  const now = Date.now();
  if (windows.size >= MAX_TRACKED_KEYS) {
    for (const [k, v] of windows) if (now - v.start > windowMs) windows.delete(k);
    if (windows.size >= MAX_TRACKED_KEYS) return false; // still saturated: shed load rather than grow without bound
  }
  const w = windows.get(key);
  if (!w || now - w.start > windowMs) {
    windows.set(key, { start: now, count: 1 });
    return true;
  }
  w.count += 1;
  return w.count <= limit;
}
