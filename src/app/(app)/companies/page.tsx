import Link from "next/link";
import { load, requireCtx } from "@/lib/auth/current";
import { can } from "@/lib/auth/user";
import { readParams, type SearchParams } from "@/lib/params";
import { listCompanies, listReference } from "@/server/crm";
import { Empty, PageHeader } from "@/components/ui";

export default async function CompaniesPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireCtx();
  const p = await readParams(searchParams);
  const [companies, ref] = await load(Promise.all([listCompanies(ctx, { q: p.q, vertical: p.vertical }), listReference(ctx.db)]));
  const vName = new Map(ref.verticals.map((v) => [v.code, v.name]));
  return (
    <div>
      <PageHeader title="Companies" subtitle={`${companies.length} accounts`} actions={can(ctx.user, "crm.write") ? <Link className="btn btn-primary hover:no-underline" href="/companies/new">+ Company</Link> : null} />
      <form className="card mb-4 flex flex-wrap items-end gap-3" method="get">
        <label><span className="label">Name</span><input className="input" name="q" defaultValue={p.q} /></label>
        <label><span className="label">Vertical</span>
          <select className="input" name="vertical" defaultValue={p.vertical ?? ""}>
            <option value="">All</option>
            {ref.verticals.map((v) => <option key={v.code} value={v.code}>{v.name}</option>)}
          </select>
        </label>
        <button className="btn btn-primary">Filter</button>
      </form>
      {companies.length === 0 ? <Empty>No companies visible to you yet.</Empty> : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead><tr><th>Name</th><th>Vertical</th><th>Location</th><th>Owner</th><th>Source</th><th className="text-right">Open opps</th><th className="text-right">Deployments</th></tr></thead>
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
