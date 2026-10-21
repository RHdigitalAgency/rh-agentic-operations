# 03 - Technical Execution Plan

## Objective
Translate the strategic plan and PDR into the fastest safe path to a usable internal product.

## Two clocks

### Build clock
Engineering is expected to move at agentic speed.
- Hour 0-1: repo/bootstrap, auth, migrations, seed/reference data
- Hour 1-3: companies, contacts, opportunities, stages, activities
- Hour 3-5: audit/process inventory, scoring, ROI calculations
- Hour 5-7: proposal/deployment tracking, KPI baselines/results
- Hour 7-9: dashboard, filters, overdue queue, permissions
- Hour 9-12: integration adapter, tests, polish, deployment

This is a target sequence, not a promise. Quality and acceptance tests control release, not elapsed time.

### Business validation clock
After internal launch:
- 0-30 days: paid-audit demand, pipeline behavior, first deployments
- 31-60 days: audit-to-deployment conversion, delivery margin, ROI measurement
- 61-90 days: repeatability by vertical, sales cycle, CAC if ads begin, reusable-delivery percentage

## MVP build phases

### Phase A - Foundation
Deliver:
- project bootstrap
- auth/RBAC
- reference data
- database migrations
- audit logging primitive

### Phase B - Commercial core
Deliver:
- companies and contacts
- opportunities/pipeline
- source/campaign/content/keyword attribution
- activities and next action
- loss reasons
- dashboard basics

### Phase C - Audit and value
Deliver:
- audit workspace
- process inventory
- classification
- configurable scoring weights
- ROI engine with editable assumptions and ranges
- recommended pilot conversion

### Phase D - Delivery and proof
Deliver:
- proposals
- deployments
- agent role cards
- controls and QA tracking
- delivery effort/direct costs
- baseline vs result KPI capture
- internal case-study summary

### Phase E - Hardening
Deliver:
- data-level permissions
- exports
- filters
- overdue queues
- test suite
- error/loading/empty states
- deployment and recovery notes

## Launch gate
The app may be used internally once all P0 criteria in `07_ACCEPTANCE_CRITERIA.md` pass. P1 enhancements can follow usage feedback without blocking launch.
