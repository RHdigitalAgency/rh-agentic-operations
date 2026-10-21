# RH Agentic Operations Platform

Internal operating system for RH Digital Agency: lead → fit call → paid audit → process mapping → scoring → ROI → proposal → deployment → measured KPIs.

Live: https://rh-agentic-operations.vercel.app (Vercel + Supabase Postgres). Repo: https://github.com/RHdigitalAgency/rh-agentic-operations. Status and open items: `PROJECT_STATE.md`.

## Run it locally (v0.1)

Requirements: Node.js ≥ 20.9 (tested on Node 24) and npm. No Docker or Postgres install needed: local dev uses an embedded Postgres (PGlite).

```bash
npm install
cp .env.example .env.local      # PowerShell: Copy-Item .env.example .env.local
npm run db:reset                # creates ./.data/pglite, runs migrations, seeds demo data
npm run dev                     # http://localhost:3000
```

Demo users (password = `SEED_DEMO_PASSWORD` from `.env.local`, default `rh-local-demo`, local only):

| Role | Email |
|---|---|
| Admin / Manager | admin@example.com |
| Sales Rep (Miami) | marco.sales@example.com |
| Sales Rep (Lima) | lucia.sales@example.com |
| Delivery | diego.delivery@example.com |
| Analyst / Auditor | ana.analyst@example.com |
| Partner / External Rep | carlos.partner@example.com |
| Read-only Executive | elena.exec@example.com |

Quality gates: `npm run check` (typecheck + lint + tests), `npm run build`.

Database commands: `npm run db:migrate`, `npm run db:seed` (empty DB only), `npm run db:reset` (local PGlite only), `npm run user:create-admin`.
Removable demo data on a hosted database: `npm run demo:add` / `npm run demo:remove` (demo users cannot sign in; remove deletes exactly what was added).
Set `DATABASE_URL` to use real Postgres/Supabase instead. See `docs/11_DEPLOYMENT_AND_RECOVERY.md` and `adrs/0003`.

### Core workflow in the UI
Lead (**+ New lead**, or ingested) → move to Contacted → schedule and complete a **fit call** → **Offer audit** → **Confirm payment** → **Start discovery** → add **processes**, classify, **score** → **ROI scenario** → add an **agentic opportunity** → **Recommend as pilot** → **Mark presented** → **Create proposal** → **Mark as sent** → **Accept → create deployment** → agent roles, QA, effort, **baseline/result KPIs** → **Dashboard** and **case-study summary**.
Stages advance automatically when each step's exit condition is met; manual moves are validated against the same rules.

### Lead ingestion API (for the Instagram Growth Automation, website forms)

The Instagram automation is a separate project and is **not connected yet**. This endpoint is ready for it. Until then, leads are entered with **+ New lead**, or simulated with `npm run lead:simulate`.

**Request**

```
POST https://rh-agentic-operations.vercel.app/api/integrations/leads
Content-Type: application/json
x-rh-signature: sha256=<lowercase hex HMAC-SHA256 of the exact raw request body, keyed with the shared secret>
```

```json
{
  "external_event_id": "ig-comment-17890012345",
  "source": "instagram_organic",
  "campaign": "agentic_operations",
  "post": "reel_2026_10_20_01",
  "keyword": "AGENTES",
  "instagram_username": "casa_verde_landscaping",
  "name": "Mariela Torres",
  "email": "mariela@casaverde.example.com",
  "phone": "+1 305 555 0199",
  "notes": "Asked about automating quote follow-ups.",
  "created_at": "2026-10-20T14:32:00Z"
}
```

| Field | Required | Rules | Stored as |
|---|---|---|---|
| `source` | **yes** | 1–80 chars, lower-cased | Opportunity source |
| `external_event_id` | strongly recommended | ≤200 chars, unique per event | Idempotency key: a resend returns the same lead |
| `campaign` | no | ≤120 | Campaign |
| `post` | no | ≤200 (post/reel ID or URL) | Content / post |
| `keyword` | no | ≤80 | Keyword |
| `instagram_username` | no | ≤100, leading `@` is stripped | Contact Instagram handle |
| `name` | no | ≤200 | Contact name |
| `email` | no | valid email | Contact email |
| `phone` | no | ≤40 | Contact phone |
| `notes` | no | ≤2000 | Note on the lead's activity timeline |
| `created_at` | no | ISO 8601 with timezone, not in the future | Lead creation time (defaults to receipt time) |

Optional extras: `utm` (object of strings) and `referrer`. The nested shape in `docs/06_API_SPEC.md` (`content_id`, `contact{}`, `company{}`) is also accepted.

An existing contact with the same email, Instagram username or phone is reused. Every event still creates its own attributed lead, and new leads go to the default lead owner set in **Settings**.

**Responses**

| Status | Meaning |
|---|---|
| `201` | `{"data":{"opportunity_id":"…","duplicate":false}}`: lead created |
| `200` | `{"data":{"opportunity_id":"…","duplicate":true}}`: same `external_event_id` already received; nothing created |
| `400` | Malformed JSON or invalid fields: `{"error":{"code":"VALIDATION","message":"…"}}` |
| `401` | Missing or wrong `x-rh-signature` (unsigned requests are always rejected) |
| `413` | Body over 64 KB |
| `429` | Rate limit (60 requests/minute per IP) |
| `503` | `INSTAGRAM_INGESTION_SHARED_SECRET` not configured on that environment |

**Signing example (Node.js).** Sign exactly the bytes you send:

```js
const body = JSON.stringify(lead);
const signature = "sha256=" + require("crypto").createHmac("sha256", process.env.RH_SHARED_SECRET).update(body).digest("hex");
await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-rh-signature": signature }, body });
```

**Secret.** Configured per environment with `INSTAGRAM_INGESTION_SHARED_SECRET`: in `.env.local` locally, and in the Vercel project settings in production. Share it with the Instagram team privately (never in code or chat logs). Rotating it means updating both sides.

**Simulate without the external system.** With `npm run dev` running and the secret in `.env.local`:
- `npm run lead:simulate` sends `tests/fixtures/instagram-lead.json` with a fresh event ID.
- `npm run lead:simulate -- --replay` keeps the fixture's ID, so a second run shows the duplicate response.
- Add `--url https://…` to target another environment, and `--file path.json` for a custom payload.

### Audit payments: manual or Stripe
Each unpaid audit shows two options:
- **Manual confirmation:** the standard path for any client (transfer, Yape, Zelle, card terminal…). Enter an optional reference and confirm.
- **Stripe payment link:** for US clients paying by card. **Create Stripe payment link** makes a Stripe Checkout page for the audit's exact price (valid 24 h). Send it to the client. When they pay, Stripe calls `POST /api/integrations/stripe`, the audit is marked paid, and the deal moves to *Audit Paid* automatically.

The webhook only changes payment state. It requires a valid Stripe signature, and it only marks an audit paid when the amount and currency match the price exactly. Anything else is logged for review. Both paths use the same transition and audit log.

**Turn Stripe on** (test mode first):
1. Stripe Dashboard → Developers → API keys: put the secret key in Vercel as `STRIPE_SECRET_KEY` (Production).
2. Stripe Dashboard → Developers → Webhooks → **Add endpoint**: `https://rh-agentic-operations.vercel.app/api/integrations/stripe`, events `checkout.session.completed` and `checkout.session.async_payment_succeeded`. Copy its signing secret into Vercel as `STRIPE_WEBHOOK_SECRET` (Production).
3. Set `NEXT_PUBLIC_APP_URL=https://rh-agentic-operations.vercel.app` (Production) so clients return to the confirmation page (`/paid`).
4. Redeploy. Without these variables the Stripe button stays hidden and the webhook returns 503.

## Source of truth

`docs/01_STRATEGIC_PLAN.md` and `docs/02_PLATFORM_PDR.md` define the business and product; `docs/03`–`10` add the technical layer (architecture, data model, API contract, acceptance criteria, domain rules, security). Coding agents follow `AGENTS.md`. Decisions that differ from those docs are recorded in `adrs/`.

## Important timing correction

The original 30/60/90-day plan is a **business validation timeline**, not a software build timeline.

- Technical MVP target: same-day first build if an agent can work continuously; 1-2 days is acceptable for a stable v0.1.
- Internal QA / dogfooding: immediately after the first build.
- Commercial launch: as soon as the critical acceptance tests pass.
- 30/60/90 days: real-market evidence, client conversion, delivery economics, ROI, repeatability, and scale decisions.

Do not artificially stretch engineering work to match the business validation timeline.

## Repository structure

```text
src/domain        pure business rules (pipeline, scoring, ROI, KPIs, analytics, money)
src/server        services + data-level RBAC
src/app           pages, server actions, API routes
database/         SQL migrations (+ original starter schema)
scripts/          db:migrate / db:seed / db:reset, user:create-admin
tests/            unit, integration, critical-path E2E
docs/ adrs/ tasks/ source-docs/   specification, decisions, backlog, original documents
```

## What not to build in v1

Do not build a generic CRM, a public SaaS, an AI copilot, a ManyChat replacement, a full project-management suite, or client-system replicas. The platform exists to sell, audit, deliver, measure, and scale RH Agentic Operations.
