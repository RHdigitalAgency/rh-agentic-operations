import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { PrintButton } from "./PrintButton";

/** Shared frame for branded client documents (audit report, proposal). */
export function DocShell({ kind, title, client, meta, backHref, children }: {
  kind: string;
  title: string;
  client: string;
  meta: [string, ReactNode][];
  backHref: string;
  children: ReactNode;
}) {
  return (
    <>
      <div className="no-print mx-auto mb-4 flex max-w-[210mm] items-center justify-between px-4">
        <Link href={backHref} className="text-sm">← Back to the platform</Link>
        <PrintButton />
      </div>
      <article className="doc mx-auto max-w-[210mm] overflow-hidden rounded-xl border border-frost bg-white shadow-sm">
        <header className="brand-gradient px-10 py-9 text-white">
          <Image src="/brand/logo-white.png" alt="RH Digital Agency" width={1080} height={258} sizes="180px" className="h-auto w-44" />
          <div className="eyebrow mt-8 text-cyan">{kind}</div>
          <h1 className="mt-2 text-4xl leading-tight text-white">{title}</h1>
          <p className="mt-1 text-lg text-white/85">{client}</p>
          <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-2 text-sm">
            {meta.map(([k, v]) => (
              <div key={k}>
                <dt className="text-[11px] tracking-wider text-white/60 uppercase">{k}</dt>
                <dd className="font-medium">{v}</dd>
              </div>
            ))}
          </dl>
        </header>
        <div className="space-y-8 px-10 py-9 text-[14px] leading-relaxed text-slate-700">{children}</div>
        <footer className="border-t border-frost px-10 py-5 text-xs text-slate-500">
          RH Digital Agency · Your strategic partner for growth · Confidential — prepared for {client}
        </footer>
      </article>
    </>
  );
}

export function DocSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="avoid-break">
      <h2 className="mb-3 border-b border-frost pb-2 text-lg">{title}</h2>
      {children}
    </section>
  );
}

export function Prose({ text, fallback }: { text: string | null | undefined; fallback: string }) {
  return text ? <p className="whitespace-pre-wrap">{text}</p> : <p className="text-slate-400 italic print:hidden">{fallback}</p>;
}
