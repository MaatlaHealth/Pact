import type { Job } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import type { JobType } from "@/lib/jobs/queue";
import { runNegotiation } from "@/lib/agents/negotiation";
import { runWorkerExecution } from "@/lib/agents/worker";
import { runVerifierAgent } from "@/lib/agents/verifier";
import { capturePayment, reconcileContractPayment, expireStaleAuthorizations, processWebhookEvent } from "@/lib/payments/service";
import { generateReceipt } from "@/lib/receipts/service";
import { recomputePassport } from "@/lib/passport/service";
import { sendEmail, type EmailMessage } from "@/lib/email/service";

type Handler = (payload: Record<string, unknown>, job: Job) => Promise<void>;

export const handlers: Record<JobType, Handler> = {
  "contract.generate": async () => {
    // Contract generation runs synchronously in the request so the owner can
    // review it immediately. This handler exists for API-driven async use.
  },
  "negotiation.run": async (payload) => {
    await runNegotiation(String(payload.contractId));
  },
  "work.execute": async (payload) => {
    await runWorkerExecution(String(payload.contractId), "EXECUTION");
  },
  "work.correct": async (payload) => {
    await runWorkerExecution(String(payload.contractId), "CORRECTION");
  },
  "verification.run": async (payload) => {
    await runVerifierAgent(String(payload.verificationRunId));
  },
  "payment.capture": async (payload) => {
    await capturePayment(String(payload.contractId), { type: "SYSTEM", label: "Scheduled capture" });
  },
  "payment.reconcile": async (payload) => {
    await reconcileContractPayment(String(payload.contractId));
  },
  "payment.expire_authorizations": async () => {
    const count = await expireStaleAuthorizations();
    if (count) logger.info("Expired authorizations", { count });
  },
  "receipt.generate": async (payload) => {
    await generateReceipt(String(payload.contractId));
  },
  "passport.recompute": async (payload) => {
    await recomputePassport(String(payload.agentId));
  },
  "webhook.process": async (payload) => {
    await processWebhookEvent(String(payload.webhookEventId));
  },
  "email.send": async (payload) => {
    await sendEmail(payload as unknown as EmailMessage);
  },
};

export async function runJob(job: Job): Promise<void> {
  const handler = handlers[job.type as JobType];
  if (!handler) throw new Error(`No handler for job type ${job.type}`);
  await handler((job.payload ?? {}) as Record<string, unknown>, job);
}

/** Periodic maintenance that the worker schedules for itself. */
export async function scheduleMaintenance() {
  const { enqueue } = await import("@/lib/jobs/queue");
  await enqueue("payment.expire_authorizations", {}, { dedupeKey: `expire:${new Date().toISOString().slice(0, 13)}` });
  const pending = await db.contract.findMany({ where: { paymentState: { in: ["CAPTURE_PENDING", "CAPTURE_UNCERTAIN", "VOID_PENDING"] }, updatedAt: { lt: new Date(Date.now() - 5 * 60_000) } }, select: { id: true } });
  for (const c of pending) await enqueue("payment.reconcile", { contractId: c.id }, { contractId: c.id, dedupeKey: `reconcile:${c.id}:${new Date().toISOString().slice(0, 15)}` });
}
