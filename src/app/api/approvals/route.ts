import { z } from "zod";
import { handler, ok, readJson } from "@/lib/api/respond";
import { assertSameOrigin } from "@/lib/security/request";
import { requirePrincipal } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { decideApproval } from "@/lib/approvals/service";

export const GET = handler(async (request) => {
  const principal = await requirePrincipal(request, "VIEWER");
  const status = new URL(request.url).searchParams.get("status") ?? "PENDING";
  const approvals = await db.approvalRequest.findMany({
    where: { organizationId: principal.organization.id, ...(status === "all" ? {} : { status: status as never }) },
    orderBy: { requestedAt: "desc" },
    take: 100,
    include: { contract: { select: { id: true, title: true, status: true, agreedAmountCents: true, currency: true } }, decidedBy: { select: { name: true } } },
  });
  return ok({ approvals });
});

export const POST = handler(async (request) => {
  assertSameOrigin(request);
  const principal = await requirePrincipal(request, "ADMIN");
  const { approvalId, decision, note } = await readJson(request, z.object({ approvalId: z.string().uuid(), decision: z.enum(["APPROVED", "REJECTED"]), note: z.string().max(1000).optional() }));
  const result = await decideApproval(principal, approvalId, decision, note);
  return ok(result);
});
