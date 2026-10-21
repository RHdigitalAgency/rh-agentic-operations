-- RH Agentic Operations Platform - starter relational schema
-- Adapt types/UUID helpers to the selected Postgres/Supabase migration framework.

create extension if not exists pgcrypto;

create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  email text not null unique,
  full_name text,
  role text not null check (role in ('ADMIN_MANAGER','SALES_REP','DELIVERY','AUDITOR_ANALYST','EXTERNAL_REP','READ_ONLY_EXECUTIVE')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  website text,
  city text,
  country text,
  vertical text,
  employee_band text,
  revenue_band text,
  owner_user_id uuid references app_users(id),
  source text,
  status text not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete set null,
  name text,
  role_title text,
  email text,
  phone text,
  instagram_handle text,
  linkedin_url text,
  consent_status text,
  created_at timestamptz not null default now()
);

create table if not exists opportunities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  primary_contact_id uuid references contacts(id) on delete set null,
  owner_user_id uuid references app_users(id),
  stage text not null,
  source text,
  campaign text,
  content_id text,
  keyword text,
  utm jsonb not null default '{}'::jsonb,
  external_event_id text unique,
  estimated_value_cents bigint,
  currency text not null default 'USD',
  next_action text,
  next_action_at timestamptz,
  loss_reason text,
  nurture_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists activities (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid references opportunities(id) on delete cascade,
  company_id uuid references companies(id) on delete cascade,
  owner_user_id uuid references app_users(id),
  activity_type text not null,
  notes text,
  occurred_at timestamptz not null default now()
);

create table if not exists audits (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  opportunity_id uuid references opportunities(id) on delete set null,
  owner_user_id uuid references app_users(id),
  status text not null,
  price_cents bigint,
  currency text not null default 'USD',
  paid_at timestamptz,
  deliverable_url text,
  presentation_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists processes (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references audits(id) on delete cascade,
  name text not null,
  process_owner text,
  frequency text,
  monthly_volume numeric,
  monthly_hours numeric,
  loaded_hourly_cost_cents bigint,
  systems text[],
  risk_notes text,
  judgment_level integer check (judgment_level between 1 and 5),
  classification text check (classification in ('HUMAN_ONLY','AUTOMATE','AGENT_READY','REDESIGN_FIRST')),
  created_at timestamptz not null default now()
);

create table if not exists process_scores (
  id uuid primary key default gen_random_uuid(),
  process_id uuid not null references processes(id) on delete cascade,
  economic_impact integer not null check (economic_impact between 1 and 5),
  frequency_volume integer not null check (frequency_volume between 1 and 5),
  repetitiveness integer not null check (repetitiveness between 1 and 5),
  data_availability integer not null check (data_availability between 1 and 5),
  rule_clarity integer not null check (rule_clarity between 1 and 5),
  human_judgment_required integer not null check (human_judgment_required between 1 and 5),
  error_consequence integer not null check (error_consequence between 1 and 5),
  implementation_difficulty integer not null check (implementation_difficulty between 1 and 5),
  time_to_value integer not null check (time_to_value between 1 and 5),
  weights jsonb not null,
  calculated_score numeric not null,
  scoring_version text not null,
  created_at timestamptz not null default now()
);

create table if not exists agentic_opportunities (
  id uuid primary key default gen_random_uuid(),
  process_id uuid not null references processes(id) on delete cascade,
  proposed_responsibility text not null,
  expected_benefit text,
  risk_level text,
  difficulty_level text,
  priority text,
  recommended_for_pilot boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists roi_scenarios (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references audits(id) on delete cascade,
  process_id uuid references processes(id) on delete set null,
  name text not null,
  assumptions jsonb not null,
  monthly_value_low_cents bigint,
  monthly_value_high_cents bigint,
  annual_value_low_cents bigint,
  annual_value_high_cents bigint,
  payback_months_low numeric,
  payback_months_high numeric,
  roi_low numeric,
  roi_high numeric,
  created_at timestamptz not null default now()
);

create table if not exists proposals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  opportunity_id uuid references opportunities(id) on delete set null,
  audit_id uuid references audits(id) on delete set null,
  proposal_type text not null check (proposal_type in ('PILOT','DEPLOYMENT','RETAINER','SMB_STARTER')),
  amount_cents bigint,
  currency text not null default 'USD',
  status text not null,
  sent_at timestamptz,
  decision_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists deployments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  proposal_id uuid references proposals(id) on delete set null,
  status text not null,
  scope_included text,
  scope_excluded text,
  start_date date,
  end_date date,
  owner_user_id uuid references app_users(id),
  actual_hours numeric not null default 0,
  direct_cost_cents bigint not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists agent_roles (
  id uuid primary key default gen_random_uuid(),
  deployment_id uuid not null references deployments(id) on delete cascade,
  name text not null,
  responsibility text not null,
  allowed_actions text,
  prohibited_actions text,
  approval_requirements text,
  escalation_owner text,
  tools text[],
  created_at timestamptz not null default now()
);

create table if not exists qa_items (
  id uuid primary key default gen_random_uuid(),
  deployment_id uuid not null references deployments(id) on delete cascade,
  description text not null,
  status text not null,
  evidence_url text,
  rollback_ready boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists kpi_measurements (
  id uuid primary key default gen_random_uuid(),
  deployment_id uuid not null references deployments(id) on delete cascade,
  metric_key text not null,
  unit text not null,
  measurement_type text not null check (measurement_type in ('BASELINE','TARGET','RESULT')),
  value numeric not null,
  window_start date,
  window_end date,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists retainers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  proposal_id uuid references proposals(id) on delete set null,
  mrr_cents bigint not null,
  currency text not null default 'USD',
  start_date date not null,
  end_date date,
  status text not null,
  services text,
  created_at timestamptz not null default now()
);

create table if not exists audit_log (
  id bigserial primary key,
  actor_user_id uuid references app_users(id),
  entity_type text not null,
  entity_id uuid,
  action text not null,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_opportunities_stage on opportunities(stage);
create index if not exists idx_opportunities_owner on opportunities(owner_user_id);
create index if not exists idx_opportunities_source on opportunities(source);
create index if not exists idx_audits_company on audits(company_id);
create index if not exists idx_processes_audit on processes(audit_id);
create index if not exists idx_deployments_company on deployments(company_id);
create index if not exists idx_kpi_deployment on kpi_measurements(deployment_id);
