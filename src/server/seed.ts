import type { Db } from "@/lib/db/types";
import type { Role } from "@/lib/auth/roles";
import type { SessionUser } from "@/lib/auth/user";
import { hashPassword } from "@/lib/auth/password";
import type { Ctx } from "./context";
import { completeFitCall, createLead, scheduleFitCall, submitReferral, transitionStage, updateOpportunity } from "./crm";
import { ingestLead, parseLeadEvent } from "./ingestion";
import {
  addProcess, confirmAuditPayment, createAgenticOpportunity, offerAudit, presentAudit, saveRoiScenario, scoreProcess, setRecommendedPilot,
  startAudit, updateAuditDiscovery,
} from "./audits";
import { acceptProposal, createProposal, createProposalFromAgenticOpportunity, sendProposal } from "./proposals";
import {
  addAgentRole, addEffortEntry, addKpiMeasurement, addQaItem, changeDeploymentStatus, updateDeployment, updateQaItem,
} from "./deployments";

/**
 * Demo/review data for LOCAL environments only. Everything is created through the real services so it obeys
 * the same business rules, then each step is back-dated to build a realistic 90-day history.
 */
export const DEMO_USERS: [string, Role, string, string | null][] = [
  ["admin@example.com", "ADMIN_MANAGER", "Renata Huamán", "HQ"],
  ["marco.sales@example.com", "SALES_REP", "Marco Salas", "Miami"],
  ["lucia.sales@example.com", "SALES_REP", "Lucía Prado", "Lima"],
  ["diego.delivery@example.com", "DELIVERY", "Diego Ortega", null],
  ["ana.analyst@example.com", "AUDITOR_ANALYST", "Ana Quispe", null],
  ["carlos.partner@example.com", "EXTERNAL_REP", "Carlos Méndez (Partner)", "LatAm"],
  ["elena.exec@example.com", "READ_ONLY_EXECUTIVE", "Elena Ruiz", null],
];

const DAY = 86400000;

export async function seedDemo(db: Db, password: string, log: (m: string) => void = () => {}) {
  const [{ n }] = await db.query<{ n: number }>("select count(*)::int as n from app_users");
  if (n > 0) throw new Error("Database already has users; run `npm run db:reset` first to reseed demo data.");

  const users: Record<string, SessionUser> = {};
  const hash = hashPassword(password);
  for (const [email, role, name, territory] of DEMO_USERS) {
    const [row] = await db.query<{ id: string }>(
      "insert into app_users(email, full_name, role, territory, password_hash) values ($1,$2,$3,$4,$5) returning id",
      [email, name, role, territory, hash],
    );
    users[email.split("@")[0].split(".")[0]] = { id: row.id, email, fullName: name, role };
  }
  const as = (k: string): Ctx => ({ db, user: users[k] });
  const admin = as("admin");
  const marco = as("marco");
  const lucia = as("lucia");
  const ana = as("ana");
  const diego = as("diego");
  await db.query("update app_settings set value = $1 where key = 'default_lead_owner_user_id'", [JSON.stringify(users.marco.id)]);

  /** Runs `fn`, then moves every timestamp it created to `daysAgo` (keeps intra-step order). */
  const at = async <T>(daysAgo: number, fn: () => Promise<T>): Promise<T> => {
    // t0 as text keeps microsecond precision; ts/day are generated here, so inlining them is safe.
    const [{ t0 }] = await db.query<{ t0: string }>("select clock_timestamp()::text as t0");
    const result = await fn();
    const ts = new Date(Date.now() - daysAgo * DAY).toISOString();
    const day = ts.slice(0, 10);
    const shifts: [string, string][] = [
      ["opportunities", "created_at"], ["opportunities", "stage_changed_at"], ["opportunities", "updated_at"],
      ["opportunity_stage_history", "changed_at"], ["fit_calls", "created_at"], ["activities", "occurred_at"],
      ["companies", "created_at"], ["contacts", "created_at"], ["audits", "created_at"], ["audits", "paid_at"], ["audits", "presentation_at"],
      ["process_scores", "created_at"], ["roi_scenarios", "created_at"], ["proposals", "created_at"], ["proposals", "sent_at"],
      ["proposals", "decision_at"], ["deployments", "created_at"], ["integration_events", "received_at"], ["audit_log", "created_at"],
      ["kpi_measurements", "created_at"],
    ];
    // One round trip for all back-dating updates (matters on hosted Postgres, ~100 ms per query).
    const since = `'${t0}'::timestamptz`;
    await db.exec([
      ...shifts.map(([table, col]) => `update ${table} set ${col} = '${ts}' where ${col} >= ${since};`),
      `update deployments set launch_date = '${day}' where launch_date = current_date and updated_at >= ${since};`,
      `update deployment_effort_entries set work_date = '${day}' where created_at >= ${since};`,
      `update retainers set start_date = '${day}' where created_at >= ${since};`,
    ].join("\n"));
    return result;
  };
  const future = (days: number) => new Date(Date.now() + days * DAY).toISOString();

  // ---------------------------------------------------------------- 1. Sunshine Roofing — full path to retainer
  log("Sunshine Roofing: lead → retainer");
  const sun = await at(84, async () => (await ingestLead(db, parseLeadEvent({
    external_event_id: "ig-comment-90001", source: "instagram_organic", campaign: "agentic_operations", content_id: "reel_2026_07_28_01", keyword: "AGENTES",
    contact: { name: "Rita Gómez", instagram_handle: "sunshineroofing_mia" }, company: { name: "Sunshine Roofing & Repair", website: "https://sunshineroofing.example.com" },
  }))).opportunityId);
  await db.query("update companies set vertical = 'CONTRACTORS', city = 'Miami', country = 'USA', employee_band = '10-49' where id = (select company_id from opportunities where id = $1)", [sun]);
  await at(83, () => updateOpportunity(admin, sun, { owner_user_id: users.marco.id, next_action: "DM reply + call", next_action_at: future(-83), estimated_value_cents: 750000 }));
  await at(83, () => transitionStage(marco, sun, "CONTACTED"));
  const sunFit = await at(81, () => scheduleFitCall(marco, sun, { scheduled_at: new Date(Date.now() - 79 * DAY).toISOString() }));
  await at(79, () => completeFitCall(marco, sunFit, { outcome: "QUALIFIED", audit_recommended: "on", pain_summary: "~40% of after-hours leads never get a reply; estimates go stale after 7 days.", completed_at: new Date(Date.now() - 79 * DAY).toISOString() }));
  const sunAudit = await at(78, () => offerAudit(marco, sun, { price_cents: 150000, owner_user_id: users.ana.id }));
  await at(74, () => confirmAuditPayment(marco, sunAudit, { payment_reference: "ZELLE-2291", paid_at: new Date(Date.now() - 74 * DAY).toISOString() }));
  await at(73, () => startAudit(ana, sunAudit));
  await at(73, () => updateAuditDiscovery(ana, sunAudit, {
    business_goals: "Answer every lead in < 5 minutes; lift estimate close rate from 22% to 30%.",
    team_summary: "Owner + office manager + 2 estimators + 6 crew.", systems_summary: "Jobber, Google Voice, Gmail, QuickBooks.",
    executive_summary: "Lead response and estimate follow-up are the highest-leverage, lowest-risk responsibilities to delegate.",
    roadmap_90_day: "Days 1-30: lead response pilot. Days 31-60: estimate follow-up. Days 61-90: review requests + reporting.",
  }));
  const sunP1 = await at(72, () => addProcess(ana, sunAudit, { name: "Inbound lead response", process_owner: "Office manager", frequency: "Per lead", monthly_volume: 180, monthly_hours: 45, loaded_hourly_cost_cents: 2800, systems: "Google Voice, Instagram DM, Jobber", judgment_level: 2, classification: "AGENT_READY" }));
  const sunP2 = await at(72, () => addProcess(ana, sunAudit, { name: "Estimate follow-up", process_owner: "Estimators", frequency: "Daily", monthly_volume: 90, monthly_hours: 30, loaded_hourly_cost_cents: 3500, systems: "Jobber, Gmail", judgment_level: 2, classification: "AGENT_READY" }));
  const sunP3 = await at(72, () => addProcess(ana, sunAudit, { name: "On-site roof inspection", process_owner: "Estimators", frequency: "Per job", monthly_volume: 60, monthly_hours: 90, judgment_level: 5, classification: "HUMAN_ONLY" }));
  const sunP4 = await at(72, () => addProcess(ana, sunAudit, { name: "Invoice chasing", process_owner: "Owner", monthly_volume: 40, monthly_hours: 12, judgment_level: 3, classification: "REDESIGN_FIRST", risk_notes: "Terms are inconsistent across customers — standardize first." }));
  await at(71, () => scoreProcess(ana, sunP1, { economic_impact: 5, frequency_volume: 5, repetitiveness: 4, data_availability: 4, rule_clarity: 4, human_judgment_required: 2, error_consequence: 2, implementation_difficulty: 2, time_to_value: 5 }));
  await at(71, () => scoreProcess(ana, sunP2, { economic_impact: 4, frequency_volume: 4, repetitiveness: 5, data_availability: 4, rule_clarity: 4, human_judgment_required: 2, error_consequence: 2, implementation_difficulty: 3, time_to_value: 4 }));
  await at(71, () => scoreProcess(ana, sunP3, { economic_impact: 4, frequency_volume: 3, repetitiveness: 2, data_availability: 2, rule_clarity: 2, human_judgment_required: 5, error_consequence: 5, implementation_difficulty: 5, time_to_value: 2 }));
  await at(71, () => scoreProcess(ana, sunP4, { economic_impact: 3, frequency_volume: 3, repetitiveness: 3, data_availability: 3, rule_clarity: 2, human_judgment_required: 3, error_consequence: 3, implementation_difficulty: 3, time_to_value: 3 }));
  const sunRoi = await at(70, () => saveRoiScenario(ana, sunAudit, { name: "Lead response pilot", process_id: sunP1, assumptions: {
    labor_hours_per_month: 45, loaded_hourly_cost_cents: 2800, capacity_recovered_pct_low: 50, capacity_recovered_pct_high: 75,
    leakage_monthly_cents: 1200000, leakage_recovered_pct_low: 15, leakage_recovered_pct_high: 30, quality_cost_monthly_cents: 0,
    quality_reduction_pct_low: 0, quality_reduction_pct_high: 0, platform_cost_monthly_cents: 25000, supervision_hours_per_month: 6,
    rh_implementation_fee_cents: 350000, client_setup_cost_cents: 30000, notes: "Leakage = ~6 lost jobs/mo x $2k avg margin (owner estimate).",
  } }));
  await at(69, () => saveRoiScenario(ana, sunAudit, { scenario_key: sunRoi.scenarioKey, name: "Lead response pilot", process_id: sunP1, assumptions: {
    labor_hours_per_month: 45, loaded_hourly_cost_cents: 2800, capacity_recovered_pct_low: 50, capacity_recovered_pct_high: 75,
    leakage_monthly_cents: 1200000, leakage_recovered_pct_low: 10, leakage_recovered_pct_high: 25, quality_cost_monthly_cents: 0,
    quality_reduction_pct_low: 0, quality_reduction_pct_high: 0, platform_cost_monthly_cents: 25000, supervision_hours_per_month: 8,
    rh_implementation_fee_cents: 350000, client_setup_cost_cents: 30000, notes: "v2: owner revised recovery downward after reviewing call logs.",
  } }));
  const sunAo = await at(69, () => createAgenticOpportunity(ana, sunP1, { proposed_responsibility: "Respond to every inbound lead (calls, DMs, web) within 5 minutes, qualify, and book estimate visits; escalate pricing questions to the office manager.", expected_benefit: "Recover after-hours leads; free ~25 office hours/month", risk_level: "LOW", difficulty_level: "MEDIUM", priority: "P1", roi_scenario_id: sunRoi.id }));
  await at(69, () => createAgenticOpportunity(ana, sunP2, { proposed_responsibility: "Follow up open estimates on day 2, 5 and 10 with approved templates; flag hot replies to estimators.", expected_benefit: "Higher estimate close rate", risk_level: "LOW", difficulty_level: "LOW", priority: "P2" }));
  await at(68, () => setRecommendedPilot(ana, sunAo));
  await at(66, () => presentAudit(ana, sunAudit, { deliverable_url: "https://docs.example.com/audits/sunshine-roofing", presentation_at: new Date(Date.now() - 66 * DAY).toISOString() }));
  const sunProp = await at(65, () => createProposalFromAgenticOpportunity(marco, sunAo, { amount_cents: 450000 }));
  await at(64, () => sendProposal(marco, sunProp));
  const sunAcc = await at(60, () => acceptProposal(marco, sunProp, { delivery_owner_user_id: users.diego.id }));
  const sunDep = sunAcc.deploymentId!;
  await at(59, () => changeDeploymentStatus(diego, sunDep, "BUILD"));
  await at(58, () => addKpiMeasurement(diego, sunDep, { metric_key: "lead_response_minutes", unit: "minutes", measurement_type: "BASELINE", value: 210, window_start: day(-90), window_end: day(-60), notes: "Median from Google Voice + Instagram logs" }));
  await at(58, () => addKpiMeasurement(diego, sunDep, { metric_key: "lead_response_minutes", unit: "minutes", measurement_type: "TARGET", value: 5 }));
  await at(58, () => addKpiMeasurement(diego, sunDep, { metric_key: "leads_unanswered_pct", unit: "%", measurement_type: "BASELINE", value: 38, window_start: day(-90), window_end: day(-60) }));
  await at(58, () => addKpiMeasurement(diego, sunDep, { metric_key: "estimate_visits_booked", unit: "per month", measurement_type: "BASELINE", value: 41, window_start: day(-90), window_end: day(-60) }));
  await at(55, () => addAgentRole(diego, sunDep, {
    name: "Lead Response Agent", responsibility: "First response, qualification and estimate booking for all inbound leads.",
    allowed_actions: "Reply with approved templates; ask qualification questions; book estimate visits in Jobber; send reminders.",
    prohibited_actions: "No pricing, discounts or warranty commitments; no scheduling outside service area; never promise crew dates.",
    approval_requirements: "Office manager approves any job > $15k or any non-standard request.", escalation_owner: "Office manager (Laura)",
    exception_handling: "Angry/complaint messages are routed to the owner within 10 minutes.", tools: "Jobber, Google Voice, Instagram",
    access_method: "Client-owned service account with booking-only scope", logging_monitoring: "All conversations logged to Jobber notes; weekly QA sample of 20.",
    rollback_procedure: "Toggle automation off in Jobber; calls fall back to office line.", owner_name: "Diego Ortega", provider: "client-selected platform",
  }));
  for (const [i, desc] of ["After-hours call answered < 5 min", "Out-of-area request declined politely", "Pricing question escalated"].entries()) {
    const qa = await at(50 - i, () => addQaItem(diego, sunDep, { description: desc, rollback_ready: i === 0 ? "on" : "" }));
    await at(49 - i, () => updateQaItem(diego, qa, { status: "PASSED", evidence_url: `https://evidence.example.com/sunshine/qa-${i + 1}`, rollback_ready: i === 0 ? "on" : "" }));
  }
  await at(47, () => changeDeploymentStatus(diego, sunDep, "QA"));
  await at(45, () => changeDeploymentStatus(diego, sunDep, "LAUNCHED"));
  await at(44, () => changeDeploymentStatus(diego, sunDep, "MONITORING"));
  for (const [d, h, c, what] of [[58, 10, 0, "Discovery handoff + design"], [52, 14, 18000, "Build + integration (SMS credits)"], [47, 8, 0, "QA"], [40, 6, 0, "Monitoring + tuning"], [20, 4, 0, "Monthly review"]] as const) {
    await at(d, () => addEffortEntry(diego, sunDep, { hours: h, direct_cost_cents: c, description: what }));
  }
  await at(14, () => addKpiMeasurement(diego, sunDep, { metric_key: "lead_response_minutes", unit: "minutes", measurement_type: "RESULT", value: 3, window_start: day(-44), window_end: day(-14), benefit_monthly_cents: 280000, notes: "Recovered ~2 jobs/mo attributed via Jobber source tags" }));
  await at(14, () => addKpiMeasurement(diego, sunDep, { metric_key: "leads_unanswered_pct", unit: "%", measurement_type: "RESULT", value: 4, window_start: day(-44), window_end: day(-14) }));
  await at(14, () => addKpiMeasurement(diego, sunDep, { metric_key: "estimate_visits_booked", unit: "per month", measurement_type: "RESULT", value: 52, window_start: day(-44), window_end: day(-14) }));
  await updateDeployment(diego, sunDep, {
    name: "Agentic Pilot: Inbound lead response", scope_included: "Inbound calls (after hours), Instagram DMs, web form leads; estimate booking.",
    scope_excluded: "Pricing, warranty claims, crew scheduling.", integrations: "Jobber API, Google Voice forwarding, Instagram inbox",
    start_date: day(-59), launch_version: "1.0", monitoring_until: day(15), reusable_components: 7, total_components: 10,
    reusable_assets_notes: "Contractor lead-response role card, qualification script, QA test pack, Jobber booking recipe.",
    before_narrative: "Office manager answered leads between other tasks; median first response 3.5 hours; 38% of after-hours leads never answered.",
    intervention_summary: "Lead Response Agent answers within minutes, qualifies with a 5-question script and books visits; pricing and exceptions escalate to the office manager.",
    after_narrative: "Every inbound lead answered 24/7; office manager reviews a daily digest instead of chasing messages.",
    lessons: "Booking-only access scope made client approval fast. The role card and QA pack are now the Contractor template.",
    client_approval_status: "PENDING",
  });
  const sunRet = await at(12, () => createProposal(marco, { opportunity_id: sun, audit_id: sunAudit, proposal_type: "RETAINER", title: "Optimization retainer — Sunshine Roofing", amount_cents: 120000, scope_summary: "Monitoring, monthly tuning, add estimate follow-up responsibility." }));
  await at(11, () => sendProposal(marco, sunRet));
  await at(7, () => acceptProposal(marco, sunRet));

  // ---------------------------------------------------------------- 2. Apex Electric — completed deployment (outbound, Miami)
  log("Apex Electric: outbound → deployment completed");
  const apex = await at(88, () => createLead(marco, { company_name: "Apex Electric Services", vertical: "CONTRACTORS", city: "Fort Lauderdale", country: "USA", contact_name: "Tom Becker", role_title: "Owner", email: "tom@apexelectric.example.com", source: "outbound", campaign: "miami_contractors_q3", next_action: "Intro call", next_action_at: future(-87), estimated_value_cents: 900000 }));
  await at(86, () => transitionStage(marco, apex, "CONTACTED"));
  const apexFit = await at(85, () => scheduleFitCall(marco, apex, { scheduled_at: new Date(Date.now() - 84 * DAY).toISOString() }));
  await at(84, () => completeFitCall(marco, apexFit, { outcome: "QUALIFIED", audit_recommended: "on", pain_summary: "Dispatch and permit status calls consume the office.", completed_at: new Date(Date.now() - 84 * DAY).toISOString() }));
  const apexAudit = await at(83, () => offerAudit(marco, apex, { price_cents: 200000, owner_user_id: users.ana.id }));
  await at(80, () => confirmAuditPayment(marco, apexAudit, { payment_reference: "STRIPE-MANUAL-118", paid_at: new Date(Date.now() - 80 * DAY).toISOString() }));
  await at(79, () => startAudit(ana, apexAudit));
  const apexP1 = await at(78, () => addProcess(ana, apexAudit, { name: "Job status updates to customers", monthly_volume: 400, monthly_hours: 60, loaded_hourly_cost_cents: 2600, systems: "ServiceTitan, SMS", judgment_level: 1, classification: "AGENT_READY" }));
  const apexP2 = await at(78, () => addProcess(ana, apexAudit, { name: "Permit filing", monthly_volume: 25, monthly_hours: 20, judgment_level: 4, classification: "AUTOMATE" }));
  await at(77, () => scoreProcess(ana, apexP1, { economic_impact: 4, frequency_volume: 5, repetitiveness: 5, data_availability: 5, rule_clarity: 5, human_judgment_required: 1, error_consequence: 2, implementation_difficulty: 2, time_to_value: 5 }));
  await at(77, () => scoreProcess(ana, apexP2, { economic_impact: 3, frequency_volume: 2, repetitiveness: 4, data_availability: 3, rule_clarity: 4, human_judgment_required: 3, error_consequence: 4, implementation_difficulty: 3, time_to_value: 3 }));
  const apexAo = await at(76, () => createAgenticOpportunity(ana, apexP1, { proposed_responsibility: "Send proactive job status updates from ServiceTitan data and answer 'where is my electrician' questions.", expected_benefit: "Cut inbound status calls by 60%", risk_level: "LOW", difficulty_level: "LOW", priority: "P1" }));
  await at(76, () => setRecommendedPilot(ana, apexAo));
  await at(74, () => presentAudit(ana, apexAudit, { presentation_at: new Date(Date.now() - 74 * DAY).toISOString() }));
  const apexProp = await at(73, () => createProposalFromAgenticOpportunity(marco, apexAo, { amount_cents: 650000, proposal_type: "DEPLOYMENT", title: "Agentic Deployment: Job status operations" }));
  await at(72, () => sendProposal(marco, apexProp));
  const apexDep = (await at(68, () => acceptProposal(marco, apexProp, { delivery_owner_user_id: users.diego.id }))).deploymentId!;
  await at(67, () => addKpiMeasurement(diego, apexDep, { metric_key: "status_calls_per_week", unit: "calls/week", measurement_type: "BASELINE", value: 95, window_start: day(-95), window_end: day(-68) }));
  await at(62, () => addAgentRole(diego, apexDep, { name: "Job Status Agent", responsibility: "Proactive customer status updates from ServiceTitan.", allowed_actions: "Send status messages from job data; answer ETA questions from dispatch board.", prohibited_actions: "No price quotes; no technical/electrical advice; no rescheduling without dispatcher.", approval_requirements: "Dispatcher approves any reschedule.", escalation_owner: "Dispatcher on duty", tools: "ServiceTitan, Twilio", access_method: "Read-only ServiceTitan API key held in client vault", logging_monitoring: "Message log + weekly sample review", rollback_procedure: "Disable outbound SMS workflow" }));
  const apexQa = await at(58, () => addQaItem(diego, apexDep, { description: "Delay on job triggers update within 10 min", rollback_ready: "on" }));
  await at(57, () => updateQaItem(diego, apexQa, { status: "PASSED", evidence_url: "https://evidence.example.com/apex/qa-1", rollback_ready: "on" }));
  for (const s of ["BUILD", "QA", "LAUNCHED", "MONITORING", "COMPLETED"] as const) await at(s === "COMPLETED" ? 20 : 56, () => changeDeploymentStatus(diego, apexDep, s));
  for (const [d, h, c] of [[66, 12, 0], [60, 18, 25000], [56, 6, 0], [40, 5, 0]] as const) await at(d, () => addEffortEntry(diego, apexDep, { hours: h, direct_cost_cents: c, description: "Delivery" }));
  await at(22, () => addKpiMeasurement(diego, apexDep, { metric_key: "status_calls_per_week", unit: "calls/week", measurement_type: "RESULT", value: 31, window_start: day(-50), window_end: day(-22), benefit_monthly_cents: 210000 }));
  await updateDeployment(diego, apexDep, { name: "Agentic Deployment: Job status operations", scope_included: "Status updates for residential jobs", start_date: day(-66), launch_version: "1.1", reusable_components: 5, total_components: 9, before_narrative: "Two office staff spent ~15h/week answering status calls.", intervention_summary: "Job Status Agent sends proactive updates from dispatch data.", after_narrative: "Status calls down 67%; office handles exceptions only.", lessons: "ServiceTitan status recipe reusable for other trades.", client_approval_status: "APPROVED" });

  // ---------------------------------------------------------------- 3. Bella Studio Salon — proposal sent (Lima)
  log("Bella Studio: audit presented → proposal sent");
  const bella = await at(50, () => createLead(lucia, { company_name: "Bella Studio Salon", vertical: "BEAUTY", city: "Lima", country: "Peru", contact_name: "Valeria Ríos", instagram_handle: "bellastudio.lima", source: "instagram_organic", campaign: "agentic_operations", content_id: "reel_2026_09_01_02", keyword: "CITAS", next_action: "Reply DM", next_action_at: future(-49), estimated_value_cents: 350000 }));
  await at(49, () => transitionStage(lucia, bella, "CONTACTED"));
  const bellaFit = await at(47, () => scheduleFitCall(lucia, bella, { scheduled_at: new Date(Date.now() - 45 * DAY).toISOString() }));
  await at(45, () => completeFitCall(lucia, bellaFit, { outcome: "QUALIFIED", audit_recommended: "on", pain_summary: "18% no-show rate; manual WhatsApp confirmations.", completed_at: new Date(Date.now() - 45 * DAY).toISOString() }));
  const bellaAudit = await at(44, () => offerAudit(lucia, bella, { price_cents: 90000, owner_user_id: users.ana.id }));
  await at(40, () => confirmAuditPayment(lucia, bellaAudit, { payment_reference: "YAPE-5521", paid_at: new Date(Date.now() - 40 * DAY).toISOString() }));
  await at(39, () => startAudit(ana, bellaAudit));
  const bellaP1 = await at(38, () => addProcess(ana, bellaAudit, { name: "Booking confirmations & no-show recovery", monthly_volume: 600, monthly_hours: 40, loaded_hourly_cost_cents: 900, systems: "WhatsApp Business, Booksy", judgment_level: 1, classification: "AGENT_READY" }));
  const bellaP2 = await at(38, () => addProcess(ana, bellaAudit, { name: "Client reactivation (90+ days inactive)", monthly_volume: 150, monthly_hours: 10, loaded_hourly_cost_cents: 900, judgment_level: 2, classification: "AGENT_READY" }));
  await at(37, () => scoreProcess(ana, bellaP1, { economic_impact: 4, frequency_volume: 5, repetitiveness: 5, data_availability: 4, rule_clarity: 5, human_judgment_required: 1, error_consequence: 1, implementation_difficulty: 2, time_to_value: 5 }));
  await at(37, () => scoreProcess(ana, bellaP2, { economic_impact: 3, frequency_volume: 3, repetitiveness: 4, data_availability: 3, rule_clarity: 4, human_judgment_required: 2, error_consequence: 1, implementation_difficulty: 2, time_to_value: 4 }));
  const bellaAo = await at(36, () => createAgenticOpportunity(ana, bellaP1, { proposed_responsibility: "Confirm bookings 24h/2h ahead, recover cancellations into waitlist slots.", expected_benefit: "No-shows from 18% to <8%", risk_level: "LOW", difficulty_level: "LOW", priority: "P1" }));
  await at(36, () => setRecommendedPilot(ana, bellaAo));
  await at(33, () => presentAudit(ana, bellaAudit, { presentation_at: new Date(Date.now() - 33 * DAY).toISOString() }));
  const bellaProp = await at(31, () => createProposalFromAgenticOpportunity(lucia, bellaAo, { amount_cents: 280000 }));
  await at(30, () => sendProposal(lucia, bellaProp));
  await db.query("update opportunities set next_action = 'Follow up on pilot proposal', next_action_at = $2 where id = $1", [bella, future(-2)]);

  // ---------------------------------------------------------------- 4. Torres & Asociados — regulated, audit in progress
  log("Torres & Asociados (Legal Admin): audit in progress");
  const torres = await at(30, () => createLead(lucia, { company_name: "Torres & Asociados Abogados", vertical: "LEGAL_ADMIN", city: "Lima", country: "Peru", contact_name: "Dra. Paula Torres", email: "ptorres@torreslegal.example.com", source: "referral", referrer: "CPA network", next_action: "Intro call", next_action_at: future(-29), estimated_value_cents: 1200000 }));
  await at(29, () => transitionStage(lucia, torres, "CONTACTED"));
  const torresFit = await at(28, () => scheduleFitCall(lucia, torres, { scheduled_at: new Date(Date.now() - 26 * DAY).toISOString() }));
  await at(26, () => completeFitCall(lucia, torresFit, { outcome: "QUALIFIED", audit_recommended: "on", pain_summary: "Paralegals spend hours on document collection and status calls.", completed_at: new Date(Date.now() - 26 * DAY).toISOString() }));
  const torresAudit = await at(25, () => offerAudit(lucia, torres, { price_cents: 250000, owner_user_id: users.ana.id }));
  await at(21, () => confirmAuditPayment(lucia, torresAudit, { payment_reference: "BCP-TRANSFER-77", paid_at: new Date(Date.now() - 21 * DAY).toISOString() }));
  await at(20, () => startAudit(ana, torresAudit));
  const tP1 = await at(18, () => addProcess(ana, torresAudit, { name: "Client document collection", monthly_volume: 120, monthly_hours: 50, loaded_hourly_cost_cents: 1500, systems: "Email, Google Drive", judgment_level: 2, classification: "AGENT_READY" }));
  await at(18, () => addProcess(ana, torresAudit, { name: "Case strategy review", judgment_level: 5, classification: "HUMAN_ONLY", risk_notes: "Professional legal judgment — never delegated." }));
  await at(17, () => scoreProcess(ana, tP1, { economic_impact: 4, frequency_volume: 4, repetitiveness: 4, data_availability: 3, rule_clarity: 4, human_judgment_required: 2, error_consequence: 3, implementation_difficulty: 3, time_to_value: 4 }));
  await at(16, () => createAgenticOpportunity(ana, tP1, { proposed_responsibility: "Request, track and remind clients about missing documents using the firm's checklist; escalate any legal question to the assigned paralegal.", expected_benefit: "~30 paralegal hours/month", risk_level: "MEDIUM", difficulty_level: "MEDIUM", priority: "P1", regulated_boundary_ack: "on" }));

  // ---------------------------------------------------------------- 5. Smile Bright Dental — audit paid
  log("Smile Bright Dental: audit paid");
  const smile = await at(16, () => createLead(marco, { company_name: "Smile Bright Dental Studio", vertical: "DENTAL_ADMIN", city: "Coral Gables", country: "USA", contact_name: "Dr. Sam Patel", email: "office@smilebright.example.com", source: "website", campaign: "audit_landing", utm: '{"utm_source":"google","utm_medium":"cpc","utm_campaign":"audit_landing"}', next_action: "Call back", next_action_at: future(-15), estimated_value_cents: 800000 }));
  await at(15, () => transitionStage(marco, smile, "CONTACTED"));
  const smileFit = await at(13, () => scheduleFitCall(marco, smile, { scheduled_at: new Date(Date.now() - 11 * DAY).toISOString() }));
  await at(11, () => completeFitCall(marco, smileFit, { outcome: "QUALIFIED", audit_recommended: "on", pain_summary: "Recall campaigns and confirmations handled manually by one front-desk person.", completed_at: new Date(Date.now() - 11 * DAY).toISOString() }));
  const smileAudit = await at(10, () => offerAudit(marco, smile, { price_cents: 180000 }));
  await at(6, () => confirmAuditPayment(marco, smileAudit, { payment_reference: "CARD-MANUAL-3301", paid_at: new Date(Date.now() - 6 * DAY).toISOString() }));
  await db.query("update opportunities set next_action_at = $2 where id = $1", [smile, future(1)]);

  // ---------------------------------------------------------------- 6. Early-stage and lost leads
  log("Early-stage, overdue and lost leads");
  const coastal = await at(9, () => createLead(marco, { company_name: "Coastal HVAC Services", vertical: "CONTRACTORS", city: "Miami", country: "USA", contact_name: "Jorge Díaz", phone: "+1 305 555 0142", source: "referral", referrer: "Sunshine Roofing", next_action: "Call", next_action_at: future(-8), estimated_value_cents: 600000 }));
  await at(8, () => transitionStage(marco, coastal, "CONTACTED"));
  const coastalFit = await at(6, () => scheduleFitCall(marco, coastal, { scheduled_at: new Date(Date.now() - 4 * DAY).toISOString() }));
  await at(4, () => completeFitCall(marco, coastalFit, { outcome: "QUALIFIED", audit_recommended: "on", pain_summary: "Seasonal call spikes; missed maintenance renewals.", completed_at: new Date(Date.now() - 4 * DAY).toISOString() }));
  await at(3, () => offerAudit(marco, coastal, { price_cents: 125000 }));

  const prime = await at(12, () => createLead(marco, { company_name: "Prime Plumbing Co", vertical: "CONTRACTORS", contact_name: "Mike Rossi", email: "mike@primeplumbing.example.com", source: "outbound", campaign: "miami_contractors_q3", next_action: "Second follow-up email", next_action_at: future(-3), estimated_value_cents: 400000 }));
  await at(10, () => transitionStage(marco, prime, "CONTACTED"));
  await db.query("update opportunities set next_action_at = $2 where id = $1", [prime, future(-3)]); // overdue

  const glow = await at(40, () => createLead(lucia, { company_name: "Glow Nail Bar", vertical: "BEAUTY", city: "Lima", country: "Peru", instagram_handle: "glownailbar", source: "instagram_organic", campaign: "agentic_operations", keyword: "AGENTES", next_action: "Reply DM", next_action_at: future(-39), estimated_value_cents: 150000 }));
  await at(39, () => transitionStage(lucia, glow, "CONTACTED"));
  const glowFit = await at(37, () => scheduleFitCall(lucia, glow, { scheduled_at: new Date(Date.now() - 35 * DAY).toISOString() }));
  await at(35, () => completeFitCall(lucia, glowFit, { outcome: "NOT_QUALIFIED", pain_summary: "Two-chair studio, volume too low for ROI.", completed_at: new Date(Date.now() - 35 * DAY).toISOString() }));
  await at(34, () => transitionStage(lucia, glow, "LOST_NURTURE", { loss_reason: "NO_FIT", loss_notes: "Revisit if they open a second location", nurture_at: new Date(Date.now() + 120 * DAY).toISOString() }));

  const fresh = await at(25, () => createLead(lucia, { company_name: "Studio Pelo Miraflores", vertical: "BEAUTY", source: "instagram_ads", campaign: "salon_noshow_test", next_action: "DM", next_action_at: future(-24) }));
  await at(23, () => transitionStage(lucia, fresh, "LOST_NURTURE", { loss_reason: "NO_RESPONSE" }));

  for (const [i, [handle, kw]] of [["fixit_handyman", "AGENTES"], ["luxe.lashes.mia", "CITAS"], ["drywallpros305", "AGENTES"]].entries()) {
    await at(2 - i * 0.5, () => ingestLead(db, parseLeadEvent({ external_event_id: `ig-comment-9${1000 + i}`, source: "instagram_organic", campaign: "agentic_operations", content_id: "reel_2026_10_15_03", keyword: kw, contact: { instagram_handle: handle } })));
  }

  // ---------------------------------------------------------------- 7. Partner referral
  log("Partner referral");
  const partner: Ctx = { db, user: Object.values(users).find((u) => u.role === "EXTERNAL_REP")! };
  await at(5, () =>
    submitReferral(partner, { company_name: "Andes Dental Group", vertical: "DENTAL_ADMIN", contact_name: "Dra. Inés Vargas", email: "ines@andesdental.example.com", notes: "3 clinics, front desk overwhelmed with recalls." }),
  );

  log("Done.");
  function day(offset: number) {
    return new Date(Date.now() + offset * DAY).toISOString().slice(0, 10);
  }
}
