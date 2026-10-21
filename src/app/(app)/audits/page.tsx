import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { load, requireCtx } from "@/lib/auth/current";
import { can } from "@/lib/auth/user";
import { readParams, type SearchParams } from "@/lib/params";
import { sortRows } from "@/lib/sort";
import { AUDIT_STATUSES, listAudits } from "@/server/audits";
import { EmptyState, fmtDate, Money, PageHeader, StatusBadge } from "@/components/ui";
import { ExportLink, SortHeader } from "@/components/SortHeader";

export const metadata = { title: "Audits" };

type Row = Awaited<ReturnType<typeof listAudits>>[number];

export default async function AuditsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireCtx();
  const p = await readParams(searchParams);
  const rows = await load(listAudits(ctx, { status: p.status }));
  const term = p.q?.trim().toLowerCase();
  const audits = sortRows<Row>(term ? rows.filter((a) => a.company_name.toLowerCase().includes(term) || (a.owner_name ?? "").toLowerCase().includes(term)) : rows, {
    company: (a) => a.company_name,
    status: (a) => a.status,
    price: (a) => a.price_cents,
    paid: (a) => a.paid_at,
    auditor: (a) => a.owner_name,
    processes: (a) => a.process_count,
    presented: (a) => a.presentation_at,
  }, p.sort, p.dir);
  const chip = (status?: string) => {
    const q = new URLSearchParams(Object.entries({ q: p.q, sort: p.sort, dir: p.dir, status }).filter(([, v]) => v) as [string, string][]);
    return `/audits${q.size ? `?${q}` : ""}`;
  };
  const h = (label: string, field: string, align?: "right", firstDir: "asc" | "desc" = "asc") => <SortHeader label={label} field={field} params={p} path="/audits" align={align} firstDir={firstDir} />;
  return (
    <div>
      <PageHeader eyebrow="Audit engine" title="Audits" subtitle="Paid Agentic Operations Audits — create them from a qualified opportunity"
        actions={can(ctx.user, "export") ? <ExportLink kind="audits" /> : null} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1.5">
          <Link href={chip()} className={`chip ${!p.status ? "chip-active" : ""}`}>All</Link>
          {AUDIT_STATUSES.map((s) => <Link key={s} href={chip(s)} className={`chip ${p.status === s ? "chip-active" : ""}`}>{s.replace("_", " ").toLowerCase()}</Link>)}
        </div>
        <form method="get" className="w-full sm:ml-auto sm:w-64">
          {p.status ? <input type="hidden" name="status" value={p.status} /> : null}
          <input className="input" name="q" defaultValue={p.q} placeholder="Search company or auditor" aria-label="Search audits" />
        </form>
      </div>
      {audits.length === 0 ? (
        p.status || term ? <EmptyState icon={ClipboardCheck} title="No audits match" action={<Link href="/audits" className="btn hover:no-underline">Show all audits</Link>} /> : (
          <EmptyState icon={ClipboardCheck} title="No audits yet" text="Offer a paid audit from an opportunity once its fit call is qualified. It shows up here for payment, discovery and process mapping."
            action={<Link href="/pipeline" className="btn hover:no-underline">Go to pipeline</Link>} />
        )
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead><tr>{h("Company", "company")}{h("Status", "status")}{h("Price", "price", "right", "desc")}{h("Paid", "paid", undefined, "desc")}{h("Auditor", "auditor")}{h("Processes", "processes", "right", "desc")}{h("Presented", "presented", undefined, "desc")}</tr></thead>
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
