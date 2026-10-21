import { requireCap } from "@/lib/auth/user";
import { ValidationError } from "@/lib/errors";
import { listOpportunities } from "./crm";
import type { Ctx } from "./context";

/** RFC 4180 CSV with formula-injection protection for spreadsheet consumers. */
export function toCsv(headers: string[], rows: unknown[][]): string {
  const cell = (v: unknown) => {
    if (v === null || v === undefined) return "";
    let s = v instanceof Date ? v.toISOString() : typeof v === "object" ? JSON.stringify(v) : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

export async function exportCsv(ctx: Ctx, kind: string): Promise<string> {
  requireCap(ctx.user, "export");
  if (kind === "leads" || kind === "pipeline") {
    const opps = await listOpportunities(ctx, { view: kind === "pipeline" ? "open" : "all" });
    return toCsv(
      ["opportunity_id", "created_at", "company", "vertical", "contact", "owner", "stage", "source", "campaign", "content_id", "keyword", "referrer", "utm",
        "estimated_value", "currency", "next_action", "next_action_at", "loss_reason", "nurture_at"],
      opps.map((o) => [o.id, o.created_at, o.company_name, o.vertical, o.contact_name, o.owner_name, o.stage, o.source, o.campaign, o.content_id, o.keyword,
        o.referrer, o.utm, o.estimated_value_cents === null ? null : (o.estimated_value_cents / 100).toFixed(2), o.currency, o.next_action, o.next_action_at,
        o.loss_reason, o.nurture_at]),
    );
  }
  if (kind === "kpis") {
    const rows = await ctx.db.query<Record<string, unknown>>(
      `select k.id, c.name as company, d.name as deployment, k.metric_key, k.unit, k.measurement_type, k.value, k.window_start, k.window_end,
         k.benefit_monthly_cents, k.notes, k.created_at
       from kpi_measurements k join deployments d on d.id = k.deployment_id join companies c on c.id = d.company_id
       order by c.name, d.name, k.metric_key, k.measurement_type, k.window_end`,
    );
    const headers = ["id", "company", "deployment", "metric_key", "unit", "measurement_type", "value", "window_start", "window_end", "benefit_monthly", "notes", "created_at"];
    return toCsv(headers, rows.map((r) => headers.map((h) => (h === "benefit_monthly" ? (r.benefit_monthly_cents === null ? null : (Number(r.benefit_monthly_cents) / 100).toFixed(2)) : r[h]))));
  }
  throw new ValidationError("Unknown export");
}
