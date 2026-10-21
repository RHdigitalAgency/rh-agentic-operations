import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { LogOut, Plus, Search } from "lucide-react";
import { requireCtx } from "@/lib/auth/current";
import { can } from "@/lib/auth/user";
import { ROLE_LABELS } from "@/lib/auth/roles";
import type { Capability } from "@/lib/auth/roles";
import { logoutAction } from "@/app/actions";
import { Flash } from "@/components/Flash";
import { FormRecovery } from "@/components/FormRecovery";
import { NavLinks, type NavItem } from "@/components/NavLinks";
import { SidebarShell } from "@/components/SidebarShell";
import { Shortcuts } from "@/components/Shortcuts";

const NAV: (NavItem & { cap: Capability })[] = [
  { href: "/", label: "Dashboard", icon: "dashboard", cap: "dashboard.read" },
  { href: "/followups", label: "Follow-ups", icon: "followups", cap: "crm.read" },
  { href: "/pipeline", label: "Pipeline", icon: "pipeline", cap: "crm.read" },
  { href: "/companies", label: "Companies", icon: "companies", cap: "crm.read" },
  { href: "/audits", label: "Audits", icon: "audits", cap: "audit.read" },
  { href: "/proposals", label: "Proposals", icon: "proposals", cap: "proposal.read" },
  { href: "/deployments", label: "Deployments", icon: "deployments", cap: "delivery.read" },
  { href: "/referrals", label: "My referrals", icon: "referrals", cap: "referral.submit" },
  { href: "/settings", label: "Settings", icon: "settings", cap: "settings.manage" },
];

const initials = (name: string) =>
  name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireCtx();
  const name = user.fullName ?? user.email;
  return (
    <div className="min-h-screen md:flex">
      <aside className="sticky top-0 z-30 bg-navy md:flex md:h-screen md:w-60 md:shrink-0 md:flex-col">
        <SidebarShell
          brand={
            <div>
              <Link href="/" className="block hover:no-underline" aria-label="RH Digital Agency — home">
                <Image src="/brand/logo-white.png" alt="RH Digital Agency" width={1080} height={258} priority sizes="160px" className="h-auto w-32 md:w-40" />
              </Link>
              <div className="eyebrow mt-3 hidden text-[10px] text-cyan/90 md:block">Agentic Operations</div>
            </div>
          }
        >
        <NavLinks items={NAV.filter((n) => can(user, n.cap)).map(({ href, label, icon }) => ({ href, label, icon }))} />
        <div className="mt-auto border-t border-white/10 p-4">
          <Link href="/account" className="flex items-center gap-3 rounded-lg p-1 -m-1 hover:bg-white/6 hover:no-underline" title="My account">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-rh text-xs font-semibold text-white ring-2 ring-white/15">{initials(name)}</span>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-white">{name}</div>
              <div className="truncate text-xs text-white/55">{ROLE_LABELS[user.role]} · My account</div>
            </div>
          </Link>
          <form action={logoutAction} className="mt-3">
            <button className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-white/60 hover:bg-white/6 hover:text-white" type="submit">
              <LogOut className="size-3.5" aria-hidden /> Sign out
            </button>
          </form>
        </div>
        </SidebarShell>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-frost bg-white/90 px-4 py-3 backdrop-blur sm:px-6 md:sticky md:top-0 md:z-10">
          {can(user, "crm.read") ? (
            <form action="/search" className="relative min-w-0 flex-1 md:max-w-md">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <input id="global-search" name="q" className="input pr-8 pl-9" placeholder="Search companies, contacts, opportunities…" aria-label="Search" aria-keyshortcuts="/" />
              <kbd className="pointer-events-none absolute top-1/2 right-2.5 hidden -translate-y-1/2 rounded border border-frost px-1.5 text-[10px] text-slate-400 md:block">/</kbd>
            </form>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            {can(user, "crm.write") ? (
              <Link href="/leads/new" className="btn btn-cta" aria-keyshortcuts="n" title="New lead (N)">
                <Plus className="size-4" aria-hidden /> <span className="hidden sm:inline">New lead</span>
              </Link>
            ) : null}
          </div>
        </header>
        <main className="mx-auto max-w-7xl p-4 sm:p-6">
          <Suspense>
            <Flash />
            <FormRecovery />
          </Suspense>
          <Shortcuts canCreateLead={can(user, "crm.write")} />
          {children}
        </main>
      </div>
    </div>
  );
}
