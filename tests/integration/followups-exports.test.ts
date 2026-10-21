import { beforeAll, describe, expect, it } from "vitest";
import { setupTestEnv, type TestEnv } from "../helpers";
import { completeFollowUp, createLead, getOpportunity, listActivities, snoozeFollowUp } from "@/server/crm";
import { exportCsv } from "@/server/exports";

describe("one-click follow-ups", () => {
  let env: TestEnv;
  let oppId: string;
  beforeAll(async () => {
    env = await setupTestEnv();
    oppId = await createLead(env.as("sales"), { company_name: "Snooze Co", source: "referral", next_action: "Call back", next_action_at: "2020-01-01T09:00" });
  });

  it("snoozes from now when overdue and from the current deadline otherwise, with an audit trail", async () => {
    const sales = env.as("sales");
    const before = Date.now();
    const first = await snoozeFollowUp(sales, oppId, 1);
    expect(first.getTime()).toBeGreaterThanOrEqual(before + 86400000 - 1000);
    const second = await snoozeFollowUp(sales, oppId, 7);
    expect(second.getTime() - first.getTime()).toBe(7 * 86400000);
    await expect(snoozeFollowUp(sales, oppId, 3)).rejects.toThrow(/1 or 7/);
    const trail = await env.db.query("select 1 from audit_log where entity_id = $1 and action = 'snooze'", [oppId]);
    expect(trail).toHaveLength(2);
  });

  it("marks a follow-up done: logs the activity and sets the next step together", async () => {
    const sales = env.as("sales");
    await expect(completeFollowUp(sales, oppId, { activity_type: "CALL", next_action: "", next_action_at: "2030-01-01T09:00" })).rejects.toThrow(/Next action is required/);
    await completeFollowUp(sales, oppId, { activity_type: "CALL", notes: "Interested, wants pricing", next_action: "Send audit offer", next_action_at: "2030-01-02T09:00" });
    const opp = await getOpportunity(sales, oppId);
    expect(opp.next_action).toBe("Send audit offer");
    const [act] = await listActivities(sales, { opportunityId: oppId });
    expect(act.activity_type).toBe("CALL");
    expect(act.notes).toBe("Done: Call back\nInterested, wants pricing");
  });

  it("is not available to roles that cannot edit the pipeline", async () => {
    await expect(snoozeFollowUp(env.as("delivery"), oppId, 1)).rejects.toThrow();
  });
});

describe("list exports", () => {
  it("exports companies, audits and proposals as CSV for export roles only", async () => {
    const env = await setupTestEnv();
    await createLead(env.as("sales"), { company_name: "=Export Co", source: "referral", next_action: "Call" });
    const companies = await exportCsv(env.as("admin"), "companies");
    expect(companies.split("\r\n")[0]).toBe("company_id,name,vertical,website,city,country,owner,source,status,open_opportunities,deployments,created_at");
    expect(companies).toContain("'=Export Co"); // formula injection is neutralized
    expect((await exportCsv(env.as("admin"), "audits")).startsWith("audit_id,company,status,price")).toBe(true);
    expect((await exportCsv(env.as("admin"), "proposals")).startsWith("proposal_id,title,company,type,status,amount,audit_credit,net_amount")).toBe(true);
    await expect(exportCsv(env.as("delivery"), "companies")).rejects.toThrow();
  });
});
