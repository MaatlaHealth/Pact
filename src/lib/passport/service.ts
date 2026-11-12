import type { Prisma, PassportTier } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/audit";

/**
 * Trust Passport computation. Every number is derived from signed receipts
 * and recorded verification runs. There is no manual override and no way to
 * import external history.
 */

export const PASSPORT_RULES = {
  ESTABLISHED: { minVerifiedTasks: 3, maxCorrectionRatio: 1.0 },
  TRUSTED: { minVerifiedTasks: 10, maxCorrectionRatio: 0.5 },
} as const;

export function tierFor(verifiedTaskCount: number, correctionCount: number): PassportTier {
  const ratio = verifiedTaskCount === 0 ? 0 : correctionCount / verifiedTaskCount;
  if (verifiedTaskCount >= PASSPORT_RULES.TRUSTED.minVerifiedTasks && ratio <= PASSPORT_RULES.TRUSTED.maxCorrectionRatio) return "TRUSTED";
  if (verifiedTaskCount >= PASSPORT_RULES.ESTABLISHED.minVerifiedTasks && ratio <= PASSPORT_RULES.ESTABLISHED.maxCorrectionRatio) return "ESTABLISHED";
  return "NEW";
}

export async function recomputePassport(agentId: string) {
  const [receipts, runs] = await Promise.all([
    db.receipt.findMany({ where: { workerAgentId: agentId }, include: { contract: { select: { category: true, correctionCount: true } } }, orderBy: { settledAt: "asc" } }),
    db.verificationRun.findMany({ where: { contract: { workerAgentId: agentId }, status: { in: ["PASSED", "FAILED"] } }, select: { status: true, results: { select: { method: true, passed: true } } } }),
  ]);

  const completedValueByCurrency: Record<string, number> = {};
  const categories: Record<string, number> = {};
  let correctionCount = 0;
  for (const r of receipts) {
    const payload = r.payload as { payment: { amountCents: number; currency: string } };
    completedValueByCurrency[payload.payment.currency] = (completedValueByCurrency[payload.payment.currency] ?? 0) + payload.payment.amountCents;
    categories[r.contract.category] = (categories[r.contract.category] ?? 0) + 1;
    correctionCount += r.contract.correctionCount;
  }
  const failedVerificationCount = runs.filter((r) => r.status === "FAILED").length;
  const methods = Array.from(new Set(runs.flatMap((r) => r.results.filter((x) => x.passed).map((x) => x.method)))).sort();
  const verifiedTaskCount = receipts.length;
  const tier = tierFor(verifiedTaskCount, correctionCount);

  const previous = await db.trustPassport.findUnique({ where: { agentId } });
  const passport = await db.trustPassport.upsert({
    where: { agentId },
    create: {
      agentId,
      tier,
      verifiedTaskCount,
      successfulDeliveryCount: verifiedTaskCount,
      correctionCount,
      failedVerificationCount,
      completedValueByCurrency: completedValueByCurrency as Prisma.InputJsonValue,
      categories: categories as Prisma.InputJsonValue,
      verificationMethods: methods as Prisma.InputJsonValue,
      receiptNumbers: receipts.map((r) => r.receiptNumber),
      firstVerifiedAt: receipts[0]?.settledAt ?? null,
      lastVerifiedAt: receipts[receipts.length - 1]?.settledAt ?? null,
    },
    update: {
      tier,
      verifiedTaskCount,
      successfulDeliveryCount: verifiedTaskCount,
      correctionCount,
      failedVerificationCount,
      completedValueByCurrency: completedValueByCurrency as Prisma.InputJsonValue,
      categories: categories as Prisma.InputJsonValue,
      verificationMethods: methods as Prisma.InputJsonValue,
      receiptNumbers: receipts.map((r) => r.receiptNumber),
      firstVerifiedAt: receipts[0]?.settledAt ?? null,
      lastVerifiedAt: receipts[receipts.length - 1]?.settledAt ?? null,
      computedAt: new Date(),
    },
  });
  if (!previous || previous.tier !== tier || previous.verifiedTaskCount !== verifiedTaskCount) {
    await recordAudit({ actorType: "SYSTEM", actorLabel: "Trust Passport", action: "passport.recomputed", entityType: "agent", entityId: agentId, title: `Trust Passport updated: ${verifiedTaskCount} verified tasks, tier ${tier}`, metadata: { tier, verifiedTaskCount, correctionCount, failedVerificationCount } });
  }
  return passport;
}
