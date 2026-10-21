"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Briefcase, Building2, ClipboardCheck, FileSignature, Handshake, LayoutDashboard, ListTodo, Rocket, Settings, type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  followups: ListTodo,
  pipeline: Briefcase,
  companies: Building2,
  audits: ClipboardCheck,
  proposals: FileSignature,
  deployments: Rocket,
  referrals: Handshake,
  settings: Settings,
};

export interface NavItem {
  href: string;
  label: string;
  icon: keyof typeof ICONS;
}

const isActive = (pathname: string, href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));

/** Sidebar navigation with active-page highlighting. Items are pre-filtered by role on the server. */
export function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:overflow-visible md:pb-0" aria-label="Main">
      {items.map(({ href, label, icon }) => {
        const Icon = ICONS[icon];
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors hover:no-underline ${
              active ? "bg-white/12 text-white shadow-[inset_3px_0_0_#06acec]" : "text-white/65 hover:bg-white/6 hover:text-white"
            }`}
          >
            <Icon className={`size-4 shrink-0 ${active ? "text-cyan" : "text-white/50 group-hover:text-white/80"}`} aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
