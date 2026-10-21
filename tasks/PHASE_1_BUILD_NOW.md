# Phase 1 - Build Now

Goal: reach internal v0.1 as fast as safely possible.

Execute TASK-001 through TASK-024, prioritizing the critical path. Parallelize independent tasks only when merge risk is low.

## Release definition
Internal v0.1 is released when:
- all P0 acceptance criteria pass
- critical path E2E test passes
- migrations are reproducible
- RBAC is enforced
- dashboard reconciles with source records
- there are no hard-coded secrets

Do not wait for a polished design system. Functional clarity beats visual perfection for v0.1.
