import type { Prisma, PolicyAction } from "@/generated/prisma/client";
import { env } from "@/lib/env";
import { hashCanonical } from "@/lib/contracts/canonical";
import { evaluatePolicy, type PolicySnapshot, type PolicyDecisionResult } from "@/lib/policy/engine";
import { HttpError } from "@/lib/security/request";
import { recordAudit } from "@/lib/audit";

type Tx = Prisma.TransactionClient;

/**
 * Loads every fact the policy engine needs from the database. Runs inside the
 * caller's transaction so the decision and the resulting state change are
 * atomic.
 */
export async function loadPolicySnapshot(tx: Tx, contractId: string, action: PolicyAction, options: { proposedAmountCents?: number | null; now?: Date } = {}): Promise<PolicySnapshot> {
  const now = options.now ?? new Date();
  const contract = await tx.contract.findUnique({
    where: { id: contractId },
    include: {
      organization: { include: { spendingPolicy: true } },
      approvedVersion: { include: { criteria: true } },
      workerAgent: { include: { capabilities: true, trustPassport: true } },
      verifierAgent: true,
      deliverables: { orderBy: { submissionNumber: "desc" }, take: 1 },
      verificationRuns: { orderBy: { attempt: "desc" }, take: 1, include: { results: true } },
      paypalOrder: { include: { authorizations: { orderBy: { createdAt: "desc" }, include: { captures: true } } } },
      approvalRequests: true,
      runs: { where: { purpose: "NEGOTIATION" }, select: { iterations: true } },
    },
  });
  if (!contract) throw new HttpError(404, "Contract not found.");
  const policy = contract.organization.spendingPolicy;
  if (!policy) throw new HttpError(500, "Organization has no spending policy.");

  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const hourAgo = new Date(now.getTime() - 3_600_000);

  const [orgCaptures, outstanding, recentCaptures, workerCaptures] = await Promise.all([
    tx.payPalCapture.aggregate({
      _sum: { amountCents: true },
      where: { status: { in: ["COMPLETED", "PENDING"] }, createdAt: { gte: monthStart }, authorization: { order: { organizationId: contract.organizationId } } },
    }),
    tx.contract.aggregate({
      _sum: { agreedAmountCents: true },
      where: { organizationId: contract.organizationId, id: { not: contract.id }, paymentState: { in: ["AUTHORIZED", "CAPTURE_PENDING", "CAPTURE_UNCERTAIN"] } },
    }),
    tx.payPalCapture.count({ where: { createdAt: { gte: hourAgo }, authorization: { order: { organizationId: contract.organizationId } } } }),
    contract.workerAgentId
      ? tx.payPalCapture.aggregate({
          _sum: { amountCents: true },
          where: { status: { in: ["COMPLETED", "PENDING"] }, createdAt: { gte: monthStart }, authorization: { order: { contract: { workerAgentId: contract.workerAgentId } } } },
        })
      : Promise.resolve({ _sum: { amountCents: 0 } }),
  ]);

  const latestAuthorization = contract.paypalOrder?.authorizations[0] ?? null;
  const latestVerification = contract.verificationRuns[0] ?? null;
  const criteria = contract.approvedVersion?.criteria ?? [];
  const latestDeliverable = contract.deliverables[0] ?? null;
  const orderPayee = contract.paypalOrder ? extractPayee(contract.paypalOrder.createResponse) : null;

  return {
    action,
    now,
    policy: {
      currency: policy.currency,
      maxTransactionAmountCents: policy.maxTransactionAmountCents,
      monthlyBudgetCents: policy.monthlyBudgetCents,
      perAgentLimitCents: policy.perAgentLimitCents,
      coldStartAgentLimitCents: policy.coldStartAgentLimitCents,
      requireHumanApprovalForCapture: policy.requireHumanApprovalForCapture,
      humanApprovalAboveCents: policy.humanApprovalAboveCents,
      subjectiveCriteriaRequireHuman: policy.subjectiveCriteriaRequireHuman,
      maxNegotiationRounds: policy.maxNegotiationRounds,
      maxCorrectionAttempts: policy.maxCorrectionAttempts,
      allowedCategories: policy.allowedCategories,
      captureRateLimitPerHour: policy.captureRateLimitPerHour,
    },
    contract: {
      id: contract.id,
      status: contract.status,
      paymentState: contract.paymentState,
      currency: contract.currency,
      budgetCents: contract.budgetCents,
      agreedAmountCents: contract.agreedAmountCents,
      category: contract.category,
      correctionCount: contract.correctionCount,
      approvedHash: contract.approvedHash,
      approvedVersionId: contract.approvedVersionId,
      workerAgentId: contract.workerAgentId,
      verifierAgentId: contract.verifierAgentId,
      buyerAgentId: contract.buyerAgentId,
      deadline: contract.deadline,
    },
    recomputedApprovedHash: contract.approvedVersion ? hashCanonical(contract.approvedVersion.content) : null,
    criteria: criteria.map((c) => ({ key: c.key, kind: c.kind, required: c.required })),
    latestDeliverable: latestDeliverable ? { id: latestDeliverable.id, rootHash: latestDeliverable.rootHash, submissionNumber: latestDeliverable.submissionNumber } : null,
    latestVerification: latestVerification
      ? {
          id: latestVerification.id,
          deliverableId: latestVerification.deliverableId,
          status: latestVerification.status,
          attempt: latestVerification.attempt,
          results: latestVerification.results.map((r) => {
            const c = criteria.find((x) => x.key === r.criterionKey);
            return { key: r.criterionKey, kind: c?.kind ?? "OBJECTIVE", required: c?.required ?? true, passed: r.passed };
          }),
        }
      : null,
    worker: contract.workerAgent
      ? {
          id: contract.workerAgent.id,
          status: contract.workerAgent.status,
          capabilities: contract.workerAgent.capabilities.map((c) => c.category),
          passportTier: contract.workerAgent.trustPassport?.tier ?? "NEW",
          capturedThisMonthCents: workerCaptures._sum.amountCents ?? 0,
        }
      : null,
    verifier: contract.verifierAgent ? { id: contract.verifierAgent.id, isPlatformAgent: contract.verifierAgent.isPlatformAgent } : null,
    spending: {
      capturedThisMonthCents: orgCaptures._sum.amountCents ?? 0,
      authorizedOutstandingCents: outstanding._sum.agreedAmountCents ?? 0,
      capturesLastHour: recentCaptures,
    },
    authorization: latestAuthorization
      ? {
          paypalAuthorizationId: latestAuthorization.paypalAuthorizationId,
          status: latestAuthorization.status,
          amountCents: latestAuthorization.amountCents,
          currency: latestAuthorization.currency,
          createdAt: latestAuthorization.createdAt,
          expirationTime: latestAuthorization.expirationTime,
        }
      : null,
    existingCaptures: (latestAuthorization?.captures ?? []).map((c) => ({ paypalCaptureId: c.paypalCaptureId, status: c.status })),
    approvals: contract.approvalRequests.map((a) => ({
      kind: a.kind,
      status: a.status,
      verificationRunId: (a.context as { verificationRunId?: string } | null)?.verificationRunId ?? null,
    })),
    negotiationRounds: contract.runs.reduce((acc, r) => acc + r.iterations, 0),
    proposedAmountCents: options.proposedAmountCents ?? null,
    recipient: { configuredPayee: env().PAYPAL_PAYEE_EMAIL ?? null, orderPayee },
  };
}

function extractPayee(createResponse: unknown): string | null {
  const order = createResponse as { purchase_units?: { payee?: { email_address?: string } }[] } | null;
  return order?.purchase_units?.[0]?.payee?.email_address ?? null;
}

/**
 * Evaluates and persists a policy decision inside the caller's transaction.
 * The returned decision includes every rule so the UI can explain it.
 */
export async function decide(tx: Tx, contractId: string, action: PolicyAction, options: { proposedAmountCents?: number | null; actorLabel?: string } = {}): Promise<PolicyDecisionResult & { decisionId: string }> {
  const snapshot = await loadPolicySnapshot(tx, contractId, action, options);
  const result = evaluatePolicy(snapshot);
  const contract = await tx.contract.findUniqueOrThrow({ where: { id: contractId }, select: { organizationId: true } });
  const record = await tx.policyDecision.create({
    data: {
      organizationId: contract.organizationId,
      contractId,
      action,
      outcome: result.outcome,
      rules: result.rules as unknown as Prisma.InputJsonValue,
      inputSnapshot: JSON.parse(JSON.stringify(snapshot)) as Prisma.InputJsonValue,
      engineVersion: result.engineVersion,
    },
  });
  await recordAudit(
    {
      organizationId: contract.organizationId,
      contractId,
      actorType: "SYSTEM",
      actorLabel: "Policy engine",
      action: `policy.${action.toLowerCase()}`,
      entityType: "policy_decision",
      entityId: record.id,
      title: `Policy ${result.outcome.replace(/_/g, " ").toLowerCase()} for ${action.replace(/_/g, " ").toLowerCase()}`,
      description: result.summary,
      severity: result.outcome === "DENY" ? "WARNING" : "INFO",
      metadata: { outcome: result.outcome, failedRules: result.rules.filter((r) => !r.passed).map((r) => r.id) },
    },
    tx,
  );
  return { ...result, decisionId: record.id };
}

export class PolicyDeniedError extends HttpError {
  decision: PolicyDecisionResult;
  constructor(decision: PolicyDecisionResult) {
    super(409, decision.summary, decision.outcome === "DENY" ? "policy_denied" : "human_approval_required", {
      outcome: decision.outcome,
      rules: decision.rules.filter((r) => !r.passed),
    });
    this.decision = decision;
  }
}
