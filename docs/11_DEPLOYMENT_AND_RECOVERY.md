# 11 - Deployment, Backup & Recovery (v0.1)

## Environments
| Env | Database | Notes |
|---|---|---|
| Local | PGlite in `./.data/pglite` (`DATABASE_URL` empty) | `npm run db:reset` for demo data |
| Vercel Preview | Throwaway in-memory Postgres per instance, auto-seeded with demo data | No `DATABASE_URL` for Preview, so previews can never reach production. Sign in with the demo users and `SEED_DEMO_PASSWORD` (Preview env). Data resets on cold start (~10 s first request), and Vercel may serve pages from different instances, so you can be signed out while navigating. Quick visual review only — test flows locally. Protected by Vercel login. |
| Production | Supabase `rh-agentic-ops-staging` (the name is a historical label; this is production) | `DATABASE_URL` is Production-only. The app refuses to start in production without it. |
| Staging (later) | Separate Supabase project | Add when real client data makes a pre-production copy worthwhile |

Vercel env var targets: `DATABASE_URL`, `APP_BASE_CURRENCY`, `INSTAGRAM_INGESTION_SHARED_SECRET` → Production; `SEED_DEMO_PASSWORD`, `APP_BASE_CURRENCY`, a separate preview `INSTAGRAM_INGESTION_SHARED_SECRET` → Preview. Optional (Production): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_APP_URL` to enable Stripe audit payments. Never give `DATABASE_URL` a Preview target.

## Deploy (Vercel or any Node host)
1. Create the Supabase project. Connect as a dedicated app role, not `postgres`: create `rh_app` (login, `usage, create on schema public`, plus `create on database` if you run the real-Postgres tests). Set its password from a SCRAM hash generated on a trusted machine so the plaintext never leaves it. `DATABASE_URL` = **transaction pooler** (port 6543, user `rh_app.<project-ref>`). The driver uses `prepare: false`, so the pooler works. Tables owned by `rh_app` get no `anon`/`authenticated` grants, so Supabase's Data API cannot read them.
   Keep hosted values in an untracked `.env.staging.local` (`.env.local` stays on local PGlite). Load it explicitly for CLI work, e.g. bash: `set -a; . ./.env.staging.local; set +a`.
2. Set env vars from `.env.example`: `DATABASE_URL`, `APP_BASE_CURRENCY`, `INSTAGRAM_INGESTION_SHARED_SECRET` (random, 32+ bytes, per environment). Never commit them.
3. `npm ci && npm run db:migrate` (from CI or a trusted machine with `DATABASE_URL` set). The app also applies pending migrations on first connection.
4. `npm run build && npm start` (or let Vercel build). Node ≥ 20.
5. Create the first admin (with `DATABASE_URL` pointing at the target DB):
   `ADMIN_EMAIL=owner@yourdomain ADMIN_NAME="Owner Name" ADMIN_PASSWORD='<strong password>' npm run user:create-admin`
   Then create everyone else in **Settings → Users**.
6. Smoke test: sign in, open the dashboard, then send one signed test event to `/api/integrations/leads` (see README) and archive it afterwards.

## Verify against real Postgres (before go-live and after driver/schema changes)
`TEST_DATABASE_URL=<session pooler URL, port 5432> npm test` runs the whole suite on real Postgres. Each test file gets a disposable `rh_test_*` schema that is dropped afterwards; files run one at a time to stay inside pooler limits. Use the session pooler, not the transaction pooler, because the per-connection `search_path` must persist. Expect several minutes (one network round trip per query).

## Backups
- Supabase: enable daily backups (Pro plan) or Point-in-Time Recovery. Keep at least 7 days.
- Independent copy (recommended weekly): `pg_dump --format=custom --no-owner "$DATABASE_URL" > rh-$(date +%F).dump`. Store it encrypted outside Supabase.
- Exports (`/api/exports/*`) are a convenience, not a backup.

## Recovery procedure
1. Freeze writes: rotate `INSTAGRAM_INGESTION_SHARED_SECRET` (ingestion returns 401/503) and announce the maintenance window to users.
2. Restore: Supabase dashboard → Backups / PITR to a timestamp, **or** `pg_restore --clean --no-owner -d "$DATABASE_URL" rh-YYYY-MM-DD.dump`.
3. `npm run db:migrate` to apply any migrations newer than the backup.
4. Verify: sign in; the dashboard loads; `select max(created_at) from audit_log;` matches the expected restore point.
5. Re-enable ingestion. The Instagram system can replay events from the gap; ingestion is idempotent on `external_event_id`, so replays never duplicate leads.

## Local reset
`npm run db:reset` deletes `./.data/pglite`, re-migrates and re-seeds demo data. It refuses to run against `DATABASE_URL`.
