import { requirePrincipal, requireContract } from "@/lib/auth/guards";
import { activityStream } from "@/lib/events/stream";
import { errorResponse } from "@/lib/api/respond";

export const dynamic = "force-dynamic";

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const principal = await requirePrincipal(request, "VIEWER");
    const { id } = await ctx.params;
    await requireContract(principal, id);
    const since = new URL(request.url).searchParams.get("since");
    const stream = activityStream(principal.organization.id, id, since, request.signal);
    return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
  } catch (error) {
    return errorResponse(error);
  }
}
