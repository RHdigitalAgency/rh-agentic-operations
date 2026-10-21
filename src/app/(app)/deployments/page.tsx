import Link from "next/link";
import { Rocket } from "lucide-react";
import { load, requireCtx } from "@/lib/auth/current";
import { readParams, type SearchParams } from "@/lib/params";
import { sortRows } from "@/lib/sort";
import { DEPLOYMENT_STATUSES, listDeployments } from "@/server/deployments";
import { EmptyState, fmtDate, fmtNum, PageHeader, StatusBadge } from "@/components/ui";
import { SortHeader } from "@/components/SortHeader";

type Row = Awaited<ReturnType<typeof listDeployments>>[number];

export const metadata = { title: "Deployments" };

export default async function DeploymentsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireCtx();
  const p = await readParams(searchParams);
  const rows = sortRows<Row>(await load(listDeployments(ctx, { status: p.status, mine: p.mine === "1" })), {
    name: (d) => d.name,
    company: (d) => d.company_name,
    status: (d) => d.status,
    owner: (d) => d.owner_name,
    start: (d) => d.start_date,
    launch: (d) => d.launch_date,
    hours: (d) => Number(d.hours),
  }, p.sort, p.dir);
  const h = (label: string, field: string, align?: "right", firstDir: "asc" | "desc" = "asc") => <SortHeader label={label} field={field} params={p} path="/deployments" align={align} firstDir={firstDir} />;
  return (
    <div>
      <PageHeader eyebrow="Delivery" title="Deployments" subtitle="Delivery tracker — scope, agent roles, controls, QA, effort and measured results" />
      <div className="mb-4 flex flex-wrap gap-1.5">
        <Link href="/deployments" className={`chip ${!p.status && !p.mine ? "chip-active" : ""}`}>All</Link>
        <Link href="/deployments?mine=1" className={`chip ${p.mine ? "chip-active" : ""}`}>Mine</Link>
        {DEPLOYMENT_STATUSES.map((s) => <Link key={s} href={`/deployments?status=${s}`} className={`chip ${p.status === s ? "chip-active" : ""}`}>{s.toLowerCase()}</Link>)}
      </div>
      {rows.length === 0 ? (
        p.status || p.mine ? <EmptyState icon={Rocket} title="No deployments match" action={<Link href="/deployments" className="btn hover:no-underline">Show all deployments</Link>} /> : (
          <EmptyState icon={Rocket} title="No deployments yet" text="A deployment is created automatically when a client accepts a pilot or deployment proposal."
            action={<Link href="/proposals?status=SENT" className="btn hover:no-underline">See proposals awaiting a decision</Link>} />
        )
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead><tr>{h("Deployment", "name")}{h("Company", "company")}{h("Status", "status")}{h("Owner", "owner")}{h("Start", "start", undefined, "desc")}{h("Launch", "launch", undefined, "desc")}{h("Hours", "hours", "right", "desc")}</tr></thead>
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
