import Link from "next/link";
import { load, requireCtx } from "@/lib/auth/current";
import { readParams, type SearchParams } from "@/lib/params";
import { listProposals } from "@/server/proposals";
import { Empty, fmtDate, Money, PageHeader, StatusBadge } from "@/components/ui";

export const metadata = { title: "Proposals" };

export default async function ProposalsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireCtx();
  const p = await readParams(searchParams);
  const proposals = await load(listProposals(ctx, { status: p.status }));
  return (
    <div>
      <PageHeader eyebrow="Commercial" title="Proposals" subtitle="Pilot, deployment, retainer and starter proposals — linked to account, opportunity and audit" />
      <div className="mb-4 flex flex-wrap gap-1.5">
        {["", "DRAFT", "SENT", "ACCEPTED", "REJECTED", "WITHDRAWN"].map((s) => (
          <Link key={s} href={s ? `/proposals?status=${s}` : "/proposals"} className={`chip ${(p.status ?? "") === s ? "chip-active" : ""}`}>{s ? s.toLowerCase() : "all"}</Link>
        ))}
      </div>
      {proposals.length === 0 ? <Empty>No proposals.</Empty> : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead><tr><th>Title</th><th>Company</th><th>Type</th><th>Status</th><th className="text-right">Amount</th><th>Sent</th><th>Decision</th><th>Delivery</th></tr></thead>
            <tbody>{proposals.map((x) => (
              <tr key={x.id}>
                <td><Link href={`/proposals/${x.id}`}>{x.title}</Link></td>
                <td><Link href={`/companies/${x.company_id}`}>{x.company_name}</Link></td>
                <td>{x.proposal_type}</td>
                <td><StatusBadge status={x.status} /></td>
                <td className="text-right"><Money cents={x.amount_cents} currency={x.currency} />{x.proposal_type === "RETAINER" ? "/mo" : ""}</td>
                <td>{fmtDate(x.sent_at)}</td>
                <td>{fmtDate(x.decision_at)}</td>
                <td>{x.deployment_id ? <Link href={`/deployments/${x.deployment_id}`}>Deployment →</Link> : x.retainer_id ? "Retainer" : "—"}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
