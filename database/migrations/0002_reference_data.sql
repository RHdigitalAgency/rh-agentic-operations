-- Deterministic reference data (TASK-004). Idempotent.

insert into pipeline_stages (code, name, sort_order, exit_condition, is_won, is_closed) values
  ('NEW_LEAD',          'New Lead',                 1,  'Owner assigned and next action defined', false, false),
  ('CONTACTED',         'Contacted',                2,  'First outreach completed', false, false),
  ('FIT_CALL_BOOKED',   'Fit Call Booked',          3,  'Meeting scheduled', false, false),
  ('FIT_QUALIFIED',     'Fit Qualified',            4,  'Audit recommended and commercial fit confirmed', false, false),
  ('AUDIT_OFFERED',     'Audit Offered',            5,  'Price/terms presented', false, false),
  ('AUDIT_PAID',        'Audit Paid',               6,  'Payment confirmed', false, false),
  ('AUDIT_IN_PROGRESS', 'Audit In Progress',        7,  'Discovery and mapping started', false, false),
  ('AUDIT_PRESENTED',   'Audit Presented',          8,  'Client received findings', false, false),
  ('PROPOSAL_SENT',     'Proposal Sent',            9,  'Pilot/deployment/retainer proposal delivered', false, false),
  ('WON_DEPLOYMENT',    'Won - Pilot / Deployment', 10, 'Implementation contracted', true, true),
  ('WON_RETAINER',      'Won - Retainer',           11, 'Recurring optimization active', true, true),
  ('LOST_NURTURE',      'Lost / Nurture',           12, 'Loss reason mandatory or nurture date defined', false, true)
on conflict (code) do nothing;

insert into ref_verticals (code, name, priority, regulated) values
  ('CONTRACTORS',  'Contractors / Home Services', 1, false),
  ('BEAUTY',       'Beauty / Salons',             2, false),
  ('LEGAL_ADMIN',  'Legal Admin',                 3, true),
  ('DENTAL_ADMIN', 'Dental Admin',                4, true),
  ('OTHER',        'Other',                       null, false)
on conflict (code) do nothing;

insert into ref_sources (code, name) values
  ('instagram_organic', 'Instagram - organic'),
  ('instagram_ads',     'Instagram - ads'),
  ('website',           'Website / landing page'),
  ('outbound',          'Outbound'),
  ('referral',          'Referral'),
  ('partner',           'Partner'),
  ('event',             'Event / networking'),
  ('other',             'Other')
on conflict (code) do nothing;

insert into ref_loss_reasons (code, name) values
  ('NO_BUDGET',        'No budget'),
  ('NO_FIT',           'Not a fit (volume / maturity)'),
  ('NO_RESPONSE',      'No response'),
  ('TIMING',           'Bad timing'),
  ('CHOSE_COMPETITOR', 'Chose competitor / DIY'),
  ('PRICE',            'Price objection'),
  ('NO_DECISION',      'No decision / stalled'),
  ('OTHER',            'Other')
on conflict (code) do nothing;

insert into ref_process_classifications (code, name, description) values
  ('HUMAN_ONLY',     'Human only',      'Professional judgment or relationship work that stays with a person'),
  ('AUTOMATE',       'Automate',        'Deterministic steps better served by conventional software/automation'),
  ('AGENT_READY',    'Agent-ready',     'Repeatable operational work an agent can absorb with defined controls'),
  ('REDESIGN_FIRST', 'Redesign first',  'Process must be simplified or clarified before delegation')
on conflict (code) do nothing;

-- Default scoring weights v1 (sum = 100). Configurable via Settings; new versions are appended.
insert into scoring_weight_sets (version, weights, active, notes) values
  ('v1', '{"economic_impact":20,"frequency_volume":10,"repetitiveness":10,"data_availability":10,"rule_clarity":10,"human_judgment_required":10,"error_consequence":10,"implementation_difficulty":10,"time_to_value":10}'::jsonb, true,
   'Initial hypothesis weights. Tune only after real deployment outcomes.')
on conflict (version) do nothing;

insert into app_settings (key, value) values
  ('internal_hourly_cost_cents', '4000'::jsonb),
  ('default_lead_owner_user_id', 'null'::jsonb)
on conflict (key) do nothing;
