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
import { NavLinks, type NavItem } from "@/components/NavLinks";

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
      <aside className="bg-navy md:sticky md:top-0 md:flex md:h-screen md:w-60 md:shrink-0 md:flex-col">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 md:block">
          <Link href="/" className="block hover:no-underline" aria-label="RH Digital Agency — home">
            <Image src="/brand/logo-white.png" alt="RH Digital Agency" width={1080} height={258} priority sizes="160px" className="h-auto w-40" />
          </Link>
          <div className="eyebrow mt-3 hidden text-[10px] text-cyan/90 md:block">Agentic Operations</div>
        </div>
        <NavLinks items={NAV.filter((n) => can(user, n.cap)).map(({ href, label, icon }) => ({ href, label, icon }))} />
        <div className="mt-auto hidden border-t border-white/10 p-4 md:block">
          <div className="flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-rh text-xs font-semibold text-white ring-2 ring-white/15">{initials(name)}</span>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-white">{name}</div>
              <div className="truncate text-xs text-white/55">{ROLE_LABELS[user.role]}</div>
            </div>
          </div>
          <form action={logoutAction} className="mt-3">
            <button className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-white/60 hover:bg-white/6 hover:text-white" type="submit">
              <LogOut className="size-3.5" aria-hidden /> Sign out
            </button>
          </form>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-frost bg-white/90 px-6 py-3 backdrop-blur">
          {can(user, "crm.read") ? (
            <form action="/search" className="relative w-full max-w-md">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <input name="q" className="input pl-9" placeholder="Search companies, contacts, opportunities…" aria-label="Search" />
            </form>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            {can(user, "crm.write") ? (
              <Link href="/leads/new" className="btn btn-cta">
                <Plus className="size-4" aria-hidden /> New lead
              </Link>
            ) : null}
            <form action={logoutAction} className="md:hidden">
              <button className="btn" type="submit" aria-label="Sign out">
                <LogOut className="size-4" aria-hidden />
              </button>
            </form>
          </div>
        </header>
        <main className="mx-auto max-w-7xl p-6">
          <Suspense>
            <Flash />
          </Suspense>
          {children}
        </main>
      </div>
    </div>
  );
}
