import { notFound } from "next/navigation";
import { requireCtx } from "@/lib/auth/current";
import { can } from "@/lib/auth/user";
import { createCompanyAction } from "@/app/actions";
import { listReference } from "@/server/crm";
import { CompanyFields } from "../CompanyFields";
import { Card, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

export const metadata = { title: "New company" };

export default async function NewCompanyPage() {
  const ctx = await requireCtx();
  if (!can(ctx.user, "crm.write")) notFound();
  const ref = await listReference(ctx.db);
  return (
    <div className="max-w-3xl">
      <PageHeader eyebrow="Accounts" title="New company" />
      <form action={createCompanyAction}>
        <Card>
          <CompanyFields verticals={ref.verticals} sources={ref.sources} />
          <div className="mt-4"><SubmitButton>Create company</SubmitButton></div>
        </Card>
      </form>
    </div>
  );
}
