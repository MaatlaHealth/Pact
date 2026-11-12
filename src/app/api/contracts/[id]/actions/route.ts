import { z } from "zod";
import { handler, ok, readJson } from "@/lib/api/respond";
import { assertSameOrigin, HttpError } from "@/lib/security/request";
import { requirePrincipal, requireContract } from "@/lib/auth/guards";
import { approveContract, cancelContract, retryNegotiation } from "@/lib/contracts/service";
import { createPaymentOrder, capturePayment, voidContractAuthorization, reconcileContractPayment } from "@/lib/payments/service";
import { enqueue } from "@/lib/jobs/queue";
import { db } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({
  action: z.enum(["approve", "cancel", "retry_negotiation", "create_payment_order", "capture", "void", "reconcile", "rerun_verification", "retry_work"]),
  reason: z.string().max(500).optional(),
});

/**
 * Lifecycle actions. Each one is checked by the policy engine inside the
 * service it calls; this route only authenticates and dispatches.
 */
export const POST = handler(async (request, ctx: Ctx) => {
  assertSameOrigin(request);
  const { id } = await ctx.params;
  const { action, reason } = await readJson(request, schema);
  const minimumRole = action === "capture" || action === "void" || action === "approve" || action === "create_payment_order" ? "ADMIN" : "MEMBER";
  const principal = await requirePrincipal(request, minimumRole);
  const contract = await requireContract(principal, id);
  const actor = { type: principal.kind === "user" ? ("USER" as const) : ("SYSTEM" as const), id: principal.userId, label: principal.userName };

  switch (action) {
    case "approve":
      await approveContract(principal, id);
      return ok({ status: "NEGOTIATING" });
    case "cancel":
      await cancelContract(principal, id, reason ?? "Cancelled by owner.");
      return ok({ status: "CANCELLED" });
    case "retry_negotiation":
      await retryNegotiation(principal, id);
      return ok({ queued: true });
    case "create_payment_order": {
      const result = await createPaymentOrder(id, actor);
      return ok(result);
    }
    case "capture": {
      const result = await capturePayment(id, actor);
      return ok(result);
    }
    case "void":
      await voidContractAuthorization(id, actor, reason ?? "Authorization voided by owner.");
      return ok({ status: "VOIDED" });
    case "reconcile": {
      const result = await reconcileContractPayment(id, actor);
      return ok(result);
    }
    case "rerun_verification": {
      if (contract.status !== "UNDER_VERIFICATION" && contract.verificationState !== "ERROR") throw new HttpError(409, "Verification can only be re-run for a contract that is under verification or errored.");
      const deliverable = await db.deliverable.findFirst({ where: { contractId: id }, orderBy: { submissionNumber: "desc" } });
      if (!deliverable || !contract.verifierAgentId) throw new HttpError(409, "No deliverable to verify.");
      const attempt = (await db.verificationRun.count({ where: { contractId: id } })) + 1;
      const run = await db.verificationRun.create({ data: { contractId: id, deliverableId: deliverable.id, verifierAgentId: contract.verifierAgentId, attempt } });
      await db.contract.update({ where: { id }, data: { verificationState: "QUEUED" } });
      await enqueue("verification.run", { verificationRunId: run.id, contractId: id }, { contractId: id, dedupeKey: `verify:${run.id}`, maxAttempts: 2 });
      return ok({ queued: true, verificationRunId: run.id });
    }
    case "retry_work": {
      if (!["AUTHORIZED", "CORRECTION_REQUIRED"].includes(contract.status)) throw new HttpError(409, "Work can only be retried from AUTHORIZED or CORRECTION_REQUIRED.");
      await enqueue(contract.status === "AUTHORIZED" ? "work.execute" : "work.correct", { contractId: id }, { contractId: id, dedupeKey: `work:${id}:retry-${Date.now()}` });
      return ok({ queued: true });
    }
  }
});
