"use client";

import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { moveStageAction } from "@/app/actions";
import { formatCents } from "@/domain/money";
import { OPEN_STAGES, STAGE_LABELS, type Stage } from "@/domain/pipeline";
import type { OpportunityRow } from "@/server/crm";
import { fmtDate } from "./ui";

const initials = (name: string | null) =>
  (name ?? "?").split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]!.toUpperCase()).join("");

function OppCard({ o, now, draggable, dragging }: { o: OpportunityRow; now: number; draggable: boolean; dragging: boolean }) {
  const overdue = o.next_action_at && new Date(o.next_action_at).getTime() < now;
  const days = Math.max(0, Math.floor((now - new Date(o.stage_changed_at).getTime()) / 86400000));
  return (
    <Link
      href={`/opportunities/${o.id}`}
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/opportunity-id", o.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      className={`block rounded-lg border bg-white p-3 text-sm shadow-[0_1px_2px_rgba(4,41,105,0.05)] transition hover:-translate-y-px hover:border-rh/40 hover:shadow-md hover:no-underline ${
        overdue ? "border-l-[3px] border-red-300 border-l-red-500" : "border-frost"
      } ${draggable ? "cursor-grab active:cursor-grabbing" : ""} ${dragging ? "opacity-50" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 font-semibold leading-snug text-navy">{o.company_name}</div>
        <span title={o.owner_name ?? "Unassigned"} className={`flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${o.owner_name ? "bg-rh text-white" : "bg-mist text-slate-400"}`}>
          {o.owner_name ? initials(o.owner_name) : "–"}
        </span>
      </div>
      <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
        {o.estimated_value_cents === null ? (
          <span className="text-slate-400">No value yet</span>
        ) : (
          <span className="font-display text-base font-bold tabular-nums text-navy">{formatCents(o.estimated_value_cents, o.currency)}</span>
        )}
        {o.source ? <span className="truncate">· {o.source.replace(/_/g, " ")}</span> : null}
      </div>
      <div className="mt-2 border-t border-mist pt-2 text-xs">
        {o.next_action ? (
          <div className={`flex items-start gap-1 ${overdue ? "font-medium text-red-600" : "text-slate-600"}`}>
            <span aria-hidden>{overdue ? "⚠" : "→"}</span>
            <span className="min-w-0">
              {o.next_action}
              {o.next_action_at ? <span className="text-slate-400"> · {fmtDate(o.next_action_at)}</span> : null}
            </span>
          </div>
        ) : (
          <div className="font-medium text-amber-700">No next action set</div>
        )}
        <div className="mt-1 text-[11px] text-slate-400">{days === 0 ? "Entered stage today" : `${days} day${days === 1 ? "" : "s"} in stage`}</div>
      </div>
    </Link>
  );
}

/**
 * Kanban with drag-and-drop between stages. The server validates every move with the same pipeline rules as the
 * stage form; a rejected move snaps back and shows the reason.
 */
export function KanbanBoard({ opps, now, canMove }: { opps: OpportunityRow[]; now: number; canMove: boolean }) {
  const [optimistic, applyMove] = useOptimistic(opps, (state, move: { id: string; to: Stage }) =>
    state.map((o) => (o.id === move.id ? { ...o, stage: move.to, stage_changed_at: new Date(now) } : o)),
  );
  const [, startTransition] = useTransition();
  const [over, setOver] = useState<Stage | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "ok"; text: string } | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  function drop(to: Stage, id: string) {
    const opp = optimistic.find((o) => o.id === id);
    if (!opp || opp.stage === to) return;
    setMessage(null);
    startTransition(async () => {
      applyMove({ id, to });
      const res = await moveStageAction(id, to);
      setMessage(res.ok ? { tone: "ok", text: `${opp.company_name} moved to ${STAGE_LABELS[to]}` } : { tone: "error", text: `${opp.company_name}: ${res.error}` });
    });
  }

  return (
    <div>
      {message ? (
        <div role={message.tone === "error" ? "alert" : "status"} className={`mb-3 rounded-lg border px-4 py-2.5 text-sm font-medium ${message.tone === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
          {message.text}
        </div>
      ) : canMove ? (
        <p className="mb-3 text-xs text-slate-500">Tip: drag a card to another stage. Stage rules still apply — the deal moves only when its exit condition is met.</p>
      ) : null}
      <div className="flex gap-3 overflow-x-auto pb-4">
        {OPEN_STAGES.map((stage, idx) => {
          const col = optimistic.filter((o) => o.stage === stage);
          return (
            <div
              key={stage}
              className="flex w-64 shrink-0 flex-col"
              onDragOver={(e) => {
                if (!canMove) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (over !== stage) setOver(stage);
              }}
              onDragLeave={() => setOver((s) => (s === stage ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                setDraggingId(null);
                const id = e.dataTransfer.getData("text/opportunity-id");
                if (id) drop(stage, id);
              }}
            >
              <div className="mb-2 rounded-lg border border-frost bg-white px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="truncate text-[13px]">{STAGE_LABELS[stage]}</h2>
                  <span className="rounded-full bg-mist px-2 py-0.5 text-[11px] font-semibold text-navy tabular-nums">{col.length}</span>
                </div>
                <div className="mt-0.5 text-xs text-slate-500 tabular-nums">{formatCents(col.reduce((s, o) => s + (o.estimated_value_cents ?? 0), 0), "USD")}</div>
                <div className="mt-2 h-0.5 rounded-full brand-gradient" style={{ opacity: 0.25 + (idx / OPEN_STAGES.length) * 0.75 }} />
              </div>
              <div
                className={`flex-1 space-y-2 rounded-lg p-2 transition-colors ${over === stage ? "bg-cyan/15 ring-2 ring-cyan/50 ring-inset" : "bg-frost/40"}`}
                onDragStart={(e) => setDraggingId((e.target as HTMLElement).closest("a")?.getAttribute("href")?.split("/").pop() ?? null)}
                onDragEnd={() => {
                  setDraggingId(null);
                  setOver(null);
                }}
              >
                {col.length ? (
                  col.map((o) => <OppCard key={o.id} o={o} now={now} draggable={canMove} dragging={draggingId === o.id} />)
                ) : (
                  <div className="py-6 text-center text-xs text-slate-400">{over === stage ? "Drop here" : "No deals"}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
