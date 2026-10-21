"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { authenticate, createSession, deleteSession, SESSION_COOKIE } from "@/lib/auth/session";
import { formObject, run } from "./run";
import * as crm from "@/server/crm";
import * as audits from "@/server/audits";
import * as proposals from "@/server/proposals";
import * as deployments from "@/server/deployments";
import * as admin from "@/server/admin";
import { createAuditCheckout } from "@/server/stripe";
import { SCORE_DIMENSIONS } from "@/domain/scoring";
import { parseMoneyToCents } from "@/domain/money";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "");
const back = (fd: FormData, fallback: string) => {
  const b = s(fd, "_back");
  return b.startsWith("/") && !b.startsWith("//") ? b : fallback;
};

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
export async function loginAction(fd: FormData) {
  const db = await getDb();
  const user = await authenticate(db, s(fd, "email"), s(fd, "password"));
  if (!user) redirect("/login?error=Invalid%20email%20or%20password");
  const { token, expiresAt } = await createSession(db, user.id);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
  redirect(user.role === "EXTERNAL_REP" ? "/referrals" : "/");
}

export async function logoutAction() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await deleteSession(await getDb(), token);
  jar.delete(SESSION_COOKIE);
  redirect("/login");
}

// ---------------------------------------------------------------------------
// CRM
// ---------------------------------------------------------------------------
export async function createLeadAction(fd: FormData) {
  await run("/leads/new", (ctx) => crm.createLead(ctx, formObject(fd)), { success: "Lead created", next: (id) => `/opportunities/${id}` });
}

export async function createCompanyAction(fd: FormData) {
  await run("/companies/new", (ctx) => crm.createCompany(ctx, formObject(fd)), { success: "Company created", next: (id) => `/companies/${id}` });
}

export async function updateCompanyAction(fd: FormData) {
  const id = s(fd, "id");
  await run(`/companies/${id}`, (ctx) => crm.updateCompany(ctx, id, formObject(fd)), { success: "Company updated" });
}

export async function createContactAction(fd: FormData) {
  const companyId = s(fd, "company_id");
  await run(back(fd, `/companies/${companyId}`), (ctx) => crm.createContact(ctx, companyId, formObject(fd)), { success: "Contact added" });
}

export async function updateOpportunityAction(fd: FormData) {
  const id = s(fd, "id");
  await run(`/opportunities/${id}`, (ctx) => crm.updateOpportunity(ctx, id, formObject(fd)), { success: "Opportunity updated" });
}

export async function transitionStageAction(fd: FormData) {
  const id = s(fd, "id");
  await run(back(fd, `/opportunities/${id}`), (ctx) =>
    crm.transitionStage(ctx, id, s(fd, "to"), { loss_reason: fd.get("loss_reason"), loss_notes: fd.get("loss_notes"), nurture_at: fd.get("nurture_at") }),
  { success: "Stage updated" });
}

export async function archiveOpportunityAction(fd: FormData) {
  const id = s(fd, "id");
  await run(`/opportunities/${id}`, (ctx) => crm.archiveOpportunity(ctx, id), { success: "Opportunity archived", next: () => "/pipeline" });
}

export async function scheduleFitCallAction(fd: FormData) {
  const id = s(fd, "opportunity_id");
  await run(`/opportunities/${id}`, (ctx) => crm.scheduleFitCall(ctx, id, formObject(fd)), { success: "Fit call scheduled" });
}

export async function completeFitCallAction(fd: FormData) {
  await run(back(fd, "/pipeline"), (ctx) => crm.completeFitCall(ctx, s(fd, "fit_call_id"), formObject(fd)), { success: "Fit call recorded" });
}

export async function addActivityAction(fd: FormData) {
  await run(back(fd, "/pipeline"), (ctx) => crm.addActivity(ctx, formObject(fd)), { success: "Activity logged" });
}

export async function submitReferralAction(fd: FormData) {
  await run("/referrals", (ctx) => crm.submitReferral(ctx, formObject(fd)), { success: "Referral submitted — thank you" });
}

// ---------------------------------------------------------------------------
// Audits
// ---------------------------------------------------------------------------
export async function offerAuditAction(fd: FormData) {
  const oppId = s(fd, "opportunity_id");
  await run(`/opportunities/${oppId}`, (ctx) => audits.offerAudit(ctx, oppId, formObject(fd)), { success: "Audit offered", next: (id) => `/audits/${id}` });
}

export async function confirmAuditPaymentAction(fd: FormData) {
  const id = s(fd, "id");
  await run(`/audits/${id}`, (ctx) => audits.confirmAuditPayment(ctx, id, formObject(fd)), { success: "Payment confirmed" });
}

export async function createAuditCheckoutAction(fd: FormData) {
  const id = s(fd, "id");
  await run(`/audits/${id}`, (ctx) => createAuditCheckout(ctx, id), { success: "Stripe payment link ready — copy it and send it to the client" });
}

export async function startAuditAction(fd: FormData) {
  const id = s(fd, "id");
  await run(`/audits/${id}`, (ctx) => audits.startAudit(ctx, id), { success: "Audit started" });
}

export async function presentAuditAction(fd: FormData) {
  const id = s(fd, "id");
  await run(`/audits/${id}`, (ctx) => audits.presentAudit(ctx, id, formObject(fd)), { success: "Audit marked as presented" });
}

export async function cancelAuditAction(fd: FormData) {
  const id = s(fd, "id");
  await run(`/audits/${id}`, (ctx) => audits.cancelAudit(ctx, id), { success: "Audit cancelled" });
}

export async function updateAuditDiscoveryAction(fd: FormData) {
  const id = s(fd, "id");
  await run(`/audits/${id}`, (ctx) => audits.updateAuditDiscovery(ctx, id, formObject(fd)), { success: "Discovery saved" });
}

export async function addProcessAction(fd: FormData) {
  const auditId = s(fd, "audit_id");
  await run(`/audits/${auditId}`, (ctx) => audits.addProcess(ctx, auditId, formObject(fd)), { success: "Process added", next: (pid) => `/audits/${auditId}/processes/${pid}` });
}

export async function updateProcessAction(fd: FormData) {
  const id = s(fd, "id");
  await run(back(fd, "/audits"), (ctx) => audits.updateProcess(ctx, id, formObject(fd)), { success: "Process saved" });
}

export async function scoreProcessAction(fd: FormData) {
  const id = s(fd, "id");
  const raw = Object.fromEntries(SCORE_DIMENSIONS.map((d) => [d.key, fd.get(d.key)]));
  await run(back(fd, "/audits"), (ctx) => audits.scoreProcess(ctx, id, raw), { success: "Score saved" });
}

const ROI_MONEY = ["loaded_hourly_cost", "leakage_monthly", "quality_cost_monthly", "platform_cost_monthly", "rh_implementation_fee", "client_setup_cost"];
const ROI_NUM = [
  "labor_hours_per_month", "people_involved", "capacity_recovered_pct_low", "capacity_recovered_pct_high", "leakage_recovered_pct_low",
  "leakage_recovered_pct_high", "quality_reduction_pct_low", "quality_reduction_pct_high", "supervision_hours_per_month",
];

export async function saveRoiAction(fd: FormData) {
  const auditId = s(fd, "audit_id");
  await run(`/audits/${auditId}`, async (ctx) => {
    const assumptions: Record<string, unknown> = {};
    for (const k of ROI_MONEY) assumptions[`${k}_cents`] = parseMoneyToCents(s(fd, k), k.replace(/_/g, " ")) ?? 0;
    for (const k of ROI_NUM) {
      const v = s(fd, k).trim();
      if (v !== "") assumptions[k] = Number(v);
      else if (k !== "people_involved") assumptions[k] = 0;
    }
    const notes = s(fd, "notes").trim();
    if (notes) assumptions.notes = notes;
    return audits.saveRoiScenario(ctx, auditId, { scenario_key: fd.get("scenario_key"), name: fd.get("name"), process_id: fd.get("process_id"), assumptions });
  }, { success: "ROI scenario saved (new version)" });
}

export async function createAgenticOpportunityAction(fd: FormData) {
  const processId = s(fd, "process_id");
  await run(back(fd, "/audits"), (ctx) => audits.createAgenticOpportunity(ctx, processId, formObject(fd)), { success: "Agentic opportunity added" });
}

export async function setRecommendedPilotAction(fd: FormData) {
  await run(back(fd, "/audits"), (ctx) => audits.setRecommendedPilot(ctx, s(fd, "id")), { success: "Recommended pilot selected" });
}

// ---------------------------------------------------------------------------
// Proposals
// ---------------------------------------------------------------------------
export async function createProposalFromPilotAction(fd: FormData) {
  await run(back(fd, "/proposals"), (ctx) => proposals.createProposalFromAgenticOpportunity(ctx, s(fd, "agentic_opportunity_id"), formObject(fd)), {
    success: "Proposal created from recommended pilot",
    next: (id) => `/proposals/${id}`,
  });
}

export async function createProposalAction(fd: FormData) {
  await run(back(fd, "/proposals"), (ctx) => proposals.createProposal(ctx, formObject(fd)), { success: "Proposal created", next: (id) => `/proposals/${id}` });
}

export async function updateProposalAction(fd: FormData) {
  const id = s(fd, "id");
  await run(`/proposals/${id}`, (ctx) => proposals.updateProposalDraft(ctx, id, formObject(fd)), { success: "Proposal updated" });
}

export async function proposalStatusAction(fd: FormData) {
  const id = s(fd, "id");
  const op = s(fd, "op");
  await run(`/proposals/${id}`, async (ctx) => {
    if (op === "send") return proposals.sendProposal(ctx, id);
    if (op === "reject") return proposals.rejectProposal(ctx, id);
    if (op === "withdraw") return proposals.withdrawProposal(ctx, id);
    const r = await proposals.acceptProposal(ctx, id, formObject(fd));
    return r;
  }, {
    success: op === "accept" ? "Proposal accepted" : "Proposal updated",
    next: (r) => (r && typeof r === "object" && "deploymentId" in r && r.deploymentId ? `/deployments/${r.deploymentId}` : `/proposals/${id}`),
  });
}

export async function retainerStatusAction(fd: FormData) {
  await run(back(fd, "/proposals"), (ctx) => proposals.setRetainerStatus(ctx, s(fd, "id"), s(fd, "status")), { success: "Retainer updated" });
}

// ---------------------------------------------------------------------------
// Deployments
// ---------------------------------------------------------------------------
export async function updateDeploymentAction(fd: FormData) {
  const id = s(fd, "id");
  await run(back(fd, `/deployments/${id}`), (ctx) => deployments.updateDeployment(ctx, id, formObject(fd)), { success: "Deployment saved" });
}

export async function deploymentStatusAction(fd: FormData) {
  const id = s(fd, "id");
  await run(`/deployments/${id}`, (ctx) => deployments.changeDeploymentStatus(ctx, id, s(fd, "status")), { success: "Status updated" });
}

export async function saveAgentRoleAction(fd: FormData) {
  const deploymentId = s(fd, "deployment_id");
  const roleId = s(fd, "role_id");
  await run(`/deployments/${deploymentId}`, async (ctx) => {
    if (roleId) await deployments.updateAgentRole(ctx, roleId, formObject(fd));
    else await deployments.addAgentRole(ctx, deploymentId, formObject(fd));
  }, { success: "Agent role saved" });
}

export async function addQaItemAction(fd: FormData) {
  const deploymentId = s(fd, "deployment_id");
  await run(`/deployments/${deploymentId}`, (ctx) => deployments.addQaItem(ctx, deploymentId, formObject(fd)), { success: "QA item added" });
}

export async function updateQaItemAction(fd: FormData) {
  const deploymentId = s(fd, "deployment_id");
  await run(`/deployments/${deploymentId}`, (ctx) => deployments.updateQaItem(ctx, s(fd, "id"), formObject(fd)), { success: "QA item updated" });
}

export async function addEffortAction(fd: FormData) {
  const deploymentId = s(fd, "deployment_id");
  await run(`/deployments/${deploymentId}`, (ctx) => deployments.addEffortEntry(ctx, deploymentId, formObject(fd)), { success: "Effort logged" });
}

export async function addKpiAction(fd: FormData) {
  const deploymentId = s(fd, "deployment_id");
  await run(`/deployments/${deploymentId}`, (ctx) => deployments.addKpiMeasurement(ctx, deploymentId, formObject(fd)), { success: "Measurement saved" });
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
export async function createUserAction(fd: FormData) {
  await run("/settings", (ctx) => admin.createUser(ctx, formObject(fd)), { success: "User created" });
}

export async function updateUserAction(fd: FormData) {
  await run("/settings", (ctx) => admin.updateUser(ctx, s(fd, "id"), formObject(fd)), { success: "User updated" });
}

export async function resetPasswordAction(fd: FormData) {
  await run("/settings", (ctx) => admin.resetPassword(ctx, s(fd, "id"), s(fd, "password")), { success: "Password reset" });
}

export async function createWeightSetAction(fd: FormData) {
  await run("/settings", (ctx) => admin.createWeightSet(ctx, formObject(fd)), { success: "New scoring weights active" });
}

export async function updateSettingsAction(fd: FormData) {
  await run("/settings", (ctx) => admin.updateSettings(ctx, formObject(fd)), { success: "Settings saved" });
}
