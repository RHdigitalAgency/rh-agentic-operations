import { exportCsv } from "@/server/exports";
import { withCtx } from "../../_lib";

export async function GET(_req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  return withCtx(async (ctx) => {
    const csv = await exportCsv(ctx, kind);
    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="rh-${kind}-${new Date().toISOString().slice(0, 10)}.csv"`,
        "cache-control": "no-store",
      },
    });
  });
}
