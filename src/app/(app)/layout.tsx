import Link from "next/link";
import { Suspense } from "react";
import { requireCtx } from "@/lib/auth/current";
import { can } from "@/lib/auth/user";
import { ROLE_LABELS } from "@/lib/auth/roles";
import type { Capability } from "@/lib/auth/roles";
import { logoutAction } from "@/app/actions";
import { Flash } from "@/components/Flash";

const NAV: [string, string, Capability][] = [
  ["/", "Dashboard", "dashboard.read"],
  ["/followups", "Follow-ups", "crm.read"],
  ["/pipeline", "Pipeline", "crm.read"],
  ["/companies", "Companies", "crm.read"],
  ["/audits", "Audits", "audit.read"],
  ["/proposals", "Proposals", "proposal.read"],
  ["/deployments", "Deployments", "delivery.read"],
  ["/referrals", "My referrals", "referral.submit"],
  ["/settings", "Settings", "settings.manage"],
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireCtx();
  return (
    <div className="min-h-screen md:flex">
      <aside className="border-b border-slate-200 bg-white md:sticky md:top-0 md:h-screen md:w-56 md:shrink-0 md:border-r md:border-b-0">
        <div className="px-4 py-3">
          <div className="text-[10px] font-semibold tracking-widest text-brand-700 uppercase">RH Digital Agency</div>
          <div className="font-semibold">Agentic Operations</div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:overflow-visible">
          {NAV.filter(([, , cap]) => can(user, cap)).map(([href, label]) => (
            <Link key={href} href={href} className="rounded-md px-2.5 py-1.5 text-sm whitespace-nowrap text-slate-700 hover:bg-slate-100 hover:no-underline">
              {label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-2">
          {can(user, "crm.read") ? (
            <form action="/search" className="w-full max-w-sm">
              <input name="q" className="input" placeholder="Search companies, contacts, opportunities…" aria-label="Search" />
            </form>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-3 text-sm">
            {can(user, "crm.write") ? (
              <Link href="/leads/new" className="btn btn-primary hover:no-underline">
                + New lead
              </Link>
            ) : null}
            <span className="text-slate-600">
              {user.fullName ?? user.email} · <span className="text-slate-400">{ROLE_LABELS[user.role]}</span>
            </span>
            <form action={logoutAction}>
              <button className="btn" type="submit">
                Sign out
              </button>
            </form>
          </div>
        </header>
        <main className="mx-auto max-w-7xl p-4">
          <Suspense>
            <Flash />
          </Suspense>
          {children}
        </main>
      </div>
    </div>
  );
}
