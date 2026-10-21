import Link from "next/link";
import { load, requireCtx } from "@/lib/auth/current";
import { readParams, type SearchParams } from "@/lib/params";
import { DEPLOYMENT_STATUSES, listDeployments } from "@/server/deployments";
import { Empty, fmtDate, fmtNum, PageHeader, StatusBadge } from "@/components/ui";

export const metadata = { title: "Deployments" };

export default async function DeploymentsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireCtx();
  const p = await readParams(searchParams);
  const rows = await load(listDeployments(ctx, { status: p.status, mine: p.mine === "1" }));
  return (
    <div>
      <PageHeader eyebrow="Delivery" title="Deployments" subtitle="Delivery tracker — scope, agent roles, controls, QA, effort and measured results" />
      <div className="mb-4 flex flex-wrap gap-1.5">
        <Link href="/deployments" className={`chip ${!p.status && !p.mine ? "chip-active" : ""}`}>All</Link>
        <Link href="/deployments?mine=1" className={`chip ${p.mine ? "chip-active" : ""}`}>Mine</Link>
        {DEPLOYMENT_STATUSES.map((s) => <Link key={s} href={`/deployments?status=${s}`} className={`chip ${p.status === s ? "chip-active" : ""}`}>{s.toLowerCase()}</Link>)}
      </div>
      {rows.length === 0 ? <Empty>No deployments. They are created when a pilot/deployment proposal is accepted.</Empty> : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead><tr><th>Deployment</th><th>Company</th><th>Status</th><th>Owner</th><th>Start</th><th>Launch</th><th className="text-right">Hours</th></tr></thead>
            <tbody>{rows.map((d) => (
              <tr key={d.id}>
                <td><Link href={`/deployments/${d.id}`}>{d.name}</Link></td>
                <td>{d.company_name}</td>
                <td><StatusBadge status={d.status} /></td>
                <td>{d.owner_name ?? "Unassigned"}</td>
                <td>{fmtDate(d.start_date)}</td>
                <td>{fmtDate(d.launch_date)}</td>
                <td className="text-right tabular-nums">{fmtNum(d.hours)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
