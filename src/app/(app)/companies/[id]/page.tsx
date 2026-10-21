import Link from "next/link";
import { load, requireCtx } from "@/lib/auth/current";
import { can } from "@/lib/auth/user";
import { addActivityAction, createContactAction, updateCompanyAction } from "@/app/actions";
import { ACTIVITY_TYPES, getCompany360, listReference } from "@/server/crm";
import { compareKpis } from "@/domain/kpi";
import { Badge, Card, Empty, fmtDate, fmtDateTime, fmtNum, fmtPct, Hidden, Money, PageHeader, StageBadge, StatusBadge } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { CompanyFields } from "../CompanyFields";

export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireCtx();
  const data = await load(getCompany360(ctx, id));
  const ref = await listReference(ctx.db);
  const { company } = data;
  const canWrite = can(ctx.user, "crm.write");
  const back = `/companies/${id}`;
  const kpisByDeployment = new Map<string, typeof data.kpis>();
  for (const k of data.kpis) kpisByDeployment.set(k.deployment_id, [...(kpisByDeployment.get(k.deployment_id) ?? []), k]);
  const regulated = ref.verticals.find((v) => v.code === company.vertical)?.regulated;

  return (
    <div className="space-y-4">
      <PageHeader
        title={<>{company.name} {regulated ? <Badge tone="amber">regulated vertical · admin-only scope</Badge> : null}</>}
        subtitle={`${ref.verticals.find((v) => v.code === company.vertical)?.name ?? "No vertical"} · owner ${company.owner_name ?? "—"} · source ${company.source ?? "—"}`}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Opportunities" className="lg:col-span-2">
          {data.opportunities.length === 0 ? <Empty>No opportunities.</Empty> : (
            <table className="table">
              <thead><tr><th>Opportunity</th><th>Stage</th><th>Source</th><th className="text-right">Value</th><th>Next action</th></tr></thead>
              <tbody>{data.opportunities.map((o) => (
                <tr key={o.id}>
                  <td><Link href={`/opportunities/${o.id}`}>{o.title ?? "Opportunity"}</Link></td>
                  <td><StageBadge stage={o.stage} /></td>
                  <td>{o.source ?? "—"}{o.keyword ? ` · ${o.keyword}` : ""}</td>
                  <td className="text-right"><Money cents={o.estimated_value_cents} currency={o.currency} /></td>
                  <td>{o.next_action ?? "—"} <span className="text-slate-500">{o.next_action_at ? fmtDate(o.next_action_at) : ""}</span></td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </Card>
        <Card title="Contacts">
          {data.contacts.length === 0 ? <Empty>No contacts.</Empty> : (
            <ul className="space-y-2 text-sm">
              {data.contacts.map((c) => (
                <li key={c.id}>
                  <div className="font-medium">{c.name ?? "—"} <span className="font-normal text-slate-500">{c.role_title}</span></div>
                  <div className="text-slate-600">{[c.email, c.phone, c.instagram_handle ? `@${c.instagram_handle}` : null].filter(Boolean).join(" · ")}</div>
                </li>
              ))}
            </ul>
          )}
          {canWrite ? (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm text-brand-700">Add contact</summary>
              <form action={createContactAction} className="mt-2 space-y-2">
                <Hidden name="company_id" value={id} /><Hidden name="_back" value={back} />
                <input className="input" name="name" placeholder="Name" />
                <input className="input" name="role_title" placeholder="Role" />
                <input className="input" name="email" type="email" placeholder="Email" />
                <input className="input" name="phone" placeholder="Phone" />
                <input className="input" name="instagram_handle" placeholder="@instagram" />
                <SubmitButton className="btn">Add</SubmitButton>
              </form>
            </details>
          ) : null}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {can(ctx.user, "audit.read") ? (
          <Card title="Audits & processes">
            {data.audits.length === 0 ? <Empty>No audits.</Empty> : (
              <ul className="space-y-1 text-sm">{data.audits.map((a) => (
                <li key={a.id}><Link href={`/audits/${a.id}`}>Audit</Link> <StatusBadge status={a.status} /> <Money cents={a.price_cents} currency={a.currency} /> · {a.process_count} processes</li>
              ))}</ul>
            )}
          </Card>
        ) : null}
        {can(ctx.user, "proposal.read") ? (
          <Card title="Proposals & retainers">
            {data.proposals.length === 0 ? <Empty>No proposals.</Empty> : (
              <ul className="space-y-1 text-sm">{data.proposals.map((p) => (
                <li key={p.id}><Link href={`/proposals/${p.id}`}>{p.title}</Link> <StatusBadge status={p.status} /> <Money cents={p.amount_cents} currency={p.currency} /></li>
              ))}</ul>
            )}
            {data.retainers.length ? (
              <ul className="mt-2 space-y-1 border-t border-slate-100 pt-2 text-sm">{data.retainers.map((r) => (
                <li key={r.id}>Retainer <StatusBadge status={r.status} /> <Money cents={r.mrr_cents} currency={r.currency} />/mo since {fmtDate(r.start_date)}</li>
              ))}</ul>
            ) : null}
          </Card>
        ) : null}
        {can(ctx.user, "delivery.read") ? (
          <Card title="Deployments & KPIs">
            {data.deployments.length === 0 ? <Empty>No deployments.</Empty> : (
              <ul className="space-y-2 text-sm">{data.deployments.map((d) => (
                <li key={d.id}>
                  <Link href={`/deployments/${d.id}`}>{d.name}</Link> <StatusBadge status={d.status} />
                  {compareKpis(kpisByDeployment.get(d.id) ?? [])
                    .map((c) => (
                      <div key={c.metric_key} className="text-xs text-slate-600">
                        {c.metric_key}: {fmtNum(c.baseline?.value)} → {fmtNum(c.latestResult?.value)} {c.unit} {c.deltaPct !== null ? `(${fmtPct(c.deltaPct)})` : ""}
                      </div>
                    ))}
                </li>
              ))}</ul>
            )}
          </Card>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Account details">
          <form action={updateCompanyAction}>
            <Hidden name="id" value={id} />
            <CompanyFields company={company} verticals={ref.verticals} sources={ref.sources} disabled={!canWrite} />
            {canWrite ? <div className="mt-3"><SubmitButton>Save</SubmitButton></div> : null}
          </form>
        </Card>
        <Card title="Activity timeline">
          {can(ctx.user, "activity.write") ? (
            <form action={addActivityAction} className="mb-3 grid gap-2 md:grid-cols-4">
              <Hidden name="company_id" value={id} /><Hidden name="_back" value={back} />
              <select className="input" name="activity_type" defaultValue="NOTE">{ACTIVITY_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
              <input className="input md:col-span-2" name="notes" placeholder="Notes" />
              <SubmitButton className="btn">Log</SubmitButton>
            </form>
          ) : null}
          {data.activities.length === 0 ? <Empty>No activity.</Empty> : (
            <ul className="space-y-1.5 text-sm">{data.activities.map((a) => (
              <li key={a.id}><Badge>{a.activity_type}</Badge> <span className="text-slate-500">{fmtDateTime(a.occurred_at)} · {a.owner_name ?? "system"}</span><div>{a.notes}</div></li>
            ))}</ul>
          )}
        </Card>
      </div>
    </div>
  );
}
