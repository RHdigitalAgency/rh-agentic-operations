import Link from "next/link";
import { load, requireCtx } from "@/lib/auth/current";
import { readParams, type SearchParams } from "@/lib/params";
import { AUDIT_STATUSES, listAudits } from "@/server/audits";
import { Empty, fmtDate, Money, PageHeader, StatusBadge } from "@/components/ui";

export default async function AuditsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireCtx();
  const p = await readParams(searchParams);
  const audits = await load(listAudits(ctx, { status: p.status }));
  return (
    <div>
      <PageHeader title="Audits" subtitle="Paid Agentic Operations Audits — create them from a qualified opportunity" />
      <div className="mb-3 flex flex-wrap gap-1">
        <Link href="/audits" className={`btn hover:no-underline ${!p.status ? "btn-primary" : ""}`}>All</Link>
        {AUDIT_STATUSES.map((s) => <Link key={s} href={`/audits?status=${s}`} className={`btn hover:no-underline ${p.status === s ? "btn-primary" : ""}`}>{s.replace("_", " ").toLowerCase()}</Link>)}
      </div>
      {audits.length === 0 ? <Empty>No audits.</Empty> : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead><tr><th>Company</th><th>Status</th><th className="text-right">Price</th><th>Paid</th><th>Auditor</th><th className="text-right">Processes</th><th>Presented</th></tr></thead>
            <tbody>{audits.map((a) => (
              <tr key={a.id}>
                <td><Link href={`/audits/${a.id}`}>{a.company_name}</Link></td>
                <td><StatusBadge status={a.status} /></td>
                <td className="text-right"><Money cents={a.price_cents} currency={a.currency} /></td>
                <td>{fmtDate(a.paid_at)}</td>
                <td>{a.owner_name ?? "—"}</td>
                <td className="text-right tabular-nums">{a.process_count}</td>
                <td>{fmtDate(a.presentation_at)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
