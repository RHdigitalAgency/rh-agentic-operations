# RH Agentic Operations Platform

Internal operating system for RH Digital Agency: lead → fit call → paid audit → process mapping → scoring → ROI → proposal → deployment → measured KPIs.

Live: https://rh-agentic-operations.vercel.app (Vercel + Supabase Postgres). Status and open items: `PROJECT_STATE.md`.

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
Set `DATABASE_URL` to use real Postgres/Supabase instead. See `docs/11_DEPLOYMENT_AND_RECOVERY.md` and `adrs/0003`.

### Core workflow in the UI
Lead (**+ New lead**, or ingested) → move to Contacted → schedule and complete a **fit call** → **Offer audit** → **Confirm payment** → **Start discovery** → add **processes**, classify, **score** → **ROI scenario** → add an **agentic opportunity** → **Recommend as pilot** → **Mark presented** → **Create proposal** → **Mark as sent** → **Accept → create deployment** → agent roles, QA, effort, **baseline/result KPIs** → **Dashboard** and **case-study summary**.
Stages advance automatically when each step's exit condition is met; manual moves are validated against the same rules.

### Lead ingestion API (for Instagram Growth Automation, website forms)
`POST /api/integrations/leads` with the JSON contract from `docs/06_API_SPEC.md` (optional `utm` object and `referrer`).
Authenticate with `x-rh-signature: sha256=<hex HMAC-SHA256 of the raw body using INSTAGRAM_INGESTION_SHARED_SECRET>` (preferred) or `x-rh-ingestion-secret: <secret>`.
Responses: `201 {data:{opportunity_id, duplicate:false}}`, replay `200 {…duplicate:true}`, `400` validation, `401` bad signature, `429` rate limit, `503` not configured.

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
