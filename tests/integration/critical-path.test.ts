import { beforeAll, describe, expect, it } from "vitest";
import { setupTestEnv, GOOD_SCORES, ROI_ASSUMPTIONS, type TestEnv } from "../helpers";
import { ingestLead, parseLeadEvent } from "@/server/ingestion";
import { completeFitCall, getOpportunity, scheduleFitCall, transitionStage, updateOpportunity } from "@/server/crm";
import {
  addProcess, confirmAuditPayment, createAgenticOpportunity, getAuditWorkspace, getProcessScoreHistory, offerAudit, presentAudit,
  recomputeStoredScore, saveRoiScenario, scoreProcess, setRecommendedPilot, startAudit,
} from "@/server/audits";
import { acceptProposal, createProposal, createProposalFromAgenticOpportunity, getProposal, sendProposal } from "@/server/proposals";
import { addAgentRole, addEffortEntry, addKpiMeasurement, addQaItem, changeDeploymentStatus, getDeploymentWorkspace, REGULATED_PROHIBITED_TEMPLATE, updateQaItem } from "@/server/deployments";
import { getDashboard } from "@/server/analytics";

/**
 * TASK-023 critical path:
 * ingest lead -> qualify -> audit paid -> processes -> score -> ROI -> recommend pilot -> proposal -> won deployment
 * -> agent role/controls -> baseline/result KPI -> dashboard reflects revenue/margin/result.
 */
describe("critical path: Lead -> Fit Call -> Paid Audit -> Mapping -> Scoring -> ROI -> Proposal -> Deployment -> KPI", () => {
  let env: TestEnv;
  let oppId: string;
  let auditId: string;
  let agentReadyId: string;
  let humanOnlyId: string;
  let aoId: string;
  let proposalId: string;
  let deploymentId: string;
  const companiesBefore = async () => (await env.db.query<{ n: number }>("select count(*)::int as n from companies"))[0].n;

  beforeAll(async () => {
    env = await setupTestEnv();
  });

  it("ingests an attributed Instagram lead idempotently", async () => {
    const event = parseLeadEvent({
      external_event_id: "ig-comment-123",
      source: "instagram_organic",
      campaign: "agentic_operations",
      content_id: "reel_2026_10_20_01",
      keyword: "AGENTES",
      utm: { utm_medium: "social" },
      contact: { name: "Rita Roofer", instagram_handle: "@sunroof", email: null, phone: null },
      company: { name: "Sunshine Roofing", website: null },
      metadata: { comment: "AGENTES" },
    });
    const first = await ingestLead(env.db, event);
    const second = await ingestLead(env.db, event);
    expect(second).toEqual({ opportunityId: first.opportunityId, duplicate: true });
    oppId = first.opportunityId;
    const opp = await getOpportunity(env.as("admin"), oppId);
    expect(opp).toMatchObject({ stage: "NEW_LEAD", source: "instagram_organic", campaign: "agentic_operations", content_id: "reel_2026_10_20_01", keyword: "AGENTES" });
    expect(opp.utm).toEqual({ utm_medium: "social" });
  });

  it("assigns a rep and moves through contact and fit call to Fit Qualified", async () => {
    await updateOpportunity(env.as("admin"), oppId, { owner_user_id: env.users.sales.id, next_action: "DM back", next_action_at: new Date().toISOString(), estimated_value_cents: 500000 });
    const sales = env.as("sales");
    await transitionStage(sales, oppId, "CONTACTED");
    await expect(transitionStage(sales, oppId, "FIT_QUALIFIED")).rejects.toThrow(/Cannot move/);
    const fitCallId = await scheduleFitCall(sales, oppId, { scheduled_at: new Date(Date.now() + 86400000).toISOString() });
    expect((await getOpportunity(sales, oppId)).stage).toBe("FIT_CALL_BOOKED");
    await completeFitCall(sales, fitCallId, { outcome: "QUALIFIED", audit_recommended: "on", pain_summary: "Missed calls and slow estimate follow-up" });
    expect((await getOpportunity(sales, oppId)).stage).toBe("FIT_QUALIFIED");
  });

  it("sells the paid audit and confirms payment", async () => {
    const sales = env.as("sales");
    await expect(offerAudit(sales, oppId, { price_cents: 0 })).rejects.toThrow(/paid/);
    auditId = await offerAudit(sales, oppId, { price_cents: 150000, owner_user_id: env.users.analyst.id });
    expect((await getOpportunity(sales, oppId)).stage).toBe("AUDIT_OFFERED");
    await confirmAuditPayment(sales, auditId, { payment_reference: "manual-transfer-001" });
    expect((await getOpportunity(sales, oppId)).stage).toBe("AUDIT_PAID");
  });

  it("maps multiple classified processes and stores reproducible scores", async () => {
    const analyst = env.as("analyst");
    await startAudit(analyst, auditId);
    agentReadyId = await addProcess(analyst, auditId, {
      name: "Lead response & estimate follow-up", monthly_volume: 300, monthly_hours: 120, loaded_hourly_cost_cents: 2500, systems: "Jobber, Gmail",
      judgment_level: 2, classification: "AGENT_READY",
    });
    humanOnlyId = await addProcess(analyst, auditId, { name: "On-site roof inspection", judgment_level: 5, classification: "HUMAN_ONLY" });
    await scoreProcess(analyst, agentReadyId, GOOD_SCORES);
    await scoreProcess(analyst, humanOnlyId, { ...GOOD_SCORES, human_judgment_required: 5, error_consequence: 5 });
    const [stored] = await getProcessScoreHistory(analyst, agentReadyId);
    expect(stored.scoring_version).toBe("v1");
    expect(stored.economic_impact).toBe(5);
    expect(recomputeStoredScore(stored)).toBe(Number(stored.calculated_score));
    const ws = await getAuditWorkspace(analyst, auditId);
    expect(ws.processes).toHaveLength(2);
    expect(ws.processes.find((p) => p.id === humanOnlyId)!.riskFlags.length).toBe(2);
  });

  it("keeps ROI assumptions versioned and never overwrites history", async () => {
    const analyst = env.as("analyst");
    const v1 = await saveRoiScenario(analyst, auditId, { name: "Lead response pilot", process_id: agentReadyId, assumptions: ROI_ASSUMPTIONS });
    const v2 = await saveRoiScenario(analyst, auditId, { scenario_key: v1.scenarioKey, name: "Lead response pilot", process_id: agentReadyId, assumptions: { ...ROI_ASSUMPTIONS, leakage_recovered_pct_high: 50 } });
    expect(v2.version).toBe(2);
    const rows = await env.db.query<{ version: number; assumptions: Record<string, number> }>("select version, assumptions from roi_scenarios where scenario_key = $1 order by version", [v1.scenarioKey]);
    expect(rows.map((r) => r.assumptions.leakage_recovered_pct_high)).toEqual([40, 50]);
    const ws = await getAuditWorkspace(analyst, auditId);
    expect(ws.roiScenarios).toHaveLength(1);
    expect(ws.roiScenarios[0].version).toBe(2);
  });

  it("creates the recommended pilot only from an agent-ready process", async () => {
    const analyst = env.as("analyst");
    await expect(createAgenticOpportunity(analyst, humanOnlyId, { proposed_responsibility: "Inspect roofs" })).rejects.toThrow(/Human-only/);
    aoId = await createAgenticOpportunity(analyst, agentReadyId, {
      proposed_responsibility: "Respond to new leads within 5 minutes, follow up open estimates, escalate pricing questions",
      expected_benefit: "Recovered estimates and faster response", risk_level: "LOW", difficulty_level: "MEDIUM", priority: "P1",
    });
    await setRecommendedPilot(analyst, aoId);
    await presentAudit(analyst, auditId, { deliverable_url: "https://docs.example.com/audit-sunshine" });
    expect((await getOpportunity(env.as("sales"), oppId)).stage).toBe("AUDIT_PRESENTED");
  });

  it("converts the pilot into a linked proposal and a won deployment without duplicate client data", async () => {
    const sales = env.as("sales");
    const before = await companiesBefore();
    proposalId = await createProposalFromAgenticOpportunity(sales, aoId, { amount_cents: 450000 });
    const p = await getProposal(sales, proposalId);
    const [audit] = await env.db.query<{ company_id: string }>("select company_id from audits where id = $1", [auditId]);
    expect(p).toMatchObject({ opportunity_id: oppId, audit_id: auditId, agentic_opportunity_id: aoId, company_id: audit.company_id, proposal_type: "PILOT", status: "DRAFT" });
    await sendProposal(sales, proposalId);
    expect((await getOpportunity(sales, oppId)).stage).toBe("PROPOSAL_SENT");
    const accepted = await acceptProposal(sales, proposalId, { delivery_owner_user_id: env.users.delivery.id });
    deploymentId = accepted.deploymentId!;
    expect((await getOpportunity(sales, oppId)).stage).toBe("WON_DEPLOYMENT");
    expect(await companiesBefore()).toBe(before);
    const [d] = await env.db.query<{ company_id: string; proposal_id: string }>("select company_id, proposal_id from deployments where id = $1", [deploymentId]);
    expect(d).toEqual({ company_id: audit.company_id, proposal_id: proposalId });
  });

  it("enforces the control model and QA before launch", async () => {
    const delivery = env.as("delivery");
    await changeDeploymentStatus(delivery, deploymentId, "BUILD");
    await changeDeploymentStatus(delivery, deploymentId, "QA");
    await expect(changeDeploymentStatus(delivery, deploymentId, "LAUNCHED")).rejects.toThrow(/Not ready to launch/);
    await addAgentRole(delivery, deploymentId, {
      name: "Lead Response Agent", responsibility: "Answer inbound leads and follow up estimates",
      allowed_actions: "Reply with approved templates; book estimate visits", prohibited_actions: "No pricing commitments; no discounts",
      approval_requirements: "Owner approves any quote over $5k", escalation_owner: "Office manager", tools: "Jobber, Twilio",
      logging_monitoring: "All messages logged in CRM", rollback_procedure: "Disable automation flag; route to office line", provider: "custom",
    });
    const qa = await addQaItem(delivery, deploymentId, { description: "After-hours lead gets reply in < 5 minutes", rollback_ready: "on" });
    await expect(updateQaItem(delivery, qa, { status: "PASSED" })).rejects.toThrow(/Evidence/);
    await updateQaItem(delivery, qa, { status: "PASSED", evidence_url: "https://evidence.example.com/qa1", rollback_ready: "on" });
    await changeDeploymentStatus(delivery, deploymentId, "LAUNCHED");
    const ws = await getDeploymentWorkspace(delivery, deploymentId);
    expect(ws.deployment.status).toBe("LAUNCHED");
    expect(ws.roles[0].gaps).toEqual([]);
  });

  it("stores effort, baseline and result KPIs by window", async () => {
    const delivery = env.as("delivery");
    await addEffortEntry(delivery, deploymentId, { hours: 30, direct_cost_cents: 40000, description: "Build + QA" });
    await addKpiMeasurement(delivery, deploymentId, { metric_key: "lead_response_minutes", unit: "minutes", measurement_type: "BASELINE", value: 240, window_start: "2026-08-01", window_end: "2026-08-31" });
    await addKpiMeasurement(delivery, deploymentId, { metric_key: "lead_response_minutes", unit: "minutes", measurement_type: "TARGET", value: 10 });
    await expect(addKpiMeasurement(delivery, deploymentId, { metric_key: "lead_response_minutes", unit: "minutes", measurement_type: "RESULT", value: 4 })).rejects.toThrow(/window/);
    await addKpiMeasurement(delivery, deploymentId, {
      metric_key: "lead_response_minutes", unit: "minutes", measurement_type: "RESULT", value: 4, window_start: "2026-10-01", window_end: "2026-10-15", benefit_monthly_cents: 300000,
    });
    const ws = await getDeploymentWorkspace(delivery, deploymentId);
    expect(ws.comparison[0]).toMatchObject({ metric_key: "lead_response_minutes", delta: -236 });
    // delivery owner sees own deployment economics: cost = 30h * $40 + $400 = $1,600 ; margin = (4500-1600)/4500
    expect(ws.financials!.deliveryCostCents).toBe(160000);
    expect(ws.financials!.grossMargin).toBeCloseTo(2900 / 4500, 5);
  });

  it("dashboard reflects revenue, margin and results and reconciles with source records", async () => {
    const dash = await getDashboard(env.as("admin"), { source: "instagram_organic" });
    const m = dash.metrics;
    expect(m.leads.value).toBe(1);
    expect(m.fitCallsCompleted.value).toBe(1);
    expect(m.paidAudits.value).toBe(1);
    expect(m.auditRevenueCents.value).toBe(150000);
    expect(m.auditConversion.value).toBe(1);
    expect(m.wonDeployments.value).toBe(1);
    expect(m.wonDeploymentRevenueCents.value).toBe(450000);
    expect(m.auditToDeployment.value).toBe(1);
    expect(m.deliveryHours.value).toBe(30);
    expect(m.grossMargin.value).toBeCloseTo(2900 / 4500, 5);
    expect(m.clientRoi.value).toBeCloseTo((300000 * 12) / 450000, 5);
    expect(m.winRate.value).toBe(1);
    expect(dash.bySource.find((r) => r.key === "instagram_organic")).toMatchObject({ leads: 1, paidAudits: 1, won: 1, wonRevenueCents: 450000 });

    // Reconcile against direct SQL over the underlying records.
    const [sql] = await env.db.query<{ audits: number; audit_rev: number; won_rev: number }>(
      `select (select count(*)::int from audits where paid_at is not null) as audits,
              (select sum(price_cents)::int8 from audits where paid_at is not null) as audit_rev,
              (select sum(amount_cents)::int8 from proposals where status = 'ACCEPTED' and proposal_type <> 'RETAINER') as won_rev`,
    );
    expect(m.paidAudits.value).toBe(sql.audits);
    expect(m.auditRevenueCents.value).toBe(sql.audit_rev);
    expect(m.wonDeploymentRevenueCents.value).toBe(sql.won_rev);
    expect(m.paidAudits.records).toEqual([auditId]);
    expect(m.wonDeployments.records).toEqual([proposalId]);

    // Funnel: the single lead reached every stage up to won.
    expect(dash.funnel.find((f) => f.stage === "WON_DEPLOYMENT")!.count).toBe(1);
    // A different source filter excludes it.
    const other = await getDashboard(env.as("admin"), { source: "outbound" });
    expect(other.metrics.leads.value).toBe(0);
  });

  it("adds an optimization retainer and reports MRR", async () => {
    const sales = env.as("sales");
    const retainerProposal = await createProposal(sales, { opportunity_id: oppId, proposal_type: "RETAINER", title: "Optimization retainer", amount_cents: 120000 });
    await sendProposal(sales, retainerProposal);
    await acceptProposal(sales, retainerProposal);
    expect((await getOpportunity(sales, oppId)).stage).toBe("WON_RETAINER");
    const dash = await getDashboard(env.as("exec"), {});
    expect(dash.metrics.mrrCents.value).toBe(120000);
  });

  it("wrote audit-trail entries for stage changes, money, scores, deployment status and KPIs", async () => {
    const rows = await env.db.query<{ entity_type: string; action: string }>("select entity_type, action from audit_log");
    const has = (e: string, a: string) => rows.some((r) => r.entity_type === e && r.action === a);
    expect(has("opportunity", "stage_change")).toBe(true);
    expect(has("opportunity", "stage_auto_advance")).toBe(true);
    expect(has("audit", "payment_confirmed")).toBe(true);
    expect(has("process_score", "score")).toBe(true);
    expect(has("roi_scenario", "new_version")).toBe(true);
    expect(has("proposal", "status_change")).toBe(true);
    expect(has("deployment", "status_change")).toBe(true);
    expect(has("kpi_measurement", "create")).toBe(true);
    expect(has("integration_event", "lead_ingested")).toBe(true);
    const history = await env.db.query<{ to_stage: string }>("select to_stage from opportunity_stage_history where opportunity_id = $1 order by id", [oppId]);
    expect(history.map((h) => h.to_stage)).toEqual([
      "NEW_LEAD", "CONTACTED", "FIT_CALL_BOOKED", "FIT_QUALIFIED", "AUDIT_OFFERED", "AUDIT_PAID", "AUDIT_IN_PROGRESS", "AUDIT_PRESENTED", "PROPOSAL_SENT", "WON_DEPLOYMENT", "WON_RETAINER",
    ]);
  });

  it("regulated verticals: agent roles must exclude professional judgment", () => {
    expect(REGULATED_PROHIBITED_TEMPLATE.LEGAL_ADMIN).toMatch(/legal advice/i);
    expect(REGULATED_PROHIBITED_TEMPLATE.DENTAL_ADMIN).toMatch(/diagnosis/i);
  });
});
