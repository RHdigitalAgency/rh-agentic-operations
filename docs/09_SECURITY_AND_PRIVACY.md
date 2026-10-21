# 09 - Security and Privacy Baseline

## General
- Minimize stored client data.
- Never store client passwords or raw secrets in normal database fields.
- Use managed secrets/environment variables.
- Separate development/test and production.
- Back up database and document recovery procedure.
- Log sensitive business-state changes.
- Apply least privilege.

## Regulated sectors
The RH platform is not a duplicate legal case-management or dental/clinical record system. Store only engagement-management data required by RH.

If a future deployment requires protected or regulated client data, architecture and vendor contracts must be reviewed before that data enters RH systems. Do not assume ordinary SaaS configuration is sufficient.

## Agent deployment controls
Every deployed agent role must define:
- responsibility
- allowed actions
- prohibited actions
- approval thresholds
- escalation owner
- exception handling
- tools/systems accessed
- credential/access method
- logging/monitoring
- rollback/disable procedure

## External integrations
- Verify webhook signatures/shared secrets.
- Validate and rate-limit external payloads.
- Store external IDs for idempotency.
- Do not trust provider metadata without validation.
