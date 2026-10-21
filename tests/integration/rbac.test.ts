import { beforeAll, describe, expect, it } from "vitest";
import { setupTestEnv, GOOD_SCORES, type TestEnv } from "../helpers";
import {
  createLead, getCompany360, getOpportunity, listCompanies, listMyReferrals, listOpportunities, search, submitReferral, transitionStage, updateOpportunity,
} from "@/server/crm";
import { addProcess, createAgenticOpportunity, listAudits, offerAudit, confirmAuditPayment, scoreProcess, startAudit } from "@/server/audits";
import { createProposal, sendProposal, acceptProposal } from "@/server/proposals";
import { addAgentRole, addEffortEntry, getDeployment, listDeployments } from "@/server/deployments";
import { getDashboard } from "@/server/analytics";
import { exportCsv } from "@/server/exports";
import { createUser, listUsers } from "@/server/admin";
import { authenticate, createSession, getSessionUser } from "@/lib/auth/session";
import { hashPassword } from "@/lib/auth/password";

describe("RBAC is enforced at the service/data layer", () => {
  let env: TestEnv;
  let salesOpp: string;
  let salesCompany: string;
  let deploymentId: string;

  beforeAll(async () => {
    env = await setupTestEnv();
    salesOpp = await createLead(env.as("sales"), { company_name: "Rep One Plumbing", vertical: "CONTRACTORS", contact_name: "Pia", email: "pia@example.com", source: "outbound", next_action: "Call", estimated_value_cents: 300000 });
    salesCompany = (await getOpportunity(env.as("sales"), salesOpp)).company_id;
  });

  it("all six P0 roles exist", async () => {
    const roles = await env.db.query<{ role: string }>("select distinct role from app_users order by role");
    expect(roles.map((r) => r.role)).toEqual(["ADMIN_MANAGER", "AUDITOR_ANALYST", "DELIVERY", "EXTERNAL_REP", "READ_ONLY_EXECUTIVE", "SALES_REP"]);
  });

  it("sales reps only retrieve their own accounts, even by direct id", async () => {
    await expect(getOpportunity(env.as("sales2"), salesOpp)).rejects.toThrow(/not found/);
    await expect(getCompany360(env.as("sales2"), salesCompany)).rejects.toThrow(/not found/);
    expect(await listOpportunities(env.as("sales2"))).toHaveLength(0);
    expect((await search(env.as("sales2"), "Rep One")).companies).toHaveLength(0);
    expect(await listOpportunities(env.as("sales"))).toHaveLength(1);
    await expect(updateOpportunity(env.as("sales2"), salesOpp, { next_action: "steal" })).rejects.toThrow(/not found/);
  });

  it("sales reps cannot assign leads to someone else", async () => {
    await expect(createLead(env.as("sales"), { company_name: "X", owner_user_id: env.users.sales2.id })).rejects.toThrow(/themselves/);
  });

  it("external reps see only attributed opportunities with restricted fields and no client/delivery data", async () => {
    const partner = env.as("partner");
    await expect(listOpportunities(partner)).rejects.toThrow(/permission/);
    await expect(listCompanies(partner)).rejects.toThrow(/permission/);
    await expect(getOpportunity(partner, salesOpp)).rejects.toThrow(/permission/);
    await expect(listAudits(partner)).rejects.toThrow(/permission/);
    await expect(listDeployments(partner)).rejects.toThrow(/permission/);
    await expect(getDashboard(partner)).rejects.toThrow(/permission/);
    const ref = await submitReferral(partner, { company_name: "Referred Salon", vertical: "BEAUTY", contact_name: "Lola", notes: "Owner wants fewer no-shows" });
    const mine = await listMyReferrals(partner);
    expect(mine).toHaveLength(1);
    expect(mine[0].id).toBe(ref);
    expect(Object.keys(mine[0]).sort()).toEqual(["company_name", "created_at", "id", "stage", "stage_changed_at"]);
    // The referral keeps partner attribution
    const opp = await getOpportunity(env.as("admin"), ref);
    expect(opp).toMatchObject({ source: "partner", referrer_user_id: env.users.partner.id });
  });

  it("read-only executives cannot write but can see financial dashboard", async () => {
    const exec = env.as("exec");
    await expect(createLead(exec, { company_name: "Nope" })).rejects.toThrow(/permission/);
    await expect(transitionStage(exec, salesOpp, "CONTACTED")).rejects.toThrow(/permission/);
    expect((await getOpportunity(exec, salesOpp)).id).toBe(salesOpp);
    const dash = await getDashboard(exec);
    expect(dash.financialsVisible).toBe(true);
  });

  it("analysts work audits but cannot move the sales pipeline", async () => {
    await expect(transitionStage(env.as("analyst"), salesOpp, "CONTACTED")).rejects.toThrow(/permission/);
    await expect(offerAudit(env.as("analyst"), salesOpp, { price_cents: 100000 })).rejects.toThrow(/permission/);
  });

  it("sales cannot score processes; sales dashboard hides margin and cost", async () => {
    const sales = env.as("sales");
    await transitionStage(sales, salesOpp, "CONTACTED");
    await env.db.query("update opportunities set stage = 'FIT_QUALIFIED' where id = $1", [salesOpp]); // shortcut for this RBAC test
    const auditId = await offerAudit(sales, salesOpp, { price_cents: 100000 });
    await confirmAuditPayment(sales, auditId, {});
    await startAudit(env.as("analyst"), auditId);
    const proc = await addProcess(env.as("analyst"), auditId, { name: "Dispatch", classification: "AGENT_READY" });
    await expect(scoreProcess(sales, proc, GOOD_SCORES)).rejects.toThrow(/permission/);
    await scoreProcess(env.as("analyst"), proc, GOOD_SCORES);
    await expect(createAgenticOpportunity(sales, proc, { proposed_responsibility: "x" })).rejects.toThrow(/permission/);
    const dash = await getDashboard(sales);
    expect(dash.financialsVisible).toBe(false);
    expect(dash.metrics.grossMargin.value).toBeNull();
    expect(dash.metrics.mrrCents.value).toBeNull();
  });

  it("delivery sees only assigned clients and edits only owned deployments", async () => {
    await expect(getCompany360(env.as("delivery"), salesCompany)).rejects.toThrow(/not found/);
    const p = await createProposal(env.as("sales"), { opportunity_id: salesOpp, proposal_type: "DEPLOYMENT", title: "Dispatch deployment", amount_cents: 800000 });
    await env.db.query("update opportunities set stage = 'AUDIT_PRESENTED' where id = $1", [salesOpp]);
    await sendProposal(env.as("sales"), p);
    deploymentId = (await acceptProposal(env.as("sales"), p, { delivery_owner_user_id: env.users.delivery.id })).deploymentId!;
    expect((await getCompany360(env.as("delivery"), salesCompany)).company.id).toBe(salesCompany);
    expect((await getDeployment(env.as("delivery"), deploymentId)).id).toBe(deploymentId);
    await expect(getDeployment(env.as("delivery2"), deploymentId)).rejects.toThrow(/not found/);
    await expect(addEffortEntry(env.as("delivery2"), deploymentId, { hours: 2 })).rejects.toThrow(/not found/);
    await expect(addEffortEntry(env.as("sales"), deploymentId, { hours: 2 })).rejects.toThrow(/permission/);
    await expect(addAgentRole(env.as("analyst"), deploymentId, { name: "x", responsibility: "y" })).rejects.toThrow(/permission/);
    await addEffortEntry(env.as("delivery"), deploymentId, { hours: 2 });
  });

  it("exports and user administration are manager-only", async () => {
    for (const role of ["sales", "delivery", "analyst", "exec", "partner"]) {
      await expect(exportCsv(env.as(role), "leads")).rejects.toThrow(/permission/);
      await expect(listUsers(env.as(role))).rejects.toThrow(/permission/);
    }
    const csv = await exportCsv(env.as("admin"), "leads");
    expect(csv.split("\r\n")[0]).toContain("source,campaign,content_id,keyword");
  });

  it("authentication: valid sign-in, session lookup, inactive users rejected", async () => {
    const id = await createUser(env.as("admin"), { email: "new.rep@test.example.com", full_name: "New Rep", role: "SALES_REP", password: "correct-horse-battery" });
    expect(await authenticate(env.db, "new.rep@test.example.com", "wrong-password-x")).toBeNull();
    const user = await authenticate(env.db, "NEW.REP@test.example.com", "correct-horse-battery");
    expect(user?.id).toBe(id);
    const { token } = await createSession(env.db, id);
    expect((await getSessionUser(env.db, token))?.role).toBe("SALES_REP");
    expect(await getSessionUser(env.db, "forged-token")).toBeNull();
    await env.db.query("update app_users set active = false where id = $1", [id]);
    expect(await getSessionUser(env.db, token)).toBeNull();
    expect(await authenticate(env.db, "new.rep@test.example.com", "correct-horse-battery")).toBeNull();
    expect(() => hashPassword("short")).toThrow();
  });
});
