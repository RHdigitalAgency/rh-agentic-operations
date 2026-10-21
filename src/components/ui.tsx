import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { formatCents } from "@/domain/money";
import { STAGE_LABELS, type Stage } from "@/domain/pipeline";

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? <div className="eyebrow mb-1">{eyebrow}</div> : null}
        <h1 className="flex flex-wrap items-center gap-2">{title}</h1>
        {subtitle ? <p className="muted mt-1">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Card({ title, children, actions, className = "", icon: Icon }: { title?: ReactNode; children: ReactNode; actions?: ReactNode; className?: string; icon?: LucideIcon }) {
  return (
    <section className={`card ${className}`}>
      {title || actions ? (
        <div className="mb-4 flex items-center justify-between gap-2">
          {title ? (
            <h2 className="flex items-center gap-2">
              {Icon ? <Icon className="size-4 text-rh" aria-hidden /> : null}
              {title}
            </h2>
          ) : (
            <span />
          )}
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  );
}

const TONES = {
  gray: "bg-slate-100 text-slate-600 ring-slate-200",
  blue: "bg-signal/8 text-signal ring-signal/20",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  purple: "bg-navy/6 text-navy ring-navy/15",
  cyan: "bg-cyan/10 text-[#0582b3] ring-cyan/25",
  orange: "bg-cta/10 text-cta-600 ring-cta/25",
} as const;
export type Tone = keyof typeof TONES;

export function Badge({ children, tone = "gray" }: { children: ReactNode; tone?: Tone }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ring-1 ring-inset ${TONES[tone]}`}>{children}</span>;
}

export function stageTone(stage: Stage): Tone {
  if (stage === "LOST_NURTURE") return "red";
  if (stage.startsWith("WON")) return "green";
  if (stage === "PROPOSAL_SENT") return "orange";
  if (stage.startsWith("AUDIT")) return "purple";
  if (stage === "FIT_QUALIFIED" || stage === "FIT_CALL_BOOKED") return "cyan";
  return "blue";
}

export function StageBadge({ stage }: { stage: Stage }) {
  return <Badge tone={stageTone(stage)}>{STAGE_LABELS[stage] ?? stage}</Badge>;
}

export function StatusBadge({ status }: { status: string }) {
  const tone: Tone =
    ["ACCEPTED", "PASSED", "PRESENTED", "LAUNCHED", "MONITORING", "COMPLETED", "ACTIVE", "PAID", "APPROVED"].includes(status) ? "green"
    : ["REJECTED", "FAILED", "CANCELLED", "WITHDRAWN", "DENIED"].includes(status) ? "red"
    : ["PENDING", "PAUSED", "OFFERED", "DRAFT"].includes(status) ? "amber"
    : "blue";
  return <Badge tone={tone}>{status.replace(/_/g, " ").toLowerCase()}</Badge>;
}

export function Money({ cents, currency = "USD" }: { cents: number | null | undefined; currency?: string }) {
  return <span className="tabular-nums">{formatCents(cents, currency)}</span>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-frost bg-mist/50 px-4 py-6 text-center text-sm text-slate-500">{children}</div>;
}

export function Field({ label, children, hint, className = "" }: { label: string; children: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}

export function Stat({ label, value, hint, icon: Icon, accent = false }: { label: string; value: ReactNode; hint?: ReactNode; icon?: LucideIcon; accent?: boolean }) {
  return (
    <div className={`card relative overflow-hidden p-4 ${accent ? "border-transparent text-white brand-gradient" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className={`text-[11px] font-semibold tracking-wider uppercase ${accent ? "text-white/75" : "text-slate-500"}`}>{label}</div>
        {Icon ? (
          <span className={`flex size-7 shrink-0 items-center justify-center rounded-lg ${accent ? "bg-white/15 text-white" : "bg-mist text-rh"}`}>
            <Icon className="size-3.5" aria-hidden />
          </span>
        ) : null}
      </div>
      <div className={`mt-2 font-display text-[28px] leading-none font-bold tabular-nums ${accent ? "text-white" : "text-navy"}`}>{value}</div>
      {hint ? <div className={`mt-1.5 text-xs ${accent ? "text-white/75" : "text-slate-500"}`}>{hint}</div> : null}
    </div>
  );
}

export function KV({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-5 gap-y-2 text-sm">
      {items.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-slate-500">{k}</dt>
          <dd className="min-w-0 break-words">{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Calendar dates ('YYYY-MM-DD') are rendered as-is (UTC) so they never shift a day; timestamps use local time. */
export const fmtDate = (d: Date | string | null | undefined) => {
  if (!d) return "—";
  const dateOnly = typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d);
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", ...(dateOnly ? { timeZone: "UTC" } : {}) });
};
export const fmtDateTime = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "—";
export const fmtPct = (v: number | null | undefined, digits = 0) => (v === null || v === undefined ? "—" : `${(v * 100).toFixed(digits)}%`);
export const fmtNum = (v: number | null | undefined, digits = 1) => (v === null || v === undefined ? "—" : Number(v).toLocaleString("en-US", { maximumFractionDigits: digits }));
/** Value for <input type="datetime-local"> in the server's local time. */
export const toLocalInput = (d: Date | string | null | undefined) => {
  if (!d) return "";
  const x = new Date(d);
  return new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
export const centsInput = (c: number | null | undefined) => (c === null || c === undefined ? "" : (c / 100).toFixed(2));

export function Hidden({ name, value }: { name: string; value: string }) {
  return <input type="hidden" name={name} value={value} />;
}
