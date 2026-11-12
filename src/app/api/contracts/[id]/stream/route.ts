import { requirePrincipal, requireContract } from "@/lib/auth/guards";
import { activityStream, resumeIdFrom, SSE_HEADERS } from "@/lib/events/stream";
import { errorResponse } from "@/lib/api/respond";

export const dynamic = "force-dynamic";

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const principal = await requirePrincipal(request, "VIEWER");
    const { id } = await ctx.params;
    await requireContract(principal, id);
    const stream = activityStream(principal.organization.id, id, resumeIdFrom(request), request.signal);
    return new Response(stream, { headers: SSE_HEADERS });
  } catch (error) {
    return errorResponse(error);
  }
}
