# Project State

Status: **v0.1 LIVE** — https://rh-agentic-operations.vercel.app (Vercel + Supabase Postgres). All P0 tasks done; owner sign-in confirmed 2026-10-20.
Date: 2026-10-20

## What exists
- Next.js 16 (App Router) + React 19 + TypeScript + Tailwind v4 app (`src/`).
- PostgreSQL schema as SQL migrations (`database/migrations/`), deterministic reference data, local demo seed.
- Service layer (`src/server/`) holding all business rules and data-level RBAC. Pages, server actions and API routes are thin wrappers.
- Pure, unit-tested domain logic (`src/domain/`): pipeline rules, scoring, ROI, KPI comparison, analytics, money.
- 68 automated tests (unit, integration, RBAC, ingestion HTTP contract incl. Instagram payload, driver, critical-path E2E, seed reconciliation). They pass on embedded Postgres (`npm test`) and on Supabase (`TEST_DATABASE_URL=… npm test`).

## Hosting
- Code: https://github.com/RHdigitalAgency/rh-agentic-operations (private). Connected to Vercel: push to `main` → production; other branches → preview.
- Vercel project `rh-digital-agency-s-projects/rh-agentic-operations`.
- Supabase project `rh-agentic-ops-staging` (ref `okayxtwibdspkasospds`, us-east-2). This is **production**; "staging" in the name is a historical label. The app connects as role `rh_app` through the transaction pooler. Migrations 0001–0002 are applied.
- Admin: `info@rhdigitalagency.com`. Hosted env values live in the untracked `.env.staging.local`.
- Vercel previews run on an isolated in-memory demo database (no production access); verified 2026-10-20.
- Runbook: `docs/11_DEPLOYMENT_AND_RECOVERY.md`.

## External dependencies
- **External Instagram Automation – pending connection, non-blocking.** The receiving side is done: `POST /api/integrations/leads` (signed, idempotent, flat Instagram fields) is documented in the README, with a fixture (`tests/fixtures/instagram-lead.json`), a simulator (`npm run lead:simulate`) and tests (`tests/integration/instagram-ingestion.test.ts`). Manual lead entry covers the gap. Nothing in this repo builds the Instagram automation itself.

## Backlog
TASK-001 → TASK-024 done (see `tasks/BACKLOG.md`). Open: TASK-025 Stripe webhook (P1, hook point `confirmAuditPayment`), TASK-026 SOP library (P2, only after real usage).

## Architecture decisions that differ from the starter docs
- ADR-0003: embedded Postgres (PGlite) for local/test; in-app session auth instead of Supabase Auth for v0.1; RBAC in the service layer, not RLS.
- ADR-0004: data-model additions (fit calls, stage history, effort entries, versioned scores/ROI/weights, integration events, case-study fields).
- ADR-0005: TypeScript 6 pinned for typescript-eslint compatibility.

## Known gaps / technical debt
1. No Supabase Auth adapter (ADR-0003): no password-reset email or SSO. Admins set passwords in Settings.
2. The ingestion rate limiter is in-memory per server instance. Add an edge limit (Vercel firewall) if the endpoint sees abuse.
3. Period filters use UTC day boundaries. Dashboard sums are base-currency (USD) only, with no FX conversion.
4. The audit-credit policy (fee credited within 30 days) is not modeled. Reflect it in the proposal amount/scope.
5. CAC is not computed: there is no acquisition-spend data yet (per the PDR).
6. No UI to edit/delete individual effort or KPI rows. KPI edit exists in the service, with audit logging.
7. `npm audit` flags `braces` in the dev-only ESLint toolchain (not shipped). The available fix would downgrade eslint-config-next.
8. Postgres driver runs with pipelining disabled (`max_pipeline: 0`), because Supabase's transaction pooler hung parallel queries. Re-run the real-Postgres suite after driver or schema changes.

## Next actions
1. When the Instagram automation is ready: share the secret privately and point it at the README contract.
2. UI improvements. Develop locally on PGlite with demo data; use Vercel previews for review.
3. Before real client data: create a separate staging Supabase project and enable backups (Supabase Pro).
4. Add team members in Settings when they start using it.

## Validation clock
Starts when real RH users and real prospects/clients enter the system (see `docs/10_BUSINESS_VALIDATION.md`).
