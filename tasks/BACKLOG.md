# Execution Backlog

Priority: P0 unless marked otherwise. Work in dependency order. IDs are stable.

| ID | Task | Depends on | Done when | Status (2026-10-20) |
|---|---|---|---|---|
| TASK-001 | Bootstrap app, TypeScript, styling, env validation | - | App runs locally and CI/test commands exist | ✅ Done |
| TASK-002 | Configure Postgres/Supabase and migrations | 001 | Clean DB can migrate from zero | ✅ Done |
| TASK-003 | Auth + RBAC roles | 001,002 | P0 roles enforced at data/API layer | ✅ Done |
| TASK-004 | Seed reference data: stages, classifications, verticals, loss reasons | 002 | Deterministic seed works | ✅ Done |
| TASK-005 | Companies + contacts | 002,003 | CRUD + account view | ✅ Done |
| TASK-006 | Opportunities + fixed pipeline + attribution | 004,005 | Full stage flow works | ✅ Done |
| TASK-007 | Activities, next action, overdue queue, loss/nurture | 006 | Sales follow-up usable | ✅ Done |
| TASK-008 | External lead ingestion endpoint + idempotency | 006 | Test event creates one attributed lead/opportunity | ✅ Done |
| TASK-009 | Basic executive dashboard | 006,007 | Lead/funnel/source/rep metrics reconcile | ✅ Done |
| TASK-010 | Audits | 005,006 | Paid audit lifecycle works | ✅ Done |
| TASK-011 | Process inventory + classification | 010 | Multiple processes per audit | ✅ Done |
| TASK-012 | Agentic Opportunity Score engine | 011 | Raw scores + weights + reproducible total | ✅ Done |
| TASK-013 | ROI scenario engine | 011 | Editable assumptions + ranges persisted | ✅ Done |
| TASK-014 | Recommended pilot conversion | 012,013 | Selected opportunity can seed proposal | ✅ Done |
| TASK-015 | Proposals | 014 | Pilot/deployment/retainer proposals linked | ✅ Done |
| TASK-016 | Deployments | 015 | Scope/status/effort/direct cost tracked | ✅ Done |
| TASK-017 | Agent role cards + control model | 016 | Allowed/prohibited/approval/escalation fields work | ✅ Done |
| TASK-018 | QA items + launch status | 016,017 | Deployment QA and rollback readiness tracked | ✅ Done |
| TASK-019 | KPI baseline/result measurements | 016 | Before/after values stored by window | ✅ Done |
| TASK-020 | Margin/MRR/sales-cycle analytics | 015,016,019 | Dashboard reconciles to records | ✅ Done |
| TASK-021 | Case-study internal summary | 019 | One-page internal summary generated/viewable | ✅ Done |
| TASK-022 | CSV exports | 006,020 | Leads/pipeline/KPIs export cleanly | ✅ Done |
| TASK-023 | Critical-path E2E test | all P0 | Lead -> audit -> proposal -> deployment -> result passes | ✅ Done |
| TASK-024 | Production deployment + backup/recovery note | 023 | Internal users can access stable v0.1 | ✅ Done — live at https://rh-agentic-operations.vercel.app |
| TASK-025 | Stripe payment webhook | P1 | Paid audit status automated | ✅ Done — Checkout link + signed webhook; manual confirmation kept for non-US clients; needs Stripe keys to activate |
| TASK-026 | SOP/playbook library | P2 | Only after real usage justifies it | Not started (P1/P2) |

## Critical path
001 -> 002 -> 003/004 -> 005 -> 006 -> 010 -> 011 -> 012/013 -> 014 -> 015 -> 016 -> 019 -> 020 -> 023 -> 024
