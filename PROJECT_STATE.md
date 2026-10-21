# Project State

Status: **v0.1 LIVE** — https://rh-agentic-operations.vercel.app (Vercel + Supabase Postgres). All P0 tasks done; owner sign-in confirmed 2026-10-20.
Date: 2026-10-21

## What exists
- Next.js 16 (App Router) + React 19 + TypeScript + Tailwind v4 app (`src/`).
- PostgreSQL schema as SQL migrations (`database/migrations/`), deterministic reference data, local demo seed.
- Service layer (`src/server/`) holding all business rules and data-level RBAC. Pages, server actions and API routes are thin wrappers.
- Pure, unit-tested domain logic (`src/domain/`): pipeline rules, scoring, ROI, KPI comparison, analytics, money.
- 88 automated tests (unit, integration, RBAC, ingestion HTTP contract incl. Instagram payload, driver, critical-path E2E, seed reconciliation). They pass on embedded Postgres (`npm test`) and on Supabase (`TEST_DATABASE_URL=… npm test`).

## ⚠ Demo data in production
Production currently contains the **removable demo dataset** (added 2026-10-21 for UI review: 13 demo companies, 7 demo users that cannot sign in). Before entering real clients run:
`set -a; . ./.env.staging.local; set +a; npm run demo:remove` — it deletes exactly what was added (tested) and leaves real records untouched.

## Hosting
- Code: https://github.com/RHdigitalAgency/rh-agentic-operations (private). Connected to Vercel: push to `main` → production; other branches → preview.
- Vercel project `rh-digital-agency-s-projects/rh-agentic-operations`.
- Supabase project `rh-agentic-ops-staging` (ref `okayxtwibdspkasospds`, us-east-2). This is **production**; "staging" in the name is a historical label. The app connects as role `rh_app` through the transaction pooler. Migrations 0001–0005 are applied (0005 on 2026-10-21, before the `hardening` merge).
- Admin: `info@rhdigitalagency.com`. Hosted env values live in the untracked `.env.staging.local`.
- Vercel previews run on an isolated in-memory demo database (no production access). Each instance has its own demo data, so preview sessions can drop between pages — previews are for quick visual review; test flows locally.
- UI: RH Digital Agency brand system (brand book in `assets/branding`, untracked), live since 2026-10-21.
- Runbook: `docs/11_DEPLOYMENT_AND_RECOVERY.md`.

## External dependencies
- **External Instagram Automation – pending connection, non-blocking.** The receiving side is done: `POST /api/integrations/leads` (signed, idempotent, flat Instagram fields) is documented in the README, with a fixture (`tests/fixtures/instagram-lead.json`), a simulator (`npm run lead:simulate`) and tests (`tests/integration/instagram-ingestion.test.ts`). Manual lead entry covers the gap. Nothing in this repo builds the Instagram automation itself.

## Backlog
TASK-001 → TASK-025 done (see `tasks/BACKLOG.md`). Open: TASK-026 SOP library (P2, only after real usage).

Payments: manual confirmation for all clients (standard for non-US); Stripe Checkout link + signed webhook for US card payments. Stripe is **active in test mode** in production (verified end-to-end 2026-10-21: test card payment → webhook → audit marked paid automatically). Going live = swap in live-mode keys + live webhook (README → "Audit payments").

## Architecture decisions that differ from the starter docs
- ADR-0003: embedded Postgres (PGlite) for local/test; in-app session auth instead of Supabase Auth for v0.1; RBAC in the service layer, not RLS.
- ADR-0004: data-model additions (fit calls, stage history, effort entries, versioned scores/ROI/weights, integration events, case-study fields).
- ADR-0005: TypeScript 6 pinned for typescript-eslint compatibility.

## Known gaps / technical debt
1. No Supabase Auth adapter (ADR-0003): no password-reset email or SSO. Admins set passwords in Settings.
2. The ingestion rate limiter is in-memory per server instance. Add an edge limit (Vercel firewall) if the endpoint sees abuse.
3. Dashboard sums are base-currency (USD) only, with no FX conversion. (Day boundaries now use the business time zone, `NEXT_PUBLIC_APP_TIMEZONE`, default America/Lima.)
4. ~~Audit credit not modeled~~ — done: opt-in per proposal, only after the audit is paid, within 30 days, once per audit, never on retainers; revenue analytics use the net amount.
5. CAC is not computed: there is no acquisition-spend data yet (per the PDR).
6. ~~No UI to edit/delete effort or KPI rows~~ — done, owner or manager only, audit-logged.
7. `npm audit` flags `braces` in the dev-only ESLint toolchain (not shipped). The available fix would downgrade eslint-config-next.
8. Postgres driver runs with pipelining disabled (`max_pipeline: 0`), because Supabase's transaction pooler hung parallel queries. That setting breaks postgres.js `sql.begin`, so transactions use a reserved connection with explicit BEGIN/COMMIT (fixed 2026-10-20; writes were failing in production between the pipelining change and this fix). Re-run the real-Postgres suite after driver or schema changes.

## Improvements round (live 2026-10-21)
- Security: account lockout after 5 failed sign-ins in 15 min (admin password reset lifts it); `/account` page to change own name and password (signs out other sessions).
- Faster lead entry: one company field with suggestions that links to an existing account by name (no duplicates), individuals named after the contact, sensible defaults (Instagram source, "First outreach" due tomorrow 09:00), optional fields collapsed, "Create & add another".
- Guidance: "Next step" banner on each opportunity, with a direct link.
- Delivery: edit/delete effort and KPI rows; KPI name/unit suggestions; work date defaults to today.
- Client documents: branded audit report (`/print/audits/{id}`) and proposal (`/print/proposals/{id}`), saved as PDF from the browser.
- Audit credit (see gap 4).
- Ideas not built yet: daily follow-up email digest, CAC once spend is tracked, error monitoring.

## UI round 3 (branch `ui-round-3`, 2026-10-21)
- One-click follow-ups (Follow-ups page + "Your follow-ups today" on the dashboard): +1 day / +1 week snooze, and Done = log the activity and set the next step in one form. Audit-logged.
- Pipeline: amber for due today, red for overdue, "Needs attention" filter; sortable table views.
- Pop-up notifications replace the page banners (success fades, errors stay); the message is removed from the address bar.
- Phones: collapsible menu (with My account), tighter padding, tables scroll inside their card.
- Dashboard: revenue by month (last 6 months, audits + implementation net of credit).
- Lists: sortable columns, search/filters, CSV export (companies, audits, proposals) on Companies, Audits, Proposals, Deployments.
- Keyboard: N = new lead, / = search. Helpful empty states with the first action.
- **Spanish UI toggle: deferred until the owner approves the final English version.**

## Hardening pass (branch `hardening`, 2026-10-21)
- Concurrency: every status transition (proposal send/accept/reject/withdraw, audit paid/start/present/cancel, deployment status, stage moves) locks its row and re-checks status inside the transaction; double submits get a clean "refresh and try again" instead of duplicate deployments/history. Stripe webhook claims the event id atomically. DB unique indexes back the "one active audit per opportunity / one audit credit per audit / one proposal per pilot" rules (migration 0005). Migrations run under an advisory lock.
- Security: CSP + frame/sniff/referrer/permissions/HSTS headers; open-redirect fix on `_back`; async password hashing check (no event-loop blocking); sign-in attempts pruned; LIKE wildcards escaped; ingestion size pre-check and bounded rate-limiter memory.
- Reliability: database errors mapped to user-facing errors (malformed id = not found, unique race = conflict) instead of 500s; Stripe checkout uses a stable idempotency key (no duplicate payable links) and a 15 s timeout.
- Correctness: all wall-clock times (form deadlines, "due today", displayed times, dashboard periods) use the business time zone instead of the server's UTC; exports are no longer capped at the on-screen list limits; leads are not attached to contacts of archived companies.

## Next actions
0. Remove the demo data from production (`npm run demo:remove`, see top) before real use.
1. Switch Stripe to live mode before the first real US client: live secret key + live webhook signing secret in Vercel (Production), then redeploy.
2. When the Instagram automation is ready: share the secret privately and point it at the README contract.
3. Further UI feedback: develop locally on PGlite with demo data; previews for quick visual review.
4. Before real client data: create a separate staging Supabase project and enable backups (Supabase Pro).
5. Add team members in Settings when they start using it.

## Validation clock
Starts when real RH users and real prospects/clients enter the system (see `docs/10_BUSINESS_VALIDATION.md`).
