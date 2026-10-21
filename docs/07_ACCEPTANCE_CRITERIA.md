# 07 - MVP Acceptance Criteria

## P0 - Required before internal launch

### Authentication and permissions
- [x] Users can sign in.
- [x] Admin/Manager, Sales, Delivery, Auditor/Analyst, External Rep, and Read-only Executive roles exist.
- [x] Restricted roles cannot retrieve unauthorized records through direct API/data access.

### Lead-to-revenue traceability
- [x] Manual lead creation works.
- [x] Normalized external lead ingestion works and is idempotent.
- [x] Source/campaign/content/keyword attribution is preserved.
- [x] Opportunity can move through the fixed pipeline stages.
- [x] Next action and overdue follow-up are visible.
- [x] Lost opportunities require a loss reason or nurture date.

### Audit
- [x] Paid audit can be created and linked to account/opportunity.
- [x] Audit can contain multiple process records.
- [x] Each process can be classified Human only / Automate / Agent-ready / Redesign first.
- [x] Raw score dimensions are stored.
- [x] Calculated score is reproducible from stored weights.
- [x] ROI assumptions are editable and preserved.
- [x] Recommended pilot can be created from an agent-ready opportunity.

### Proposal and deployment
- [x] Proposal links to existing account/opportunity/audit.
- [x] Won proposal can create/link a deployment without duplicate client data.
- [x] Deployment stores scope, agent roles, controls, QA, hours, and direct cost.
- [x] Agent role stores allowed actions, prohibited actions, approvals, escalation, and tools.

### Measurement
- [x] KPI baseline and post-deployment result can be stored with measurement windows.
- [x] Dashboard metrics reconcile with source records.
- [x] Gross margin can be estimated from revenue, delivery hours/direct cost inputs.
- [x] Filters work by time, vertical, source, and rep.

### Reliability
- [x] Database migrations apply from a clean environment.
- [x] Critical tests pass.
- [x] No credentials are stored in source control.
- [x] Empty/loading/error states do not break critical flows.

## P1 - Immediately after launch
- [x] CSV export for leads/pipeline/KPIs.
- [x] Case-study one-page internal summary.
- [x] Configurable scoring weights UI.
- [x] Better activity timeline (basic, per company/opportunity).
- [ ] Stripe webhook for paid audit status.

## P2 - Only after real usage justifies them
- SOP/playbook library
- commission tracking
- calendar sync
- email logging
- client portal
- AI copilot/internal search
- agent-platform telemetry

## Verification log (2026-10-20)
P0 items are covered by automated tests (`npm test`) and a manual browser walk-through of a new lead from creation to measured KPI:
- Auth/RBAC: `tests/integration/rbac.test.ts`, plus manual checks (a sales rep gets 404 for another rep's deal in the UI and API).
- Lead → revenue traceability, audit, proposal/deployment, measurement: `tests/integration/critical-path.test.ts`.
- Ingestion idempotency + HTTP auth: `tests/integration/ingestion.test.ts`, `tests/integration/api-and-seed.test.ts`.
- Dashboard reconciliation: critical-path and seed tests compare dashboard metrics with direct SQL over the records.
- Migrations from clean: every test file migrates a fresh database; `npm run db:reset` does it on disk.
- No credentials in source: `.env*` are git-ignored; ingestion is disabled until a secret is configured.
- Empty/loading/error states: route-level `loading.tsx`, `error.tsx`, `not-found.tsx`, and empty states on every list.
- Real Postgres: the full suite passes against Supabase (`TEST_DATABASE_URL`), and the deployed app was smoke-tested (sign-in, dashboard, signed ingestion + replay).
