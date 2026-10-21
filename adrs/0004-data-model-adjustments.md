# ADR-0004: Data model adjustments to the starter schema

Status: Accepted
Date: 2026-10-20

`database/schema.sql` remains the reference starter; the authoritative schema is `database/migrations/`. Changes, each required by an acceptance criterion or KPI definition:

| Change | Why |
|---|---|
| Reference tables: `pipeline_stages`, `ref_verticals` (with `regulated`), `ref_sources`, `ref_loss_reasons`, `ref_process_classifications` + FKs | TASK-004; fixed stages and standard loss reasons keep metrics comparable |
| `opportunity_stage_history` | Funnel ("reached stage"), win rate and sales-cycle need transition timestamps; stage changes are auditable |
| `fit_calls` table | PDR §4 lists Fit Call as an entity; fit-call rate and audit conversion (÷ qualified fit calls) need it |
| `opportunities.referrer_user_id`, `referrer`, `title`, `loss_notes`, `stage_changed_at`, `archived_at` | Partner attribution must survive owner reassignment; soft delete |
| DB check: Lost/Nurture requires loss reason or nurture date | Enforced in DB and in the transition rules |
| `integration_events` (provider + external_event_id unique) | Idempotent ingestion + raw payload retention |
| `audits`: discovery/summary/roadmap fields, `payment_reference`, check paid ⇒ `paid_at` | Audit workflow steps 2 and 9 |
| `processes`: inputs, outputs, exceptions, error consequence notes | Audit workflow step 4 |
| `process_scores` append-only; `scoring_weight_sets` (versioned, one active) | Raw scores + weights version stored; scores reproducible; weights configurable |
| `roi_scenarios` append-only versions (`scenario_key`, `version`, `model_version`, `implementation_cost_cents`) | "Never overwrite historical assumptions silently" |
| `agentic_opportunities.roi_scenario_id`, `regulated_boundary_ack` | Projected ROI link; Legal/Dental admin-only confirmation |
| `proposals.title`, `scope_summary`, `agentic_opportunity_id`; status check | Pilot → proposal linkage without re-entry |
| `deployments`: name, integrations, launch date/version, monitoring window, reusable/total components, case-study block, client approval | Delivery Tracker §10 and Case Study §11 |
| **`deployment_effort_entries` instead of `deployments.actual_hours/direct_cost_cents`** | Gross margin must be traceable to individual records |
| `agent_roles`: exception handling, access method, logging/monitoring, rollback, owner, `provider` + `provider_metadata` | Security §"Agent deployment controls"; vendor-neutral provider abstraction |
| `kpi_measurements.benefit_monthly_cents`; window required for baseline/result | Client ROI = measured benefit ÷ implementation revenue |
| `app_settings` (internal hourly cost, default lead owner), `user_sessions` | Margin estimation; ingestion routing; auth |

Money is integer cents plus an ISO currency everywhere. Dashboard sums use `APP_BASE_CURRENCY` (USD) and report how many other-currency records were excluded. There is no FX conversion in v0.1.
