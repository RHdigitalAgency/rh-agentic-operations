import type { NextRequest } from "next/server";
import { NotFoundError } from "@/lib/errors";
import { listCompanies, listOpportunities } from "@/server/crm";
import { listAudits } from "@/server/audits";
import { listProposals } from "@/server/proposals";
import { listDeployments } from "@/server/deployments";
import { getDashboard } from "@/server/analytics";
import { withCtx } from "../_lib";

/** Read-only internal REST surface (GET /api/companies, /api/opportunities, ...). Same RBAC as the UI. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ resource: string }> }) {
  const { resource } = await params;
  const q = Object.fromEntries(req.nextUrl.searchParams.entries());
  return withCtx(async (ctx) => {
    switch (resource) {
      case "companies":
        return listCompanies(ctx, { q: q.q, vertical: q.vertical });
      case "opportunities":
        return listOpportunities(ctx, { view: q.view as "open" | undefined, stage: q.stage, ownerId: q.owner, source: q.source, vertical: q.vertical, q: q.q });
      case "audits":
        return listAudits(ctx, { status: q.status });
      case "proposals":
        return listProposals(ctx, { status: q.status });
      case "deployments":
        return listDeployments(ctx, { status: q.status });
      case "dashboard": {
        const { data: _data, ...dash } = await getDashboard(ctx, { from: q.from, to: q.to, vertical: q.vertical, source: q.source, ownerId: q.owner });
        void _data;
        return dash;
      }
      default:
        throw new NotFoundError("Unknown resource");
    }
  });
}
