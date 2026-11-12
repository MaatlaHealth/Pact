import "dotenv/config";
import { hostname } from "node:os";
import { env } from "@/lib/env";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { claimNextJob, completeJob, failJob } from "@/lib/jobs/queue";
import { runJob, scheduleMaintenance } from "@/lib/jobs/handlers";

/**
 * Background worker. Runs agent executions, browser verification, payment
 * reconciliation, receipts, and maintenance. Start with `npm run worker`.
 * Several instances can run concurrently; the queue uses row locks.
 */

const workerId = env().WORKER_ID || `${hostname()}-${process.pid}`;
const POLL_MS = 1500;
const MAINTENANCE_MS = 10 * 60_000;
let stopping = false;
let inFlight = 0;

async function loop() {
  logger.info("Worker started", { workerId, lighthouse: env().LIGHTHOUSE_ENABLED });
  let lastMaintenance = 0;
  while (!stopping) {
    if (Date.now() - lastMaintenance > MAINTENANCE_MS) {
      lastMaintenance = Date.now();
      await scheduleMaintenance().catch((error) => logger.warn("Maintenance scheduling failed", { error: String(error) }));
    }
    const job = await claimNextJob(workerId).catch((error) => {
      logger.error("Failed to claim job", { error: String(error) });
      return null;
    });
    if (!job) {
      await new Promise((r) => setTimeout(r, POLL_MS));
      continue;
    }
    inFlight += 1;
    const started = Date.now();
    logger.info("Job started", { jobId: job.id, type: job.type, attempt: job.attempts });
    try {
      await runJob(job);
      await completeJob(job.id);
      logger.info("Job succeeded", { jobId: job.id, type: job.type, durationMs: Date.now() - started });
    } catch (error) {
      await failJob(job, error);
    } finally {
      inFlight -= 1;
    }
  }
}

async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  logger.info("Worker stopping", { signal, inFlight });
  const deadline = Date.now() + 30_000;
  while (inFlight > 0 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 250));
  await db.$disconnect();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

loop().catch((error) => {
  logger.error("Worker crashed", { error: String(error) });
  process.exit(1);
});
