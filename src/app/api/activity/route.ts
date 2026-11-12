import { handler, ok } from "@/lib/api/respond";
import { requirePrincipal } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { activityStream, resumeIdFrom, SSE_HEADERS } from "@/lib/events/stream";

export const dynamic = "force-dynamic";

export const GET = handler(async (request) => {
  const principal = await requirePrincipal(request, "VIEWER");
  const url = new URL(request.url);
  if (url.searchParams.get("stream") === "1") {
    const stream = activityStream(principal.organization.id, null, resumeIdFrom(request), request.signal);
    return new Response(stream, { headers: SSE_HEADERS });
  }
  const limit = Math.min(200, Number(url.searchParams.get("limit") ?? 50));
  const contractId = url.searchParams.get("contractId");
  const events = await db.auditEvent.findMany({ where: { organizationId: principal.organization.id, ...(contractId ? { contractId } : {}) }, orderBy: { createdAt: "desc" }, take: limit });
  return ok({ events });
});
