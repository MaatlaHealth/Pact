import { handler, ok } from "@/lib/api/respond";
import { requirePrincipal } from "@/lib/auth/guards";
import { db } from "@/lib/db";

export const GET = handler(async (request) => {
  const principal = await requirePrincipal(request, "VIEWER");
  const receipts = await db.receipt.findMany({ where: { organizationId: principal.organization.id }, orderBy: { createdAt: "desc" }, take: 100, include: { contract: { select: { id: true, title: true, category: true } }, workerAgent: { select: { name: true, slug: true } } } });
  return ok({ receipts: receipts.map((r) => ({ receiptNumber: r.receiptNumber, contract: r.contract, worker: r.workerAgent, captureRef: r.captureRef, settledAt: r.settledAt, createdAt: r.createdAt, payloadHash: r.payloadHash, signingKeyId: r.signingKeyId, payment: (r.payload as { payment: { amountCents: number; currency: string } }).payment })) });
});
