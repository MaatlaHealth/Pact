import type { Prisma, TaskCategory } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/security/request";
import { recordAudit } from "@/lib/audit";
import { hashCanonical } from "@/lib/contracts/canonical";
import { contractContentSchema, normaliseContractContent, type ContractContent } from "@/lib/contracts/schema";
import { generateContractFromObjective } from "@/lib/agents/contract-generator";
import { transitionContract } from "@/lib/contracts/transitions";
import { decide, PolicyDeniedError } from "@/lib/policy/snapshot";
import { enqueue } from "@/lib/jobs/queue";
import type { Principal } from "@/lib/auth/guards";
import type { WorkerScenario } from "@/lib/agents/worker";

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export interface CreateContractInput {
  objective: string;
  budgetCents: number;
  currency: string;
  category: TaskCategory;
  deadline?: Date | null;
  scenario?: WorkerScenario;
}

/**
 * Creates a draft contract and asks the contract generator for a structured
 * version. The owner reviews and edits before anything is approved.
 */
export async function createContractDraft(principal: Principal, input: CreateContractInput) {
  const policy = await db.spendingPolicy.findUniqueOrThrow({ where: { organizationId: principal.organization.id } });
  if (!policy.allowedCategories.includes(input.category)) throw new HttpError(422, `Category ${input.category} is not enabled in the spending policy.`);
  if (input.currency !== policy.currency) throw new HttpError(422, `This workspace transacts in ${policy.currency}.`);
  if (input.budgetCents > policy.maxTransactionAmountCents) throw new HttpError(422, `Budget exceeds the maximum transaction amount of ${policy.maxTransactionAmountCents} cents.`);

  const contract = await db.contract.create({
    data: {
      organizationId: principal.organization.id,
      createdById: principal.userId ?? (await db.membership.findFirstOrThrow({ where: { organizationId: principal.organization.id, role: "OWNER" } })).userId,
      title: input.objective.slice(0, 80),
      objective: input.objective,
      category: input.category,
      currency: input.currency,
      budgetCents: input.budgetCents,
      deadline: input.deadline ?? null,
      isDemo: principal.organization.kind === "JUDGE_DEMO",
    },
  });
  if (input.scenario && input.scenario !== "BEST_EFFORT") {
    if (principal.organization.kind !== "JUDGE_DEMO") throw new HttpError(403, "Demonstration scenarios are only available in the judge demo workspace.");
    await db.integrationSetting.create({ data: { organizationId: principal.organization.id, provider: `scenario:${contract.id}`, config: { scenario: input.scenario } } });
    await recordAudit({ organizationId: principal.organization.id, contractId: contract.id, actorType: "USER", actorId: principal.userId, actorLabel: principal.userName, action: "contract.scenario_enabled", title: "Demonstration scenario enabled: defective first draft", description: "The worker's first submission will deliberately leave the contact form unwired so judges can watch verification block the payment. All later steps are genuine.", severity: "NOTICE" });
  }
  await recordAudit({ organizationId: principal.organization.id, contractId: contract.id, actorType: "USER", actorId: principal.userId, actorLabel: principal.userName, action: "contract.created", entityType: "contract", entityId: contract.id, title: "Contract draft created", description: input.objective.slice(0, 500) });

  const generated = await generateContractFromObjective({ contractId: contract.id, objective: input.objective, budgetCents: input.budgetCents, currency: input.currency, category: input.category, policy: { requireHumanApprovalForCapture: policy.requireHumanApprovalForCapture } });
  const version = await saveVersion(contract.id, generated.content, "AI", generated.runId);
  await db.$transaction((tx) =>
    transitionContract(tx, contract.id, { status: "AWAITING_APPROVAL", data: { title: generated.content.title }, actor: { type: "AGENT", label: "Contract generator" }, reason: `Structured contract v${version.version} generated with ${generated.content.criteria.length} acceptance criteria. Awaiting owner review.` }),
  );
  return db.contract.findUniqueOrThrow({ where: { id: contract.id }, include: { versions: { orderBy: { version: "desc" }, take: 1, include: { criteria: true } } } });
}

export async function saveVersion(contractId: string, content: ContractContent, authorType: "AI" | "USER" | "NEGOTIATION", authorId: string | null) {
  const normalised = normaliseContractContent(contractContentSchema.parse(content));
  const last = await db.contractVersion.findFirst({ where: { contractId }, orderBy: { version: "desc" } });
  const version = (last?.version ?? 0) + 1;
  return db.contractVersion.create({
    data: {
      contractId,
      version,
      content: toJson(normalised),
      contentHash: hashCanonical(normalised),
      authorType,
      authorId,
      criteria: {
        create: normalised.criteria.map((c, index) => ({ key: c.key, description: c.description, kind: c.kind, method: c.method, parameters: toJson(c.parameters), required: c.required, position: index })),
      },
    },
    include: { criteria: true },
  });
}

/** Owner edits produce a new version. Approved versions are immutable. */
export async function editContract(principal: Principal, contractId: string, content: ContractContent) {
  const contract = await db.contract.findFirstOrThrow({ where: { id: contractId, organizationId: principal.organization.id } });
  if (contract.status !== "AWAITING_APPROVAL" && contract.status !== "DRAFT") throw new HttpError(409, "Only unapproved contracts can be edited.");
  const policy = await db.spendingPolicy.findUniqueOrThrow({ where: { organizationId: principal.organization.id } });
  if (content.budgetCents > policy.maxTransactionAmountCents) throw new HttpError(422, "Budget exceeds the maximum transaction amount.");
  const version = await saveVersion(contractId, content, "USER", principal.userId ?? null);
  await db.contract.update({ where: { id: contractId }, data: { title: content.title, budgetCents: content.budgetCents, currency: content.currency, deadline: content.deadline ? new Date(content.deadline) : null } });
  await recordAudit({ organizationId: principal.organization.id, contractId, actorType: "USER", actorId: principal.userId, actorLabel: principal.userName, action: "contract.edited", entityType: "contract_version", entityId: version.id, title: `Contract edited (v${version.version})`, metadata: { contentHash: version.contentHash } });
  return version;
}

/**
 * Owner approval freezes the latest version: its hash becomes the approved
 * hash that every later policy decision re-checks.
 */
export async function approveContract(principal: Principal, contractId: string) {
  const latest = await db.contractVersion.findFirst({ where: { contractId }, orderBy: { version: "desc" }, include: { criteria: true } });
  if (!latest) throw new HttpError(409, "Contract has no version to approve.");
  const recomputed = hashCanonical(latest.content);
  if (recomputed !== latest.contentHash) throw new HttpError(500, "Stored contract hash mismatch; refusing to approve.");

  await db.$transaction(async (tx) => {
    const contract = await tx.contract.findFirstOrThrow({ where: { id: contractId, organizationId: principal.organization.id } });
    if (contract.status !== "AWAITING_APPROVAL") throw new HttpError(409, "Contract is not awaiting approval.");
    await tx.contract.update({ where: { id: contractId }, data: { approvedVersionId: latest.id, approvedHash: latest.contentHash } });
    await tx.contractVersion.update({ where: { id: latest.id }, data: { approvedAt: new Date(), approvedById: principal.userId ?? null } });
    const decision = await decide(tx, contractId, "APPROVE_CONTRACT", { actorLabel: principal.userName });
    if (decision.outcome !== "ALLOW") {
      throw new PolicyDeniedError(decision);
    }
    await tx.approvalRequest.create({ data: { organizationId: principal.organization.id, contractId, kind: "CONTRACT_TERMS", status: "APPROVED", title: `Contract v${latest.version} approved`, description: `Approved hash ${latest.contentHash}.`, decidedAt: new Date(), decidedById: principal.userId ?? null } });
    await transitionContract(tx, contractId, {
      status: "NEGOTIATING",
      actor: { type: principal.kind === "user" ? "USER" : "SYSTEM", id: principal.userId, label: principal.userName },
      reason: `Owner approved contract v${latest.version} (hash ${latest.contentHash.slice(0, 23)}). Buyer agent will now find and negotiate with a worker.`,
      severity: "NOTICE",
      metadata: { approvedVersion: latest.version, approvedHash: latest.contentHash },
    });
    await enqueue("negotiation.run", { contractId }, { contractId, dedupeKey: `negotiate:${contractId}` }, tx);
  });
}

export async function cancelContract(principal: Principal, contractId: string, reason: string) {
  await db.$transaction(async (tx) => {
    const contract = await tx.contract.findFirstOrThrow({ where: { id: contractId, organizationId: principal.organization.id } });
    if (!["DRAFT", "AWAITING_APPROVAL", "NEGOTIATING", "AWAITING_PAYMENT_AUTHORIZATION"].includes(contract.status)) {
      throw new HttpError(409, "Contracts with an active authorization must be voided instead of cancelled.");
    }
    await transitionContract(tx, contractId, { status: "CANCELLED", data: { failureReason: reason }, actor: { type: "USER", id: principal.userId, label: principal.userName }, reason: `Cancelled by ${principal.userName}: ${reason}`, severity: "NOTICE" });
  });
}

export async function retryNegotiation(principal: Principal, contractId: string) {
  await db.$transaction(async (tx) => {
    const contract = await tx.contract.findFirstOrThrow({ where: { id: contractId, organizationId: principal.organization.id } });
    if (contract.status !== "NEGOTIATING") throw new HttpError(409, "Contract is not in negotiation.");
    await enqueue("negotiation.run", { contractId }, { contractId, dedupeKey: `negotiate:${contractId}:${Date.now()}` }, tx);
  });
}
