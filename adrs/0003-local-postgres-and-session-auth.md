# ADR-0003: Embedded Postgres for local dev, in-app session auth for v0.1

Status: Accepted
Date: 2026-10-20

## Context
ADR-0001 selects PostgreSQL via Supabase and Supabase Auth. At build time there were no Supabase credentials (and none may be invented), no Docker for a local Supabase stack, and no local Postgres install. Blocking the build on infrastructure would contradict the "technical MVP immediately" directive.

## Decision
1. **Database:** plain PostgreSQL SQL migrations (`database/migrations/*.sql`) behind a tiny driver interface (`src/lib/db`).
   - `DATABASE_URL` set → `postgres` (postgres.js) driver. Works with Supabase's pooled connection string (`prepare: false`).
   - `DATABASE_URL` empty → **PGlite** (real Postgres 17 compiled to WASM) persisted in `./.data/pglite`. Zero install.
   - Tests run against a fresh in-memory PGlite per file, which also proves migrations apply from zero.
2. **Auth:** in-app email/password auth: scrypt password hashes, random session tokens stored only as SHA-256, httpOnly cookie, 7-day expiry, sessions revoked on deactivation/password reset. `app_users.auth_user_id` is kept for a future Supabase Auth adapter.
3. **RBAC** is enforced in the service layer (`src/server/*`) with SQL scope predicates (`companyVisible`, `opportunityVisible`), so every page, server action and API route gets the same data-level rules. This does not depend on the auth provider.

## Consequences
- Stack intent is unchanged: still Postgres + Next.js + TypeScript + Tailwind; Supabase remains the target managed database.
- Moving to Supabase = set `DATABASE_URL`, run `npm run db:migrate`. Supabase Row Level Security is **not** used in v0.1 (the app connects as one DB role); authorization is enforced in the service layer. Enabling RLS is a later hardening option.
- Swapping in Supabase Auth later: implement `getCurrentUser()` against the Supabase session and map `auth_user_id` → `app_users`. Roles/permissions code does not change.
- PGlite is single-process. Run one app instance per data directory locally; use real Postgres for any shared/staging/production environment.
- Reversible: no business logic depends on PGlite or on the auth mechanism.
