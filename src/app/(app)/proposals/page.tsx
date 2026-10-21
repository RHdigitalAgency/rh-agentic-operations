import Link from "next/link";
import { FileSignature } from "lucide-react";
import { load, requireCtx } from "@/lib/auth/current";
import { can } from "@/lib/auth/user";
import { readParams, type SearchParams } from "@/lib/params";
import { sortRows } from "@/lib/sort";
import { listProposals, type ProposalRow } from "@/server/proposals";
import { EmptyState, fmtDate, Money, PageHeader, StatusBadge } from "@/components/ui";
import { ExportLink, SortHeader } from "@/components/SortHeader";

export const metadata = { title: "Proposals" };

const TYPES: [string, string][] = [["PILOT", "Pilot"], ["DEPLOYMENT", "Deployment"], ["RETAINER", "Retainer"], ["SMB_STARTER", "SMB starter"]];

export default async function ProposalsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireCtx();
  const p = await readParams(searchParams);
  const rows = await load(listProposals(ctx, { status: p.status }));
  const term = p.q?.trim().toLowerCase();
  const filteredRows = rows.filter((x) => (!p.type || x.proposal_type === p.type) && (!term || x.title.toLowerCase().includes(term) || x.company_name.toLowerCase().includes(term)));
  const net = (x: ProposalRow) => x.amount_cents - x.audit_credit_cents;
  const proposals = sortRows<ProposalRow>(filteredRows, {
    title: (x) => x.title,
    company: (x) => x.company_name,
    type: (x) => x.proposal_type,
    status: (x) => x.status,
    amount: net,
    sent: (x) => x.sent_at,
    decision: (x) => x.decision_at,
  }, p.sort, p.dir);
  const chip = (status?: string) => {
    const q = new URLSearchParams(Object.entries({ q: p.q, type: p.type, sort: p.sort, dir: p.dir, status }).filter(([, v]) => v) as [string, string][]);
    return `/proposals${q.size ? `?${q}` : ""}`;
  };
  const h = (label: string, field: string, align?: "right", firstDir: "asc" | "desc" = "asc") => <SortHeader label={label} field={field} params={p} path="/proposals" align={align} firstDir={firstDir} />;
  const filtered = Boolean(p.status || p.type || term);
  return (
    <div>
      <PageHeader eyebrow="Commercial" title="Proposals" subtitle="Pilot, deployment, retainer and starter proposals — linked to account, opportunity and audit"
        actions={can(ctx.user, "export") ? <ExportLink kind="proposals" /> : null} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1.5">
          {["", "DRAFT", "SENT", "ACCEPTED", "REJECTED", "WITHDRAWN"].map((s) => (
            <Link key={s} href={chip(s || undefined)} className={`chip ${(p.status ?? "") === s ? "chip-active" : ""}`}>{s ? s.toLowerCase() : "all"}</Link>
          ))}
        </div>
        <form method="get" className="flex w-full gap-2 sm:ml-auto sm:w-auto">
          {p.status ? <input type="hidden" name="status" value={p.status} /> : null}
          <select className="input sm:w-40" name="type" defaultValue={p.type ?? ""} aria-label="Proposal type">
            <option value="">All types</option>
            {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <input className="input sm:w-56" name="q" defaultValue={p.q} placeholder="Search title or company" aria-label="Search proposals" />
          <button className="btn btn-primary">Filter</button>
        </form>
      </div>
      {proposals.length === 0 ? (
        filtered ? <EmptyState icon={FileSignature} title="No proposals match" action={<Link href="/proposals" className="btn hover:no-underline">Show all proposals</Link>} /> : (
          <EmptyState icon={FileSignature} title="No proposals yet" text="Create a proposal from a presented audit (it pre-fills the recommended pilot and ROI) or from an opportunity."
            action={<Link href="/audits" className="btn hover:no-underline">Go to audits</Link>} />
        )
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead><tr>{h("Title", "title")}{h("Company", "company")}{h("Type", "type")}{h("Status", "status")}{h("Amount (net)", "amount", "right", "desc")}{h("Sent", "sent", undefined, "desc")}{h("Decision", "decision", undefined, "desc")}<th>Delivery</th></tr></thead>
            <tbody>{proposals.map((x) => (
              <tr key={x.id}>
                <td><Link href={`/proposals/${x.id}`}>{x.title}</Link></td>
                <td><Link href={`/companies/${x.company_id}`}>{x.company_name}</Link></td>
                <td>{TYPES.find(([v]) => v === x.proposal_type)?.[1] ?? x.proposal_type}</td>
                <td><StatusBadge status={x.status} /></td>
                <td className="text-right">
                  <Money cents={net(x)} currency={x.currency} />{x.proposal_type === "RETAINER" ? "/mo" : ""}
                  {x.audit_credit_cents > 0 ? <div className="text-[11px] text-emerald-700">audit credit applied</div> : null}
                </td>
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
