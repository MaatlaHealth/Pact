import { db } from "@/lib/db";
import { HttpError } from "@/lib/security/request";
import { recordAudit } from "@/lib/audit";
import { transitionContract } from "@/lib/contracts/transitions";
import { capturePayment } from "@/lib/payments/service";
import { enqueue } from "@/lib/jobs/queue";
import type { Principal } from "@/lib/auth/guards";

/**
 * Human decisions on approval requests. Approving a capture-related request
 * does not move money by itself: it records the approval and asks the policy
 * engine again, which now sees the approval as a satisfied rule.
 */
export async function decideApproval(principal: Principal, approvalId: string, decision: "APPROVED" | "REJECTED", note?: string) {
  const approval = await db.approvalRequest.findFirst({ where: { id: approvalId, organizationId: principal.organization.id }, include: { contract: true } });
  if (!approval) throw new HttpError(404, "Approval request not found.");
  if (approval.status !== "PENDING") throw new HttpError(409, "This request was already decided.");
  if (principal.organization.role === "VIEWER" || principal.organization.role === "MEMBER") throw new HttpError(403, "Only admins and owners can decide approvals.");

  await db.approvalRequest.update({ where: { id: approval.id }, data: { status: decision, decidedAt: new Date(), decidedById: principal.userId ?? null, decisionNote: note } });
  await recordAudit({ organizationId: principal.organization.id, contractId: approval.contractId, actorType: "USER", actorId: principal.userId, actorLabel: principal.userName, action: `approval.${decision.toLowerCase()}`, entityType: "approval_request", entityId: approval.id, title: `${approval.kind.replace(/_/g, " ").toLowerCase()} ${decision.toLowerCase()} by ${principal.userName}`, description: note, severity: "NOTICE" });

  if (decision === "REJECTED") {
    await db.$transaction(async (tx) => {
      const contract = await tx.contract.findUniqueOrThrow({ where: { id: approval.contractId } });
      if (contract.status === "AWAITING_HUMAN_REVIEW") {
        const exceeded = contract.correctionCount + 1 > (await tx.spendingPolicy.findUniqueOrThrow({ where: { organizationId: contract.organizationId } })).maxCorrectionAttempts;
        await tx.contract.update({ where: { id: contract.id }, data: { correctionCount: { increment: 1 } } });
        await transitionContract(tx, contract.id, { status: exceeded ? "VOID_PENDING" : "CORRECTION_REQUIRED", verificationState: "FAILED", actor: { type: "USER", id: principal.userId, label: principal.userName }, reason: `${principal.userName} rejected: ${note ?? "no note"}. ${exceeded ? "Correction limit reached; authorization will be voided." : "Correction requested."}`, severity: "WARNING" });
        if (!exceeded) await enqueue("work.correct", { contractId: contract.id }, { contractId: contract.id, dedupeKey: `correct:${contract.id}:human-${approval.id}` }, tx);
      }
    });
    return { outcome: "rejected" as const };
  }

  const contract = await db.contract.findUniqueOrThrow({ where: { id: approval.contractId } });
  if (["AWAITING_HUMAN_REVIEW", "ELIGIBLE_FOR_CAPTURE"].includes(contract.status)) {
    if (contract.verificationState === "NEEDS_HUMAN_REVIEW") {
      await db.$transaction((tx) => transitionContract(tx, contract.id, { verificationState: "PASSED", actor: { type: "USER", id: principal.userId, label: principal.userName }, reason: "Human reviewer accepted the verification outcome." }));
      const run = await db.verificationRun.findFirst({ where: { contractId: contract.id }, orderBy: { attempt: "desc" } });
      if (run && run.status === "NEEDS_HUMAN_REVIEW") await db.verificationRun.update({ where: { id: run.id }, data: { status: "PASSED", summary: `${run.summary ?? ""} Accepted by ${principal.userName}.`.trim() } });
    }
    const result = await capturePayment(contract.id, { type: "USER", id: principal.userId, label: principal.userName });
    return { outcome: "approved" as const, capture: result };
  }
  return { outcome: "approved" as const };
}
