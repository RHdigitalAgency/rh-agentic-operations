import { redirect } from "next/navigation";
import { Suspense } from "react";
import { loginAction } from "@/app/actions";
import { getCurrentUser } from "@/lib/auth/current";
import { Flash } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="text-xs font-semibold tracking-widest text-brand-700 uppercase">RH Digital Agency</div>
          <h1 className="mt-1 text-2xl">Agentic Operations</h1>
          <p className="muted mt-1">Internal platform — sign in to continue</p>
        </div>
        <Suspense>
          <Flash />
        </Suspense>
        <form action={loginAction} className="card space-y-3">
          <label className="block">
            <span className="label">Email</span>
            <input className="input" type="email" name="email" autoComplete="username" required autoFocus />
          </label>
          <label className="block">
            <span className="label">Password</span>
            <input className="input" type="password" name="password" autoComplete="current-password" required />
          </label>
          <SubmitButton className="btn btn-primary w-full">Sign in</SubmitButton>
        </form>
      </div>
    </main>
  );
}
