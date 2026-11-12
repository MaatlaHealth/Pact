import { handler, ok } from "@/lib/api/respond";
import { requirePrincipal } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { ACTIVE_CONTRACT_STATUSES } from "@/lib/policy/state-machine";

/** Every number here is an aggregate over this organization's own records. */
export const GET = handler(async (request) => {
  const principal = await requirePrincipal(request, "VIEWER");
  const orgId = principal.organization.id;
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  const [policy, captured, authorized, active, pendingApprovals, verificationRuns, recent, contractsByStatus, receipts] = await Promise.all([
    db.spendingPolicy.findUniqueOrThrow({ where: { organizationId: orgId } }),
    db.payPalCapture.aggregate({ _sum: { amountCents: true }, _count: true, where: { status: "COMPLETED", createdAt: { gte: monthStart }, authorization: { order: { organizationId: orgId } } } }),
    db.contract.aggregate({ _sum: { agreedAmountCents: true }, _count: true, where: { organizationId: orgId, paymentState: { in: ["AUTHORIZED", "CAPTURE_PENDING", "CAPTURE_UNCERTAIN"] } } }),
    db.contract.count({ where: { organizationId: orgId, status: { in: ACTIVE_CONTRACT_STATUSES } } }),
    db.approvalRequest.count({ where: { organizationId: orgId, status: "PENDING" } }),
    db.verificationRun.groupBy({ by: ["status"], _count: true, where: { contract: { organizationId: orgId } } }),
    db.auditEvent.findMany({ where: { organizationId: orgId }, orderBy: { createdAt: "desc" }, take: 12 }),
    db.contract.groupBy({ by: ["status"], _count: true, where: { organizationId: orgId } }),
    db.receipt.count({ where: { organizationId: orgId } }),
  ]);
  const passed = verificationRuns.find((v) => v.status === "PASSED")?._count ?? 0;
  const failed = verificationRuns.find((v) => v.status === "FAILED")?._count ?? 0;
  const capturedCents = captured._sum.amountCents ?? 0;
  const authorizedCents = authorized._sum.agreedAmountCents ?? 0;
  return ok({
    currency: policy.currency,
    budget: { monthlyCents: policy.monthlyBudgetCents, capturedCents, authorizedCents, availableCents: Math.max(0, policy.monthlyBudgetCents - capturedCents - authorizedCents) },
    captures: { count: captured._count, cents: capturedCents },
    authorizations: { count: authorized._count, cents: authorizedCents },
    activeContracts: active,
    pendingApprovals,
    verification: { passed, failed, other: verificationRuns.filter((v) => v.status !== "PASSED" && v.status !== "FAILED").reduce((a, v) => a + v._count, 0) },
    contractsByStatus: contractsByStatus.map((c) => ({ status: c.status, count: c._count })),
    receipts,
    recent,
    totalContracts: contractsByStatus.reduce((a, c) => a + c._count, 0),
  });
});
