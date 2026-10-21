-- RH Agentic Operations Platform - core schema (v0.1)
-- Derived from database/schema.sql. Deviations are documented in adrs/0004-data-model-adjustments.md.
-- gen_random_uuid() is core in Postgres 13+, so no extension is required.

-- ---------------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------------
create table pipeline_stages (
  code text primary key,
  name text not null,
  sort_order integer not null unique,
  exit_condition text not null,
  is_won boolean not null default false,
  is_closed boolean not null default false
);

create table ref_verticals (
  code text primary key,
  name text not null,
  priority integer,
  regulated boolean not null default false,
  active boolean not null default true
);

create table ref_sources (
  code text primary key,
  name text not null,
  active boolean not null default true
);

create table ref_loss_reasons (
  code text primary key,
  name text not null,
  active boolean not null default true
);

create table ref_process_classifications (
  code text primary key,
  name text not null,
  description text not null
);

-- ---------------------------------------------------------------------------
-- Users, auth, settings
-- ---------------------------------------------------------------------------
create table app_users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique, -- reserved for an external auth provider (Supabase Auth adapter)
  email text not null unique,
  full_name text,
  role text not null check (role in ('ADMIN_MANAGER','SALES_REP','DELIVERY','AUDITOR_ANALYST','EXTERNAL_REP','READ_ONLY_EXECUTIVE')),
  territory text,
  password_hash text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table user_sessions (
  token_hash text primary key,
  user_id uuid not null references app_users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index idx_user_sessions_user on user_sessions(user_id);

create table app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references app_users(id)
);

create table scoring_weight_sets (
  version text primary key,
  weights jsonb not null,
  active boolean not null default false,
  notes text,
  created_by uuid references app_users(id),
  created_at timestamptz not null default now()
);
create unique index uq_scoring_weight_sets_active on scoring_weight_sets(active) where active;

-- ---------------------------------------------------------------------------
-- CRM
-- ---------------------------------------------------------------------------
create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  website text,
  city text,
  country text,
  vertical text references ref_verticals(code),
  employee_band text,
  revenue_band text,
  owner_user_id uuid references app_users(id),
  source text,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE')),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_companies_owner on companies(owner_user_id);

create table contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete set null,
  name text,
  role_title text,
  email text,
  phone text,
  instagram_handle text,
  linkedin_url text,
  consent_status text not null default 'UNKNOWN' check (consent_status in ('UNKNOWN','OPTED_IN','OPTED_OUT')),
  archived_at timestamptz,
  created_at timestamptz not null default now()
);
create index idx_contacts_company on contacts(company_id);
create index idx_contacts_email on contacts(lower(email));
create index idx_contacts_instagram on contacts(lower(instagram_handle));

create table opportunities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  primary_contact_id uuid references contacts(id) on delete set null,
  owner_user_id uuid references app_users(id),
  referrer_user_id uuid references app_users(id), -- attributed partner / external rep
  title text,
  stage text not null references pipeline_stages(code),
  source text,
  campaign text,
  content_id text,
  keyword text,
  referrer text,
  utm jsonb not null default '{}'::jsonb,
  external_event_id text unique,
  estimated_value_cents bigint check (estimated_value_cents is null or estimated_value_cents >= 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  next_action text,
  next_action_at timestamptz,
  loss_reason text references ref_loss_reasons(code),
  loss_notes text,
  nurture_at timestamptz,
  stage_changed_at timestamptz not null default now(),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lost_requires_reason_or_nurture check (stage <> 'LOST_NURTURE' or loss_reason is not null or nurture_at is not null)
);
create index idx_opportunities_stage on opportunities(stage);
create index idx_opportunities_owner on opportunities(owner_user_id);
create index idx_opportunities_source on opportunities(source);
create index idx_opportunities_company on opportunities(company_id);
create index idx_opportunities_referrer on opportunities(referrer_user_id);
create index idx_opportunities_next_action on opportunities(next_action_at);

create table opportunity_stage_history (
  id bigserial primary key,
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  from_stage text references pipeline_stages(code),
  to_stage text not null references pipeline_stages(code),
  changed_by uuid references app_users(id),
  changed_at timestamptz not null default now()
);
create index idx_stage_history_opp on opportunity_stage_history(opportunity_id);

create table fit_calls (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  scheduled_at timestamptz not null,
  completed_at timestamptz,
  outcome text check (outcome in ('QUALIFIED','NOT_QUALIFIED','NO_SHOW')),
  pain_summary text,
  audit_recommended boolean,
  owner_user_id uuid references app_users(id),
  created_at timestamptz not null default now(),
  constraint completed_requires_outcome check (completed_at is null or outcome is not null)
);
create index idx_fit_calls_opp on fit_calls(opportunity_id);

create table activities (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid references opportunities(id) on delete cascade,
  company_id uuid references companies(id) on delete cascade,
  owner_user_id uuid references app_users(id),
  activity_type text not null check (activity_type in ('CALL','EMAIL','DM','MEETING','TASK','NOTE')),
  notes text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index idx_activities_opp on activities(opportunity_id);
create index idx_activities_company on activities(company_id);

-- Inbound integration events (idempotency + raw payload retention)
create table integration_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  external_event_id text,
  payload jsonb not null,
  opportunity_id uuid references opportunities(id) on delete set null,
  received_at timestamptz not null default now()
);
create unique index uq_integration_events_external on integration_events(provider, external_event_id) where external_event_id is not null;

-- ---------------------------------------------------------------------------
-- Audit engine
-- ---------------------------------------------------------------------------
create table audits (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  opportunity_id uuid references opportunities(id) on delete set null,
  owner_user_id uuid references app_users(id),
  status text not null check (status in ('OFFERED','PAID','IN_PROGRESS','PRESENTED','CANCELLED')),
  price_cents bigint not null check (price_cents >= 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  paid_at timestamptz,
  payment_reference text,
  business_goals text,
  team_summary text,
  systems_summary text,
  executive_summary text,
  roadmap_90_day text,
  deliverable_url text,
  presentation_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint paid_status_requires_paid_at check (status in ('OFFERED','CANCELLED') or paid_at is not null)
);
create index idx_audits_company on audits(company_id);
create index idx_audits_opportunity on audits(opportunity_id);

create table processes (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references audits(id) on delete cascade,
  name text not null,
  process_owner text,
  frequency text,
  monthly_volume numeric check (monthly_volume is null or monthly_volume >= 0),
  monthly_hours numeric check (monthly_hours is null or monthly_hours >= 0),
  loaded_hourly_cost_cents bigint check (loaded_hourly_cost_cents is null or loaded_hourly_cost_cents >= 0),
  inputs text,
  outputs text,
  systems text[] not null default '{}',
  exceptions text,
  risk_notes text,
  judgment_level integer check (judgment_level between 1 and 5),
  error_consequence_notes text,
  classification text references ref_process_classifications(code),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_processes_audit on processes(audit_id);

-- Append-only: each re-score inserts a new row; the latest row is current.
create table process_scores (
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
  scored_by uuid references app_users(id),
  created_at timestamptz not null default now()
);
create index idx_process_scores_process on process_scores(process_id, created_at desc);

create table agentic_opportunities (
  id uuid primary key default gen_random_uuid(),
  process_id uuid not null references processes(id) on delete cascade,
  proposed_responsibility text not null,
  expected_benefit text,
  risk_level text check (risk_level in ('LOW','MEDIUM','HIGH')),
  difficulty_level text check (difficulty_level in ('LOW','MEDIUM','HIGH')),
  priority text check (priority in ('P1','P2','P3')),
  roi_scenario_id uuid,
  recommended_for_pilot boolean not null default false,
  regulated_boundary_ack boolean not null default false,
  created_at timestamptz not null default now()
);
create index idx_agentic_opps_process on agentic_opportunities(process_id);

-- Append-only versions: editing assumptions creates version n+1 sharing scenario_key.
create table roi_scenarios (
  id uuid primary key default gen_random_uuid(),
  scenario_key uuid not null,
  version integer not null,
  audit_id uuid not null references audits(id) on delete cascade,
  process_id uuid references processes(id) on delete set null,
  name text not null,
  model_version text not null,
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  assumptions jsonb not null,
  monthly_value_low_cents bigint not null,
  monthly_value_high_cents bigint not null,
  annual_value_low_cents bigint not null,
  annual_value_high_cents bigint not null,
  implementation_cost_cents bigint not null,
  payback_months_low numeric,
  payback_months_high numeric,
  roi_low numeric,
  roi_high numeric,
  created_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  unique (scenario_key, version)
);
create index idx_roi_audit on roi_scenarios(audit_id);

alter table agentic_opportunities
  add constraint fk_agentic_opps_roi foreign key (roi_scenario_id) references roi_scenarios(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Proposals, deployments, delivery
-- ---------------------------------------------------------------------------
create table proposals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  opportunity_id uuid references opportunities(id) on delete set null,
  audit_id uuid references audits(id) on delete set null,
  agentic_opportunity_id uuid references agentic_opportunities(id) on delete set null,
  proposal_type text not null check (proposal_type in ('PILOT','DEPLOYMENT','RETAINER','SMB_STARTER')),
  title text not null,
  scope_summary text,
  amount_cents bigint not null check (amount_cents >= 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  status text not null check (status in ('DRAFT','SENT','ACCEPTED','REJECTED','WITHDRAWN')),
  sent_at timestamptz,
  decision_at timestamptz,
  created_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_proposals_company on proposals(company_id);
create index idx_proposals_opportunity on proposals(opportunity_id);

create table deployments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  proposal_id uuid unique references proposals(id) on delete set null,
  name text not null,
  status text not null check (status in ('PLANNED','BUILD','QA','LAUNCHED','MONITORING','COMPLETED','PAUSED','CANCELLED')),
  scope_included text,
  scope_excluded text,
  integrations text,
  start_date date,
  end_date date,
  launch_date date,
  launch_version text,
  monitoring_until date,
  owner_user_id uuid references app_users(id),
  reusable_components integer not null default 0 check (reusable_components >= 0),
  total_components integer not null default 0 check (total_components >= 0),
  reusable_assets_notes text,
  -- Case-study block
  before_narrative text,
  intervention_summary text,
  after_narrative text,
  lessons text,
  client_approval_status text not null default 'NOT_REQUESTED' check (client_approval_status in ('NOT_REQUESTED','PENDING','APPROVED','DENIED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reusable_le_total check (reusable_components <= total_components)
);
create index idx_deployments_company on deployments(company_id);
create index idx_deployments_owner on deployments(owner_user_id);

create table deployment_effort_entries (
  id uuid primary key default gen_random_uuid(),
  deployment_id uuid not null references deployments(id) on delete cascade,
  work_date date not null,
  hours numeric not null default 0 check (hours >= 0),
  direct_cost_cents bigint not null default 0 check (direct_cost_cents >= 0),
  description text,
  user_id uuid references app_users(id),
  created_at timestamptz not null default now()
);
create index idx_effort_deployment on deployment_effort_entries(deployment_id);

create table agent_roles (
  id uuid primary key default gen_random_uuid(),
  deployment_id uuid not null references deployments(id) on delete cascade,
  name text not null,
  responsibility text not null,
  allowed_actions text,
  prohibited_actions text,
  approval_requirements text,
  escalation_owner text,
  exception_handling text,
  tools text[] not null default '{}',
  access_method text,
  logging_monitoring text,
  rollback_procedure text,
  owner_name text,
  -- Provider abstraction: no agent vendor is part of the business model.
  provider text,
  provider_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_agent_roles_deployment on agent_roles(deployment_id);

create table qa_items (
  id uuid primary key default gen_random_uuid(),
  deployment_id uuid not null references deployments(id) on delete cascade,
  description text not null,
  status text not null default 'PENDING' check (status in ('PENDING','PASSED','FAILED')),
  evidence_url text,
  rollback_ready boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_qa_deployment on qa_items(deployment_id);

create table kpi_measurements (
  id uuid primary key default gen_random_uuid(),
  deployment_id uuid not null references deployments(id) on delete cascade,
  metric_key text not null,
  unit text not null,
  measurement_type text not null check (measurement_type in ('BASELINE','TARGET','RESULT')),
  value numeric not null,
  window_start date,
  window_end date,
  benefit_monthly_cents bigint check (benefit_monthly_cents is null or benefit_monthly_cents >= 0),
  notes text,
  created_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  constraint window_order check (window_start is null or window_end is null or window_start <= window_end),
  constraint baseline_result_need_window check (measurement_type = 'TARGET' or (window_start is not null and window_end is not null))
);
create index idx_kpi_deployment on kpi_measurements(deployment_id);

create table retainers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  proposal_id uuid unique references proposals(id) on delete set null,
  mrr_cents bigint not null check (mrr_cents >= 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  start_date date not null,
  end_date date,
  status text not null check (status in ('ACTIVE','PAUSED','CANCELLED')),
  services text,
  created_at timestamptz not null default now()
);
create index idx_retainers_company on retainers(company_id);

-- ---------------------------------------------------------------------------
-- Audit trail
-- ---------------------------------------------------------------------------
create table audit_log (
  id bigserial primary key,
  actor_user_id uuid references app_users(id),
  actor_label text,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);
create index idx_audit_log_entity on audit_log(entity_type, entity_id);
