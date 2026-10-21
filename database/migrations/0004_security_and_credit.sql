-- Sign-in lockout: recent failed attempts per email are counted before verifying a password.
create table login_attempts (
  id bigserial primary key,
  email text not null,
  succeeded boolean not null,
  created_at timestamptz not null default now()
);
create index idx_login_attempts_email on login_attempts(lower(email), created_at desc);

-- Audit credit policy: the paid audit fee can be credited against an implementation bought within 30 days.
alter table proposals add column audit_credit_cents bigint not null default 0 check (audit_credit_cents >= 0);
alter table proposals add constraint audit_credit_le_amount check (audit_credit_cents <= amount_cents);
