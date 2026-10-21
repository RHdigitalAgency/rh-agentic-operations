# 06 - API / Integration Contract

This is a logical contract. The implementation may use REST routes, server actions, RPC, or equivalent, but external integration boundaries must remain stable.

## Lead ingestion

### POST /api/integrations/leads
Purpose: receive normalized leads from Instagram Growth Automation, website forms, or future sources.

Example payload:
```json
{
  "external_event_id": "ig-comment-123",
  "source": "instagram_organic",
  "campaign": "agentic_operations",
  "content_id": "reel_2026_10_20_01",
  "keyword": "AGENTES",
  "contact": {
    "name": "Optional Name",
    "instagram_handle": "example",
    "email": null,
    "phone": null
  },
  "company": {
    "name": null,
    "website": null
  },
  "metadata": {}
}
```

Rules:
- idempotent on `external_event_id` when supplied
- never create duplicate opportunities for the same event
- persist source/campaign/content/keyword
- create an audit-log entry

## Core resources
Logical CRUD/action surfaces:
- `/api/companies`
- `/api/contacts`
- `/api/opportunities`
- `/api/activities`
- `/api/audits`
- `/api/processes`
- `/api/agentic-opportunities`
- `/api/roi-scenarios`
- `/api/proposals`
- `/api/deployments`
- `/api/agent-roles`
- `/api/kpi-measurements`
- `/api/reports/*`

## Important actions

### Opportunity stage transition
Validate allowed transition, update next action where required, and write audit log.

### Calculate Agentic Opportunity Score
Input: raw dimension scores + current configurable weights.  
Output: normalized score plus component breakdown.  
Rule: retain raw scores and weight version.

### Calculate ROI scenario
Input: labor, leakage, quality cost, future-state cost, implementation cost, assumptions.  
Output: monthly value range, annualized value range, payback range, ROI range.  
Rule: estimates are not guarantees and must preserve assumptions.

### Create proposal from recommended opportunity
Creates linked proposal without duplicate client/process entry.

## Payment integration later
Stripe/payment webhooks should update payment state only. Payment provider data must not replace audit/opportunity records.

## Authentication
Internal endpoints require authenticated users. External ingestion endpoints require a shared secret or signed webhook verification and strict validation/rate limiting.
