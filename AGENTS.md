# AGENTS.md - Coding Agent Operating Contract

You are building the internal RH Agentic Operations Platform.

## 1. Read order before coding

Read, in this order:
1. `README.md`
2. `docs/01_STRATEGIC_PLAN.md`
3. `docs/02_PLATFORM_PDR.md`
4. `docs/03_EXECUTION_PLAN.md`
5. `docs/04_ARCHITECTURE.md`
6. `docs/05_DATA_MODEL.md`
7. `docs/06_API_SPEC.md`
8. `docs/07_ACCEPTANCE_CRITERIA.md`
9. `docs/08_DOMAIN_RULES.md`
10. `docs/09_SECURITY_AND_PRIVACY.md`
11. `tasks/BACKLOG.md`

## 2. Core behavior

- Build the smallest complete system that satisfies MVP acceptance criteria.
- Prefer deterministic logic over AI for CRM, pipeline, scoring, ROI, permissions, and KPI calculations.
- Do not invent product requirements.
- Do not create credentials, production secrets, or fake third-party integrations.
- Use mocks/adapters for unavailable external services.
- Keep external integrations behind interfaces so providers can change later.
- Maintain database migrations from day one.
- Add tests for critical business rules before marking a task complete.
- Preserve source/campaign attribution through the full funnel.
- Every calculated dashboard metric must be traceable to underlying records.
- Update `PROJECT_STATE.md` after each completed milestone.

## 3. Scope control

Before implementing a feature, map it to one of these MVP modules:
- CRM + Sales Pipeline
- Executive KPI Dashboard
- Audit Engine
- Proposal / Opportunity
- Delivery Tracker
- Case Study Metrics
- Roles / Permissions
- Lead ingestion adapter

If it maps to none, do not build it unless it is a technical prerequisite for a listed acceptance criterion.

## 4. Non-goals

Do not build in v1:
- generic HubSpot/Salesforce replacement
- ManyChat clone
- Instagram comment-to-DM engine itself
- AI copilot for CRM actions
- client-facing SaaS portal
- full accounting system
- full invoicing system
- full email client
- full calendar product
- client legal/clinical system of record
- autonomous legal, clinical, or professional advice

## 5. Architecture rules

- Use relational data modeling.
- Keep domain entities explicit; avoid dumping core state into unstructured JSON.
- Use JSON only for flexible metadata or snapshots where schema evolution is expected.
- Enforce role permissions at the data/API layer, not only visually.
- Keep audit logs for stage changes, money fields, scores, and deployment status.
- Store monetary values in integer cents plus currency code.
- Store timestamps in UTC; render in user locale.
- Soft deletion is acceptable for business records; preserve auditability.

## 6. Regulated-domain rule

For Legal Admin and Dental Admin verticals, the platform only supports administrative/operational workflows. It must never encode autonomous professional advice, diagnosis, legal strategy, clinical recommendations, or regulated judgment.

Status communication is allowed only when based on authoritative stored/client-system data. Uncertainty or professional judgment must escalate to an authorized human.

## 7. Testing standard

A task is not done until:
- implementation compiles
- migrations apply cleanly
- relevant unit/integration tests pass
- critical authorization paths are tested
- acceptance criterion linked to the task is demonstrably satisfied
- no secret is committed

## 8. Working style

Work continuously through unblocked tasks. If a requirement is genuinely ambiguous:
1. choose the smallest reversible option consistent with the source documents;
2. record the decision in an ADR under `adrs/`;
3. continue instead of blocking unless the choice could materially change security, data ownership, or business behavior.

Do not broaden scope simply because it is technically interesting.
