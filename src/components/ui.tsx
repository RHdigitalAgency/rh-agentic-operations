import type { ReactNode } from "react";
import { formatCents } from "@/domain/money";
import { STAGE_LABELS, type Stage } from "@/domain/pipeline";

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1>{title}</h1>
        {subtitle ? <p className="muted mt-0.5">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function Card({ title, children, actions, className = "" }: { title?: ReactNode; children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {title || actions ? (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title ? <h2>{title}</h2> : <span />}
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  );
}

const TONES = {
  gray: "bg-slate-100 text-slate-700",
  blue: "bg-blue-50 text-blue-700",
  green: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-800",
  red: "bg-red-50 text-red-700",
  purple: "bg-violet-50 text-violet-700",
} as const;

export function Badge({ children, tone = "gray" }: { children: ReactNode; tone?: keyof typeof TONES }) {
  return <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium whitespace-nowrap ${TONES[tone]}`}>{children}</span>;
}

export function StageBadge({ stage }: { stage: Stage }) {
  const tone = stage === "LOST_NURTURE" ? "red" : stage.startsWith("WON") ? "green" : stage.startsWith("AUDIT") || stage === "PROPOSAL_SENT" ? "purple" : "blue";
  return <Badge tone={tone}>{STAGE_LABELS[stage] ?? stage}</Badge>;
}

export function StatusBadge({ status }: { status: string }) {
  const tone: keyof typeof TONES =
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
  return <div className="rounded-md border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">{children}</div>;
}

export function Field({ label, children, hint, className = "" }: { label: string; children: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      {children}
      {hint ? <span className="mt-0.5 block text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="card p-3">
      <div className="text-xs font-medium tracking-wide text-slate-500 uppercase">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {hint ? <div className="mt-0.5 text-xs text-slate-500">{hint}</div> : null}
    </div>
  );
}

export function KV({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
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
