-- Business rules the services check are also enforced by the database, so concurrent requests cannot break them.

-- One active audit credit per audit (Strategic Plan §4).
create unique index uq_proposals_active_audit_credit on proposals(audit_id)
  where audit_credit_cents > 0 and status in ('DRAFT', 'SENT', 'ACCEPTED');

-- One active proposal per recommended pilot (agentic opportunity).
create unique index uq_proposals_active_agentic_opportunity on proposals(agentic_opportunity_id)
  where agentic_opportunity_id is not null and status in ('DRAFT', 'SENT', 'ACCEPTED');

-- One non-cancelled audit per opportunity.
create unique index uq_audits_active_per_opportunity on audits(opportunity_id)
  where opportunity_id is not null and status <> 'CANCELLED';

-- Lookups by audit (credit eligibility, proposals created from an audit).
create index idx_proposals_audit on proposals(audit_id);
