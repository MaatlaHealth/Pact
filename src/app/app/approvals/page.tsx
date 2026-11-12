import type { Metadata } from "next";
import { requireAppContext } from "@/lib/auth/app-context";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/primitives";
import { ApprovalsInbox } from "@/components/app/approvals-inbox";

export const metadata: Metadata = { title: "Approvals" };

export default async function ApprovalsPage() {
  const ctx = await requireAppContext();
  const approvals = await db.approvalRequest.findMany({ where: { organizationId: ctx.organization.id }, orderBy: [{ status: "asc" }, { requestedAt: "desc" }], take: 200, include: { contract: { select: { id: true, title: true, status: true, agreedAmountCents: true, budgetCents: true, currency: true } }, decidedBy: { select: { name: true } } } });
  return (
    <>
      <PageHeader title="Approvals" description="Decisions the policy engine routed to a person: capture approvals, subjective reviews, cold-start workers, and ambiguous verifications." />
      <ApprovalsInbox approvals={approvals.map((a) => ({ ...a, requestedAt: a.requestedAt.toISOString(), decidedAt: a.decidedAt?.toISOString() ?? null, decidedByName: a.decidedBy?.name ?? null }))} canDecide={ctx.organization.role === "ADMIN" || ctx.organization.role === "OWNER"} />
    </>
  );
}
