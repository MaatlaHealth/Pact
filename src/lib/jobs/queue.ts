import type { Prisma, Job } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * PostgreSQL-backed job queue. Jobs are claimed with SELECT ... FOR UPDATE
 * SKIP LOCKED so several worker processes can run safely. Failed jobs retry
 * with exponential backoff until maxAttempts, then become DEAD for inspection.
 */

export type JobType =
  | "contract.generate"
  | "negotiation.run"
  | "work.execute"
  | "work.correct"
  | "verification.run"
  | "payment.capture"
  | "payment.reconcile"
  | "payment.expire_authorizations"
  | "receipt.generate"
  | "passport.recompute"
  | "webhook.process"
  | "email.send";

export interface EnqueueOptions {
  runAt?: Date;
  maxAttempts?: number;
  dedupeKey?: string;
  contractId?: string | null;
}

export async function enqueue(type: JobType, payload: Prisma.InputJsonValue, options: EnqueueOptions = {}, tx?: Prisma.TransactionClient): Promise<Job | null> {
  const client = tx ?? db;
  try {
    return await client.job.create({
      data: {
        type,
        payload,
        runAt: options.runAt ?? new Date(),
        maxAttempts: options.maxAttempts ?? 3,
        dedupeKey: options.dedupeKey,
        contractId: options.contractId ?? null,
      },
    });
  } catch (error) {
    if (options.dedupeKey && isUniqueViolation(error)) {
      logger.info("Job deduplicated", { type, dedupeKey: options.dedupeKey });
      return null;
    }
    throw error;
  }
}

export async function claimNextJob(workerId: string, types?: JobType[]): Promise<Job | null> {
  const staleLockCutoff = new Date(Date.now() - 15 * 60 * 1000);
  const rows = await db.$queryRaw<Job[]>`
    UPDATE jobs SET status = 'RUNNING', locked_at = NOW(), locked_by = ${workerId}, attempts = attempts + 1, updated_at = NOW()
    WHERE id = (
      SELECT id FROM jobs
      WHERE (status = 'QUEUED' AND run_at <= NOW())
         OR (status = 'RUNNING' AND locked_at < ${staleLockCutoff})
      ${types && types.length ? Prisma_sql_in(types) : Prisma_empty()}
      ORDER BY run_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING id, type, payload, status, run_at AS "runAt", attempts, max_attempts AS "maxAttempts", locked_at AS "lockedAt", locked_by AS "lockedBy", last_error AS "lastError", dedupe_key AS "dedupeKey", contract_id AS "contractId", created_at AS "createdAt", updated_at AS "updatedAt", finished_at AS "finishedAt"
  `;
  return rows[0] ?? null;
}

// Helpers to splice optional SQL fragments into the tagged template above.
import { Prisma as PrismaNs } from "@/generated/prisma/client";
function Prisma_sql_in(types: JobType[]) {
  return PrismaNs.sql`AND type IN (${PrismaNs.join(types)})`;
}
function Prisma_empty() {
  return PrismaNs.empty;
}

export async function completeJob(jobId: string) {
  await db.job.update({ where: { id: jobId }, data: { status: "SUCCEEDED", finishedAt: new Date(), lockedAt: null, lockedBy: null, dedupeKey: null } });
}

export async function failJob(job: Job, error: unknown) {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  const exhausted = job.attempts >= job.maxAttempts;
  const backoffMs = Math.min(10 * 60_000, 15_000 * 2 ** (job.attempts - 1));
  await db.job.update({
    where: { id: job.id },
    data: exhausted
      ? { status: "DEAD", lastError: message.slice(0, 4000), finishedAt: new Date(), lockedAt: null, lockedBy: null }
      : { status: "QUEUED", lastError: message.slice(0, 4000), runAt: new Date(Date.now() + backoffMs), lockedAt: null, lockedBy: null },
  });
  logger.warn(exhausted ? "Job dead" : "Job failed, will retry", { jobId: job.id, type: job.type, attempts: job.attempts, error: message });
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "P2002";
}
