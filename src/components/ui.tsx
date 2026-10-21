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

/** Larger empty state for list pages: what the page is for and the first thing to do. */
export function EmptyState({ icon: Icon, title, text, action }: { icon: LucideIcon; title: string; text?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-frost bg-white px-6 py-12 text-center">
      <span className="flex size-12 items-center justify-center rounded-xl bg-mist text-rh"><Icon className="size-6" aria-hidden /></span>
      <h2 className="mt-4">{title}</h2>
      {text ? <p className="muted mt-1 max-w-md">{text}</p> : null}
      {action ? <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
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

export interface Step {
  label: string;
  hint?: ReactNode;
  state: "done" | "current" | "todo" | "blocked";
}

/**
 * Progress tracker (pipeline stages, audit lifecycle, deployment status). Long trackers (> 6 steps) use a compact
 * layout with the marker above a wrapped label so every stage stays readable without scrolling.
 */
export function Stepper({ steps, className = "" }: { steps: Step[]; className?: string }) {
  const compact = steps.length > 6;
  const dotTone = (s: Step) =>
    s.state === "done" ? "bg-rh text-white"
    : s.state === "current" ? "bg-cta text-white ring-4 ring-cta/15"
    : s.state === "blocked" ? "bg-red-100 text-red-600"
    : "bg-mist text-slate-400";
  const labelTone = (s: Step) =>
    s.state === "current" ? "text-navy" : s.state === "blocked" ? "text-red-600" : s.state === "done" ? "text-slate-700" : "text-slate-400";
  return (
    <ol className={`flex rounded-xl border border-frost bg-white ${compact ? "px-2 py-3" : "overflow-x-auto p-2"} ${className}`}>
      {steps.map((s, i) => (
        <li key={`${s.label}-${i}`} className={compact ? "relative flex min-w-0 flex-1 flex-col items-center px-0.5 text-center" : "flex min-w-[7.5rem] flex-1 items-center gap-2 px-2 py-1.5"}>
          {compact && i < steps.length - 1 ? (
            <span className={`absolute top-3 left-1/2 h-px w-full ${s.state === "done" ? "bg-rh" : "bg-frost"}`} aria-hidden />
          ) : null}
          <span className={`relative flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${dotTone(s)}`}>
            {s.state === "done" ? "✓" : s.state === "blocked" ? "×" : i + 1}
          </span>
          <span className={compact ? "mt-1.5 min-w-0" : "min-w-0"}>
            <span className={`block text-xs font-semibold ${compact ? "text-[11px] leading-tight" : "truncate"} ${labelTone(s)}`}>{s.label}</span>
            {s.hint ? <span className="block truncate text-[11px] text-slate-400">{s.hint}</span> : null}
          </span>
          {!compact && i < steps.length - 1 ? <span className={`ml-auto hidden h-px w-4 shrink-0 sm:block ${s.state === "done" ? "bg-rh" : "bg-frost"}`} aria-hidden /> : null}
        </li>
      ))}
    </ol>
  );
}
