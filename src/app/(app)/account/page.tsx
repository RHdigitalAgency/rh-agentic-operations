import { KeyRound, UserRound } from "lucide-react";
import { requireCtx } from "@/lib/auth/current";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password";
import { changeOwnPasswordAction, updateOwnProfileAction } from "@/app/actions";
import { Card, Field, KV, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

export const metadata = { title: "My account" };

export default async function AccountPage() {
  const { user } = await requireCtx();
  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader eyebrow="Account" title="My account" subtitle="Your profile and password." />
      <Card icon={UserRound} title="Profile">
        <KV items={[["Email", user.email], ["Role", ROLE_LABELS[user.role]]]} />
        <form action={updateOwnProfileAction} className="mt-4 flex flex-wrap items-end gap-3">
          <Field label="Full name" className="min-w-64 flex-1"><input className="input" name="full_name" defaultValue={user.fullName ?? ""} required maxLength={200} /></Field>
          <SubmitButton>Save name</SubmitButton>
        </form>
      </Card>
      <Card icon={KeyRound} title="Change password">
        <form action={changeOwnPasswordAction} className="grid gap-3 sm:grid-cols-3">
          <Field label="Current password"><input className="input" type="password" name="current_password" autoComplete="current-password" required /></Field>
          <Field label="New password" hint={`At least ${MIN_PASSWORD_LENGTH} characters`}><input className="input" type="password" name="new_password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} required /></Field>
          <Field label="Repeat new password"><input className="input" type="password" name="confirm_password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} required /></Field>
          <div className="sm:col-span-3"><SubmitButton>Change password</SubmitButton></div>
        </form>
        <p className="muted mt-3">After 5 wrong sign-in attempts an account is locked for 15 minutes. Forgot your password? Ask an admin to set a new one in Settings.</p>
      </Card>
    </div>
  );
}
