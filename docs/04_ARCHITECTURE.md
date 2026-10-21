# 04 - Architecture

## Architectural goal
A boring, maintainable internal web application that can be extended quickly by coding agents without turning into a platform science project.

## Recommended shape

```text
Browser
  -> Next.js web application
      -> server-side domain/services layer
          -> PostgreSQL / Supabase
          -> Supabase Auth
          -> Integration adapters
              -> Instagram Growth Automation ingestion
              -> Stripe later
              -> Calendar later
              -> Agent platforms metadata/telemetry later
```

## Principles
- Relational database is the source of truth.
- External systems are integrations, not the master business model.
- CRM stage transitions, scoring, ROI math, permissions, and KPIs are deterministic.
- AI is not needed for v1 core logic.
- Agent-platform-specific details remain behind adapters and metadata records.
- Instagram automation is a separate system; this platform receives normalized lead events.

## Suggested stack
- Frontend/full-stack framework: Next.js + TypeScript
- Database: PostgreSQL via Supabase
- Auth: Supabase Auth
- Styling: Tailwind CSS
- Deployment: Vercel or equivalent
- Validation: Zod or equivalent typed schema validation
- Tests: unit + API/integration + a small end-to-end critical-path suite

## Service boundaries

### CRM service
Companies, contacts, opportunities, pipeline, activities, attribution.

### Audit service
Audits, processes, classifications, score calculation, ROI assumptions/results.

### Delivery service
Proposals, deployments, agent roles, controls, QA, effort, KPI measurements.

### Analytics service
Funnel, conversion, revenue, margin, MRR, cycle, source/vertical/rep performance.

### Integration service
Normalizes inbound events and isolates provider-specific APIs/webhooks.

## Data ownership
RH owns its operational records. Client systems remain the authoritative source for client operational/legal/clinical data. RH stores only what is necessary to run the engagement and measure value.

## No-agent rule for core platform
Do not insert Grok Bot, Dots, or another agent into deterministic CRM functions. Agentic assistance may be added later for drafting/search/pattern detection, but never as a dependency for core record integrity.
