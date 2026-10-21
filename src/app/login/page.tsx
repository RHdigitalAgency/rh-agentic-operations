import Image from "next/image";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { loginAction } from "@/app/actions";
import { getCurrentUser } from "@/lib/auth/current";
import { Flash } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";

export const metadata = { title: "Sign in" };

const PILLARS = ["Discover", "Map", "Simplify", "Delegate", "Deploy", "Control", "Measure", "Scale"];

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden brand-gradient p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -right-24 -bottom-24 size-[420px] rounded-full bg-cyan/20 blur-3xl" aria-hidden />
        <Image src="/brand/logo-white.png" alt="RH Digital Agency" width={1080} height={258} priority sizes="224px" className="h-auto w-56" />
        <div className="relative max-w-md">
          <div className="eyebrow text-cyan">Agentic Operations</div>
          <h1 className="mt-3 text-5xl leading-[1.05] text-white">From lead to measured ROI, in one system.</h1>
          <p className="mt-4 text-white/75">Paid audits, process mapping, agentic opportunity scoring, deployments and client results — tracked end to end.</p>
        </div>
        <ol className="relative flex flex-wrap gap-x-3 gap-y-1 font-display text-sm tracking-[0.2em] text-white/60 uppercase">
          {PILLARS.map((p, i) => (
            <li key={p}>
              {p}
              {i < PILLARS.length - 1 ? <span className="ml-3 text-cyan">›</span> : null}
            </li>
          ))}
        </ol>
      </section>

      <section className="flex items-center justify-center bg-mist p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Image src="/brand/logo-blue.png" alt="RH Digital Agency" width={1080} height={258} priority sizes="208px" className="mx-auto h-auto w-52" />
          </div>
          <div className="eyebrow">Internal platform</div>
          <h1 className="mt-1 text-3xl">Sign in</h1>
          <p className="muted mt-1 mb-6">Use your RH Digital Agency account.</p>
          <Suspense>
            <Flash />
          </Suspense>
          <form action={loginAction} className="card space-y-4 p-6">
            <label className="block">
              <span className="label">Email</span>
              <input className="input" type="email" name="email" autoComplete="username" required autoFocus />
            </label>
            <label className="block">
              <span className="label">Password</span>
              <input className="input" type="password" name="password" autoComplete="current-password" required />
            </label>
            <SubmitButton className="btn btn-primary w-full py-2.5">Sign in</SubmitButton>
          </form>
          <p className="mt-6 text-center text-xs text-slate-400">Your strategic partner for growth</p>
        </div>
      </section>
    </main>
  );
}
