import { beforeAll, describe, expect, it } from "vitest";
import { setupTestEnv, type TestEnv } from "../helpers";
import { hashPassword } from "@/lib/auth/password";
import { LOCKOUT_MAX_FAILURES, signIn } from "@/lib/auth/session";
import { changeOwnPassword, resetPassword } from "@/server/admin";
import { createLead } from "@/server/crm";
import { confirmAuditPayment, offerAudit } from "@/server/audits";
import { acceptProposal, auditCreditEligibility, createProposal, getProposal, sendProposal } from "@/server/proposals";
import { addEffortEntry, addKpiMeasurement, deleteEffortEntry, deleteKpiMeasurement, getDeploymentWorkspace, updateEffortEntry } from "@/server/deployments";
import { getDashboard } from "@/server/analytics";

describe("account security", () => {
  let env: TestEnv;
  beforeAll(async () => {
    env = await setupTestEnv();
    await env.db.query("update app_users set password_hash = $2 where id = $1", [env.users.sales.id, hashPassword("original-password-1")]);
  });

  it("locks an account after repeated failures, and an admin reset lifts the lock", async () => {
    for (let i = 0; i < LOCKOUT_MAX_FAILURES; i++) expect(await signIn(env.db, "sales@test.example.com", "wrong-password")).toEqual({ ok: false, reason: "invalid" });
    // Even the correct password is refused while locked.
    expect(await signIn(env.db, "sales@test.example.com", "original-password-1")).toEqual({ ok: false, reason: "locked" });
    await resetPassword(env.as("admin"), env.users.sales.id, "admin-set-password-2");
    const ok = await signIn(env.db, "SALES@test.example.com", "admin-set-password-2");
    expect(ok.ok).toBe(true);
  });

  it("lets users change their own password with the current one", async () => {
    const sales = env.as("sales");
    await expect(changeOwnPassword(sales, { current_password: "nope-nope-nope", new_password: "brand-new-pass-3", confirm_password: "brand-new-pass-3" })).rejects.toThrow(/Current password/);
    await expect(changeOwnPassword(sales, { current_password: "admin-set-password-2", new_password: "brand-new-pass-3", confirm_password: "different-pass-4" })).rejects.toThrow(/do not match/);
    await changeOwnPassword(sales, { current_password: "admin-set-password-2", new_password: "brand-new-pass-3", confirm_password: "brand-new-pass-3" });
    expect((await signIn(env.db, "sales@test.example.com", "brand-new-pass-3")).ok).toBe(true);
    expect((await signIn(env.db, "sales@test.example.com", "admin-set-password-2")).ok).toBe(false);
  });
});

describe("audit credit and editable delivery records", () => {
  let env: TestEnv;
  let oppId: string;
  let auditId: string;
  let deploymentId: string;

  beforeAll(async () => {
    env = await setupTestEnv();
    oppId = await createLead(env.as("sales"), { company_name: "Credit Test Co", source: "referral", next_action: "Call" });
    await env.db.query("update opportunities set stage = 'FIT_QUALIFIED' where id = $1", [oppId]);
    auditId = await offerAudit(env.as("sales"), oppId, { price_cents: 150000 });
  });

  it("is only available once the audit is paid, within 30 days, once per audit, and never on retainers", async () => {
    expect((await auditCreditEligibility(env.db, auditId)).eligible).toBe(false);
    await confirmAuditPayment(env.as("sales"), auditId, {});
    const e = await auditCreditEligibility(env.db, auditId);
    expect(e).toMatchObject({ eligible: true, creditCents: 150000, daysLeft: 30 });
    await expect(createProposal(env.as("sales"), { opportunity_id: oppId, audit_id: auditId, proposal_type: "RETAINER", title: "R", amount_cents: 100000, apply_audit_credit: "on" })).rejects.toThrow(/retainers/);
    await expect(createProposal(env.as("sales"), { opportunity_id: oppId, audit_id: auditId, proposal_type: "PILOT", title: "Tiny", amount_cents: 100000, apply_audit_credit: "on" })).rejects.toThrow(/exceed/);
    const p1 = await createProposal(env.as("sales"), { opportunity_id: oppId, audit_id: auditId, proposal_type: "PILOT", title: "Pilot", amount_cents: 450000, apply_audit_credit: "on" });
    expect((await getProposal(env.as("sales"), p1)).audit_credit_cents).toBe(150000);
    await expect(createProposal(env.as("sales"), { opportunity_id: oppId, audit_id: auditId, proposal_type: "DEPLOYMENT", title: "Second", amount_cents: 900000, apply_audit_credit: "on" })).rejects.toThrow(/already applied/);
  });

  it("refuses acceptance after the 30-day window, and counts net revenue once accepted in time", async () => {
    const [{ id: pilot }] = await env.db.query<{ id: string }>("select id from proposals where title = 'Pilot'");
    await env.db.query("update opportunities set stage = 'AUDIT_PRESENTED' where id = $1", [oppId]);
    await sendProposal(env.as("sales"), pilot);
    await env.db.query("update audits set paid_at = now() - interval '31 days' where id = $1", [auditId]);
    await expect(acceptProposal(env.as("sales"), pilot)).rejects.toThrow(/expired/);
    await env.db.query("update audits set paid_at = now() - interval '10 days' where id = $1", [auditId]);
    deploymentId = (await acceptProposal(env.as("sales"), pilot, { delivery_owner_user_id: env.users.delivery.id })).deploymentId!;
    const dash = await getDashboard(env.as("admin"), {});
    expect(dash.metrics.wonDeploymentRevenueCents.value).toBe(300000); // 4,500 - 1,500 credit
    expect((await getDeploymentWorkspace(env.as("delivery"), deploymentId)).financials!.revenueCents).toBe(300000);
  });

  it("lets the deployment owner correct and delete effort and KPI rows, with an audit trail", async () => {
    const delivery = env.as("delivery");
    const entry = await addEffortEntry(delivery, deploymentId, { hours: 10, direct_cost_cents: 5000 });
    await updateEffortEntry(delivery, entry, { hours: 12, direct_cost_cents: 5000, work_date: "2026-10-01" });
    let ws = await getDeploymentWorkspace(delivery, deploymentId);
    expect(Number(ws.deployment.hours)).toBe(12);
    await expect(updateEffortEntry(env.as("delivery2"), entry, { hours: 1 })).rejects.toThrow(/not found|owner/);
    await deleteEffortEntry(delivery, entry);
    const kpi = await addKpiMeasurement(delivery, deploymentId, { metric_key: "hours_saved", unit: "hours/month", measurement_type: "TARGET", value: 20 });
    await deleteKpiMeasurement(delivery, kpi);
    ws = await getDeploymentWorkspace(delivery, deploymentId);
    expect(Number(ws.deployment.hours)).toBe(0);
    expect(ws.kpis).toHaveLength(0);
    const trail = await env.db.query<{ entity_type: string; action: string }>("select entity_type, action from audit_log where entity_type in ('effort_entry','kpi_measurement')");
    expect(trail.map((t) => `${t.entity_type}:${t.action}`)).toEqual(expect.arrayContaining(["effort_entry:update", "effort_entry:delete", "kpi_measurement:delete"]));
  });
});

describe("faster lead entry", () => {
  it("links to an existing account by name instead of duplicating it, and names individuals after the contact", async () => {
    const env = await setupTestEnv();
    const sales = env.as("sales");
    const first = await createLead(sales, { company_name: "Coral Gables Dental", next_action: "Call", source: "outbound" });
    const second = await createLead(sales, { company_name: "  coral gables DENTAL ", next_action: "Call again", source: "referral" });
    const companies = await env.db.query<{ n: number }>("select count(*)::int as n from companies where lower(name) = 'coral gables dental'");
    expect(companies[0].n).toBe(1);
    const [a, b] = await env.db.query<{ company_id: string }>("select company_id from opportunities where id = any($1::uuid[])", [[first, second]]);
    expect(a.company_id).toBe(b.company_id);
    const solo = await createLead(sales, { contact_name: "Maria Lopez", instagram_handle: "@marialopez", next_action: "DM", source: "instagram_organic" });
    const [{ name }] = await env.db.query<{ name: string }>("select c.name from opportunities o join companies c on c.id = o.company_id where o.id = $1", [solo]);
    expect(name).toBe("Maria Lopez");
    await expect(createLead(sales, { next_action: "x", source: "outbound" })).rejects.toThrow(/company or a contact/);
  });
});
