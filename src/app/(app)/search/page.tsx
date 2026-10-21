import Link from "next/link";
import { load, requireCtx } from "@/lib/auth/current";
import { readParams, type SearchParams } from "@/lib/params";
import { search } from "@/server/crm";
import { Card, Empty, PageHeader, StageBadge } from "@/components/ui";

export const metadata = { title: "Search" };

export default async function SearchPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireCtx();
  const { q = "" } = await readParams(searchParams);
  const r = await load(search(ctx, q));
  const total = r.companies.length + r.contacts.length + r.opportunities.length;
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Search" title={`Search: “${q}”`} subtitle={q.trim().length < 2 ? "Type at least 2 characters" : `${total} result(s) within your access`} />
      {total === 0 ? <Empty>No matches. Try part of a company name, a contact, an email or an Instagram handle.</Empty> : (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card title="Companies">
            <ul className="space-y-1 text-sm">{r.companies.map((c) => <li key={c.id}><Link href={`/companies/${c.id}`}>{c.name}</Link></li>)}</ul>
          </Card>
          <Card title="Contacts">
            <ul className="space-y-1 text-sm">{r.contacts.map((c) => <li key={c.id}><Link href={`/companies/${c.company_id}`}>{c.name ?? c.email}</Link> <span className="text-slate-500">· {c.company_name}</span></li>)}</ul>
          </Card>
          <Card title="Opportunities">
            <ul className="space-y-1 text-sm">{r.opportunities.map((o) => <li key={o.id}><Link href={`/opportunities/${o.id}`}>{o.company_name}</Link> <StageBadge stage={o.stage} /></li>)}</ul>
          </Card>
        </div>
      )}
    </div>
  );
}
