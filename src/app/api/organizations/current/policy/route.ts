import { z } from "zod";
import { handler, readJson, ok } from "@/lib/api/respond";
import { assertSameOrigin } from "@/lib/security/request";
import { requirePrincipal } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { SUPPORTED_CURRENCIES } from "@/lib/money";

const schema = z.object({
  currency: z.enum(SUPPORTED_CURRENCIES).optional(),
  maxTransactionAmountCents: z.number().int().min(100).max(10_000_000).optional(),
  monthlyBudgetCents: z.number().int().min(100).max(100_000_000).optional(),
  perAgentLimitCents: z.number().int().min(100).max(100_000_000).optional(),
  coldStartAgentLimitCents: z.number().int().min(0).max(10_000_000).optional(),
  requireHumanApprovalForCapture: z.boolean().optional(),
  humanApprovalAboveCents: z.number().int().min(0).max(100_000_000).nullable().optional(),
  subjectiveCriteriaRequireHuman: z.boolean().optional(),
  maxNegotiationRounds: z.number().int().min(1).max(10).optional(),
  maxCorrectionAttempts: z.number().int().min(0).max(10).optional(),
  allowedCategories: z.array(z.enum(["LANDING_PAGE", "JSON_DATASET"])).min(1).optional(),
  captureRateLimitPerHour: z.number().int().min(1).max(1000).optional(),
});

export const GET = handler(async (request) => {
  const principal = await requirePrincipal(request, "VIEWER");
  const policy = await db.spendingPolicy.findUniqueOrThrow({ where: { organizationId: principal.organization.id } });
  return ok({ policy });
});

export const PATCH = handler(async (request) => {
  assertSameOrigin(request);
  const principal = await requirePrincipal(request, "ADMIN");
  const input = await readJson(request, schema);
  const before = await db.spendingPolicy.findUniqueOrThrow({ where: { organizationId: principal.organization.id } });
  const policy = await db.spendingPolicy.update({ where: { organizationId: principal.organization.id }, data: input });
  const changed = Object.keys(input).filter((k) => JSON.stringify((before as Record<string, unknown>)[k]) !== JSON.stringify((policy as Record<string, unknown>)[k]));
  await recordAudit({ organizationId: principal.organization.id, actorType: "USER", actorId: principal.userId, actorLabel: principal.userName, action: "policy.updated", entityType: "spending_policy", entityId: policy.id, title: `Spending policy updated (${changed.join(", ") || "no changes"})`, severity: "NOTICE", metadata: { changed, before: Object.fromEntries(changed.map((k) => [k, (before as Record<string, unknown>)[k]])) as Record<string, string | number | boolean | null> } });
  return ok({ policy });
});
