# Test Plan

Minimum automated coverage:

## Unit
- opportunity score calculation including inverse dimensions
- ROI calculation/range behavior
- money/currency helpers
- stage transition rules
- gross-margin calculations

## Integration/API
- authenticated CRUD with role restrictions
- external lead ingestion idempotency
- audit -> process -> recommendation linkage
- proposal -> deployment linkage
- KPI aggregation reconciliation

## End-to-end critical path
Create/ingest lead -> qualify -> audit paid -> add processes -> score -> ROI -> recommend pilot -> proposal -> won deployment -> add agent role/controls -> add baseline/result KPI -> dashboard reflects revenue/margin/result.

A production release is blocked if this critical-path test fails.

## Implemented suites (v0.1)
| File | Covers |
|---|---|
| `tests/unit/scoring.test.ts` | Score calculation incl. inverse dimensions, reproducibility, weight changes, validation, risk flags |
| `tests/unit/roi.test.ts` | ROI low/high ranges, payback, ROI, validation |
| `tests/unit/money-pipeline.test.ts` | Money/currency helpers, gross margin, stage transition rules, KPI comparison |
| `tests/integration/critical-path.test.ts` | **E2E critical path** + dashboard reconciliation + audit trail |
| `tests/integration/rbac.test.ts` | Role restrictions via direct service/API access, auth/sessions |
| `tests/integration/ingestion.test.ts` | Idempotency, attribution, contact dedupe, signature verification |
| `tests/integration/api-and-seed.test.ts` | HTTP contract of `/api/integrations/leads`; demo seed + dashboard reconciliation |

Run all: `npm test` (each file migrates a fresh in-memory Postgres). Against real Postgres: `TEST_DATABASE_URL=<session pooler URL> npm test` (disposable schema per file).
Real Postgres: `TEST_DATABASE_URL=<session-pooler URL> npm test` (disposable `rh_test_*` schema per file; see `docs/11_DEPLOYMENT_AND_RECOVERY.md`).
`tests/integration/driver.test.ts` pins driver parameter handling (`text[]`, `jsonb` as JSON text, int8/numeric/date).
