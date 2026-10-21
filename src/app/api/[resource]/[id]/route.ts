import { NotFoundError } from "@/lib/errors";
import { isUuid } from "@/server/context";
import { getCompany360, getOpportunityDetail } from "@/server/crm";
import { getAuditWorkspace } from "@/server/audits";
import { getProposal } from "@/server/proposals";
import { getDeploymentWorkspace } from "@/server/deployments";
import { withCtx } from "../../_lib";

/** GET /api/<resource>/<id>. Records outside the caller's scope return 404, exactly like missing ones. */
export async function GET(_req: Request, { params }: { params: Promise<{ resource: string; id: string }> }) {
  const { resource, id } = await params;
  return withCtx(async (ctx) => {
    if (!isUuid(id)) throw new NotFoundError();
    switch (resource) {
      case "companies":
        return getCompany360(ctx, id);
      case "opportunities":
        return getOpportunityDetail(ctx, id);
      case "audits":
        return getAuditWorkspace(ctx, id);
      case "proposals":
        return getProposal(ctx, id);
      case "deployments":
        return getDeploymentWorkspace(ctx, id);
      default:
        throw new NotFoundError("Unknown resource");
    }
  });
}
