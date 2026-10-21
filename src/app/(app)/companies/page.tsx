import Link from "next/link";
import { Building2 } from "lucide-react";
import { load, requireCtx } from "@/lib/auth/current";
import { can } from "@/lib/auth/user";
import { readParams, type SearchParams } from "@/lib/params";
import { sortRows } from "@/lib/sort";
import { listCompanies, listReference } from "@/server/crm";
import { EmptyState, PageHeader } from "@/components/ui";
import { ExportLink, SortHeader } from "@/components/SortHeader";

export const metadata = { title: "Companies" };

type Row = Awaited<ReturnType<typeof listCompanies>>[number];

export default async function CompaniesPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireCtx();
  const p = await readParams(searchParams);
  const [all, ref] = await load(Promise.all([listCompanies(ctx, { q: p.q, vertical: p.vertical }), listReference(ctx.db)]));
  const vName = new Map(ref.verticals.map((v) => [v.code, v.name]));
  const companies = sortRows<Row>(all, {
    name: (c) => c.name,
    vertical: (c) => (c.vertical ? vName.get(c.vertical) ?? c.vertical : null),
    location: (c) => [c.city, c.country].filter(Boolean).join(", "),
    owner: (c) => c.owner_name,
    source: (c) => c.source,
    open: (c) => c.open_opps,
    deployments: (c) => c.deployments,
  }, p.sort, p.dir);
  const filtered = Boolean(p.q || p.vertical);
  const h = (label: string, field: string, align?: "right") => <SortHeader label={label} field={field} params={p} path="/companies" align={align} firstDir={align ? "desc" : "asc"} />;
  return (
    <div>
      <PageHeader eyebrow="Accounts" title="Companies" subtitle={`${companies.length} account${companies.length === 1 ? "" : "s"}`} actions={<>
        {can(ctx.user, "export") ? <ExportLink kind="companies" /> : null}
        {can(ctx.user, "crm.write") ? <Link className="btn btn-primary hover:no-underline" href="/companies/new">+ Company</Link> : null}
      </>} />
      <form className="card mb-4 flex flex-wrap items-end gap-3" method="get">
        <label className="min-w-48 flex-1 sm:flex-none"><span className="label">Name</span><input className="input" name="q" defaultValue={p.q} placeholder="Search by name" /></label>
        <label className="min-w-40 flex-1 sm:flex-none"><span className="label">Vertical</span>
          <select className="input" name="vertical" defaultValue={p.vertical ?? ""}>
            <option value="">All</option>
            {ref.verticals.map((v) => <option key={v.code} value={v.code}>{v.name}</option>)}
          </select>
        </label>
        <button className="btn btn-primary">Filter</button>
        {filtered ? <Link href="/companies" className="btn hover:no-underline">Reset</Link> : null}
      </form>
      {companies.length === 0 ? (
        filtered ? <EmptyState icon={Building2} title="No companies match these filters" action={<Link href="/companies" className="btn hover:no-underline">Clear filters</Link>} /> : (
          <EmptyState icon={Building2} title="No companies yet" text="Companies are created automatically when you add a lead, or arrive from Instagram and website forms."
            action={can(ctx.user, "crm.write") ? <Link href="/leads/new" className="btn btn-cta hover:no-underline">Add your first lead</Link> : null} />
        )
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead><tr>{h("Name", "name")}{h("Vertical", "vertical")}{h("Location", "location")}{h("Owner", "owner")}{h("Source", "source")}{h("Open opps", "open", "right")}{h("Deployments", "deployments", "right")}</tr></thead>
            <tbody>
              {companies.map((c) => (
                <tr key={c.id}>
                  <td><Link href={`/companies/${c.id}`}>{c.name}</Link></td>
                  <td>{c.vertical ? vName.get(c.vertical) ?? c.vertical : "—"}</td>
                  <td>{[c.city, c.country].filter(Boolean).join(", ") || "—"}</td>
                  <td>{c.owner_name ?? "—"}</td>
                  <td>{c.source ?? "—"}</td>
                  <td className="text-right tabular-nums">{c.open_opps}</td>
                  <td className="text-right tabular-nums">{c.deployments}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
