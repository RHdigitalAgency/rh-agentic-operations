-- TASK-025: Stripe Checkout for paid audits. Stripe only updates payment state; audit/opportunity records stay authoritative.
alter table audits add column stripe_checkout_session_id text unique;
alter table audits add column stripe_checkout_url text;
alter table audits add column stripe_checkout_expires_at timestamptz;
