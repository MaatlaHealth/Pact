import { handler, ok } from "@/lib/api/respond";
import { HttpError } from "@/lib/security/request";
import { requirePrincipal } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { PASSPORT_RULES } from "@/lib/passport/service";

export const GET = handler(async (request, ctx: { params: Promise<{ slug: string }> }) => {
  const principal = await requirePrincipal(request, "VIEWER");
  const { slug } = await ctx.params;
  const agent = await db.agent.findFirst({ where: { slug, OR: [{ isPlatformAgent: true }, { organizationId: principal.organization.id }] }, include: { capabilities: true, trustPassport: true } });
  if (!agent) throw new HttpError(404, "Agent not found.");
  // Only this workspace's contracts and receipts are exposed; the passport aggregates are global by design.
  const [contracts, receipts, runs] = await Promise.all([
    db.contract.findMany({ where: { workerAgentId: agent.id, organizationId: principal.organization.id }, select: { id: true, title: true, status: true, agreedAmountCents: true, currency: true, createdAt: true, correctionCount: true }, orderBy: { createdAt: "desc" }, take: 20 }),
    db.receipt.findMany({ where: { workerAgentId: agent.id, organizationId: principal.organization.id }, select: { receiptNumber: true, settledAt: true, contractId: true, captureRef: true }, orderBy: { settledAt: "desc" }, take: 20 }),
    db.agentRun.findMany({ where: { agentId: agent.id, contract: { organizationId: principal.organization.id } }, select: { id: true, purpose: true, status: true, startedAt: true, finishedAt: true, inputTokens: true, outputTokens: true, iterations: true, contractId: true }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  return ok({ agent, contracts, receipts, runs, passportRules: PASSPORT_RULES });
});
