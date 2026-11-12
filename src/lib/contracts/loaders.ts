import { db } from "@/lib/db";

/** Full contract view used by the API and the contract page. Raw PayPal responses are omitted. */
export async function loadContractDetail(organizationId: string, contractId: string) {
  const contract = await db.contract.findFirst({
    where: { id: contractId, organizationId },
    include: {
      versions: { orderBy: { version: "desc" }, include: { criteria: { orderBy: { position: "asc" } } } },
      buyerAgent: { select: { id: true, name: true, slug: true, role: true } },
      workerAgent: { select: { id: true, name: true, slug: true, role: true, trustPassport: true } },
      verifierAgent: { select: { id: true, name: true, slug: true, role: true } },
      deliverables: { orderBy: { submissionNumber: "desc" } },
      verificationRuns: {
        orderBy: { attempt: "desc" },
        include: {
          results: { orderBy: { criterionKey: "asc" } },
          evidence: { orderBy: { createdAt: "asc" }, select: { id: true, kind: true, label: true, mimeType: true, sizeBytes: true, contentHash: true, resultId: true, createdAt: true, metadata: true } },
        },
      },
      approvalRequests: { orderBy: { requestedAt: "desc" }, include: { decidedBy: { select: { name: true } } } },
      policyDecisions: { orderBy: { decidedAt: "desc" }, take: 30, select: { id: true, action: true, outcome: true, rules: true, engineVersion: true, decidedAt: true } },
      paypalOrder: {
        select: {
          id: true,
          environment: true,
          paypalOrderId: true,
          intent: true,
          status: true,
          amountCents: true,
          currency: true,
          approveUrl: true,
          payerEmail: true,
          createdAt: true,
          updatedAt: true,
          authorizations: { orderBy: { createdAt: "desc" }, select: { id: true, paypalAuthorizationId: true, status: true, amountCents: true, currency: true, expirationTime: true, createdAt: true, updatedAt: true, captures: { select: { paypalCaptureId: true, status: true, amountCents: true, currency: true, finalCapture: true, createdAt: true } } } },
        },
      },
      paymentEvents: { orderBy: { createdAt: "asc" } },
      financialOperations: { orderBy: { startedAt: "asc" }, select: { id: true, operation: true, status: true, idempotencyKey: true, attempts: true, lastError: true, startedAt: true, finishedAt: true } },
      receipt: { select: { receiptNumber: true, payloadHash: true, signingKeyId: true, settledAt: true, createdAt: true, captureRef: true } },
      runs: { orderBy: { createdAt: "asc" }, include: { agent: { select: { id: true, name: true, role: true, slug: true } }, toolExecutions: { orderBy: { startedAt: "asc" } } } },
      messages: { orderBy: { createdAt: "asc" }, include: { fromAgent: { select: { id: true, name: true, role: true } }, toAgent: { select: { id: true, name: true, role: true } } } },
    },
  });
  if (!contract) return null;
  const scenario = await db.integrationSetting.findUnique({ where: { organizationId_provider: { organizationId, provider: `scenario:${contractId}` } } });
  return { contract, scenario: (scenario?.config as { scenario?: string } | null)?.scenario ?? "BEST_EFFORT" };
}

export type ContractDetail = NonNullable<Awaited<ReturnType<typeof loadContractDetail>>>["contract"];
