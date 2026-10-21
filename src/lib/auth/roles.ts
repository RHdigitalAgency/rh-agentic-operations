export const ROLES = [
  "ADMIN_MANAGER",
  "SALES_REP",
  "DELIVERY",
  "AUDITOR_ANALYST",
  "EXTERNAL_REP",
  "READ_ONLY_EXECUTIVE",
] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN_MANAGER: "Admin / Manager",
  SALES_REP: "Sales Rep",
  DELIVERY: "Delivery",
  AUDITOR_ANALYST: "Analyst / Auditor",
  EXTERNAL_REP: "Partner / External Rep",
  READ_ONLY_EXECUTIVE: "Read-only Executive",
};

export type Capability =
  | "crm.read" // companies, contacts, opportunities, activities (within record scope)
  | "crm.write" // create/edit companies, contacts, opportunities, fit calls, stage moves
  | "activity.write"
  | "referral.submit" // partner referral intake with restricted fields
  | "audit.read"
  | "audit.sell" // offer audit, confirm payment
  | "audit.write" // discovery, processes, scoring, ROI, agentic opportunities, audit status
  | "proposal.read"
  | "proposal.write"
  | "delivery.read"
  | "delivery.write"
  | "financials.read" // margin, delivery cost, revenue/MRR aggregates
  | "dashboard.read"
  | "export"
  | "settings.manage";

// Managers create leads directly; the partner referral surface is for external reps only.
const ALL: Capability[] = [
  "crm.read", "crm.write", "activity.write", "audit.read", "audit.sell", "audit.write",
  "proposal.read", "proposal.write", "delivery.read", "delivery.write", "financials.read", "dashboard.read",
  "export", "settings.manage",
];

/** Role -> capability matrix (PDR §14). Enforced in the service layer, not only in the UI. */
export const ROLE_CAPABILITIES: Record<Role, ReadonlySet<Capability>> = {
  ADMIN_MANAGER: new Set(ALL),
  SALES_REP: new Set<Capability>([
    "crm.read", "crm.write", "activity.write", "audit.read", "audit.sell",
    "proposal.read", "proposal.write", "delivery.read", "dashboard.read",
  ]),
  DELIVERY: new Set<Capability>([
    "crm.read", "activity.write", "audit.read", "proposal.read", "delivery.read", "delivery.write", "dashboard.read",
  ]),
  AUDITOR_ANALYST: new Set<Capability>([
    "crm.read", "audit.read", "audit.write", "proposal.read", "delivery.read", "dashboard.read",
  ]),
  EXTERNAL_REP: new Set<Capability>(["referral.submit"]),
  READ_ONLY_EXECUTIVE: new Set<Capability>([
    "crm.read", "audit.read", "proposal.read", "delivery.read", "financials.read", "dashboard.read",
  ]),
};

/**
 * Record scope: which companies (and every record beneath them) a role can see.
 *  ALL        - every record
 *  OWNED      - companies the user owns, or where the user owns an opportunity (sales)
 *  ASSIGNED   - companies with a deployment the user owns (delivery)
 *  ATTRIBUTED - only opportunities the user owns or is attributed to, with restricted fields (partner)
 */
export type RecordScope = "ALL" | "OWNED" | "ASSIGNED" | "ATTRIBUTED";
export const ROLE_SCOPE: Record<Role, RecordScope> = {
  ADMIN_MANAGER: "ALL",
  SALES_REP: "OWNED",
  DELIVERY: "ASSIGNED",
  AUDITOR_ANALYST: "ALL",
  EXTERNAL_REP: "ATTRIBUTED",
  READ_ONLY_EXECUTIVE: "ALL",
};
