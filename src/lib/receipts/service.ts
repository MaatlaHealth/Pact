import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { canonicalize, hashCanonical } from "@/lib/contracts/canonical";
import { loadSigningKeyPair, signBytes, verifyBytes } from "@/lib/receipts/signing";
import { recordAudit } from "@/lib/audit";
import { enqueue } from "@/lib/jobs/queue";
import { HttpError } from "@/lib/security/request";

export const RECEIPT_VERSION = "1.0";

/**
 * Proof of Work Receipt payload. Everything in here is portable: no secrets,
 * no email addresses, no raw PayPal responses. Identities are pseudonymous
 * platform identifiers.
 */
export const receiptPayloadSchema = z.object({
  receiptVersion: z.literal(RECEIPT_VERSION),
  receiptNumber: z.string(),
  issuedAt: z.string(),
  contract: z.object({
    id: z.string(),
    title: z.string(),
    category: z.string(),
    approvedVersion: z.number(),
    approvedContentHash: z.string(),
    approvedAt: z.string().nullable(),
  }),
  buyer: z.object({ organizationId: z.string(), organizationSlug: z.string() }),
  worker: z.object({ agentId: z.string(), agentSlug: z.string(), agentName: z.string() }),
  verifier: z.object({ agentId: z.string(), agentSlug: z.string() }),
  deliverable: z.object({ id: z.string(), submissionNumber: z.number(), rootHash: z.string(), fileCount: z.number() }),
  acceptanceCriteria: z.array(z.object({ key: z.string(), kind: z.string(), method: z.string(), description: z.string(), required: z.boolean() })),
  verification: z.object({
    runs: z.array(
      z.object({
        id: z.string(),
        attempt: z.number(),
        status: z.string(),
        finishedAt: z.string().nullable(),
        results: z.array(z.object({ key: z.string(), passed: z.boolean().nullable(), score: z.number().nullable() })),
        evidenceHashes: z.array(z.object({ id: z.string(), kind: z.string(), hash: z.string(), label: z.string() })),
      }),
    ),
    finalRunId: z.string(),
    finalStatus: z.string(),
  }),
  approvals: z.array(z.object({ kind: z.string(), status: z.string(), decidedAt: z.string().nullable() })),
  policy: z.object({ captureDecisionId: z.string().nullable(), engineVersion: z.string().nullable(), outcome: z.string().nullable() }),
  payment: z.object({
    provider: z.literal("paypal"),
    environment: z.string(),
    amountCents: z.number(),
    currency: z.string(),
    orderId: z.string(),
    authorizationId: z.string(),
    captureId: z.string(),
    captureStatus: z.string(),
    settledAt: z.string(),
  }),
});
export type ReceiptPayload = z.infer<typeof receiptPayloadSchema>;

export interface SignedReceipt {
  payload: ReceiptPayload;
  payloadHash: string;
  signature: string;
  signingKeyId: string;
  algorithm: "Ed25519";
  publicKeyPem: string;
}

function receiptNumberFor(contractId: string, settledAt: Date): string {
  const ymd = settledAt.toISOString().slice(0, 10).replace(/-/g, "");
  return `POWR-${ymd}-${contractId.replace(/-/g, "").slice(-10).toUpperCase()}`;
}

export async function generateReceipt(contractId: string): Promise<SignedReceipt> {
  const existing = await db.receipt.findUnique({ where: { contractId }, include: { signingKey: true } });
  if (existing) return toSigned(existing.payload, existing.payloadHash, existing.signature, existing.signingKeyId, existing.signingKey.publicKeyPem);

  const pair = loadSigningKeyPair();
  const contract = await db.contract.findUniqueOrThrow({
    where: { id: contractId },
    include: {
      organization: true,
      workerAgent: true,
      verifierAgent: true,
      approvedVersion: { include: { criteria: { orderBy: { position: "asc" } } } },
      deliverables: { orderBy: { submissionNumber: "desc" }, take: 1 },
      verificationRuns: { orderBy: { attempt: "asc" }, include: { results: { orderBy: { criterionKey: "asc" } }, evidence: { orderBy: { createdAt: "asc" } } } },
      approvalRequests: { orderBy: { requestedAt: "asc" } },
      policyDecisions: { where: { action: "CAPTURE_PAYMENT", outcome: "ALLOW" }, orderBy: { decidedAt: "desc" }, take: 1 },
      paypalOrder: { include: { authorizations: { include: { captures: true } } } },
    },
  });
  if (contract.paymentState !== "CAPTURED") throw new HttpError(409, "A receipt can only be issued after capture is confirmed.");
  const capture = contract.paypalOrder?.authorizations.flatMap((a) => a.captures.map((c) => ({ ...c, authorization: a }))).find((c) => c.status === "COMPLETED");
  if (!capture || !contract.paypalOrder) throw new HttpError(409, "No completed capture recorded.");
  if (!contract.workerAgent || !contract.verifierAgent || !contract.approvedVersion || contract.deliverables.length === 0) throw new HttpError(409, "Contract is missing worker, verifier, approved version, or deliverable.");
  const finalRun = [...contract.verificationRuns].reverse().find((r) => r.status === "PASSED");
  if (!finalRun) throw new HttpError(409, "No passing verification run.");

  const settledAt = capture.updatedAt ?? capture.createdAt;
  const receiptNumber = receiptNumberFor(contractId, settledAt);
  const deliverable = contract.deliverables[0];
  const manifest = deliverable.manifest as { files?: unknown[] };

  const payload: ReceiptPayload = {
    receiptVersion: RECEIPT_VERSION,
    receiptNumber,
    issuedAt: new Date().toISOString(),
    contract: {
      id: contract.id,
      title: contract.title,
      category: contract.category,
      approvedVersion: contract.approvedVersion.version,
      approvedContentHash: contract.approvedVersion.contentHash,
      approvedAt: contract.approvedVersion.approvedAt?.toISOString() ?? null,
    },
    buyer: { organizationId: contract.organization.id, organizationSlug: contract.organization.slug },
    worker: { agentId: contract.workerAgent.id, agentSlug: contract.workerAgent.slug, agentName: contract.workerAgent.name },
    verifier: { agentId: contract.verifierAgent.id, agentSlug: contract.verifierAgent.slug },
    deliverable: { id: deliverable.id, submissionNumber: deliverable.submissionNumber, rootHash: deliverable.rootHash, fileCount: Array.isArray(manifest.files) ? manifest.files.length : 0 },
    acceptanceCriteria: contract.approvedVersion.criteria.map((c) => ({ key: c.key, kind: c.kind, method: c.method, description: c.description, required: c.required })),
    verification: {
      runs: contract.verificationRuns.map((r) => ({
        id: r.id,
        attempt: r.attempt,
        status: r.status,
        finishedAt: r.finishedAt?.toISOString() ?? null,
        results: r.results.map((x) => ({ key: x.criterionKey, passed: x.passed, score: x.score })),
        evidenceHashes: r.evidence.map((e) => ({ id: e.id, kind: e.kind, hash: e.contentHash, label: e.label })),
      })),
      finalRunId: finalRun.id,
      finalStatus: finalRun.status,
    },
    approvals: contract.approvalRequests.map((a) => ({ kind: a.kind, status: a.status, decidedAt: a.decidedAt?.toISOString() ?? null })),
    policy: {
      captureDecisionId: contract.policyDecisions[0]?.id ?? null,
      engineVersion: contract.policyDecisions[0]?.engineVersion ?? null,
      outcome: contract.policyDecisions[0]?.outcome ?? null,
    },
    payment: {
      provider: "paypal",
      environment: contract.paypalOrder.environment.toLowerCase(),
      amountCents: capture.amountCents,
      currency: capture.currency,
      orderId: contract.paypalOrder.paypalOrderId,
      authorizationId: capture.authorization.paypalAuthorizationId,
      captureId: capture.paypalCaptureId,
      captureStatus: capture.status,
      settledAt: settledAt.toISOString(),
    },
  };

  const payloadHash = hashCanonical(payload);
  const signature = signBytes(pair, Buffer.from(canonicalize(payload)));

  await db.signingKey.upsert({ where: { id: pair.keyId }, create: { id: pair.keyId, publicKeyPem: pair.publicKeyPem }, update: {} });
  await db.receipt.create({
    data: {
      receiptNumber,
      contractId,
      organizationId: contract.organizationId,
      workerAgentId: contract.workerAgent.id,
      version: RECEIPT_VERSION,
      payload: payload as unknown as Prisma.InputJsonValue,
      payloadHash,
      signature,
      signingKeyId: pair.keyId,
      captureRef: capture.paypalCaptureId,
      settledAt,
    },
  });
  await recordAudit({ organizationId: contract.organizationId, contractId, actorType: "SYSTEM", actorLabel: "Receipt service", action: "receipt.issued", entityType: "receipt", entityId: receiptNumber, title: `Proof of Work Receipt ${receiptNumber} issued`, description: `Signed with ${pair.keyId}. Payload hash ${payloadHash}.`, severity: "NOTICE" });
  await enqueue("passport.recompute", { agentId: contract.workerAgent.id }, { dedupeKey: `passport:${contract.workerAgent.id}:${receiptNumber}` });
  return { payload, payloadHash, signature, signingKeyId: pair.keyId, algorithm: "Ed25519", publicKeyPem: pair.publicKeyPem };
}

function toSigned(payload: unknown, payloadHash: string, signature: string, signingKeyId: string, publicKeyPem: string): SignedReceipt {
  return { payload: payload as ReceiptPayload, payloadHash, signature, signingKeyId, algorithm: "Ed25519", publicKeyPem };
}

export interface ReceiptVerification {
  receiptNumber: string | null;
  checks: {
    structure: { ok: boolean; detail: string };
    hash: { ok: boolean; detail: string };
    signature: { ok: boolean; detail: string; keyId: string | null };
    evidence: { ok: boolean; detail: string; checked: number; mismatched: string[] };
    paymentRecord: { ok: boolean; detail: string };
  };
  /** What a valid signature does and does not prove. */
  meaning: {
    cryptographicIntegrity: boolean;
    independentTechnicalVerification: string;
    buyerApproval: string;
    paymentConfirmation: string;
  };
  valid: boolean;
}

/**
 * Verifies a receipt presented by anyone. Signature verification uses the
 * published key for the receipt's key ID. Evidence hashes are compared with
 * the platform's append-only evidence records when they exist locally.
 */
export async function verifyReceipt(input: { payload: unknown; signature: string; signingKeyId: string }): Promise<ReceiptVerification> {
  const structure = receiptPayloadSchema.safeParse(input.payload);
  const base: ReceiptVerification = {
    receiptNumber: structure.success ? structure.data.receiptNumber : null,
    checks: {
      structure: { ok: structure.success, detail: structure.success ? "Payload matches the receipt schema." : structure.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") },
      hash: { ok: false, detail: "Not checked." },
      signature: { ok: false, detail: "Not checked.", keyId: input.signingKeyId },
      evidence: { ok: false, detail: "Not checked.", checked: 0, mismatched: [] },
      paymentRecord: { ok: false, detail: "Not checked." },
    },
    meaning: {
      cryptographicIntegrity: false,
      independentTechnicalVerification: "The receipt lists which verification runs and evidence hashes existed. It does not prove the verifier's judgement was correct.",
      buyerApproval: "Approval records show which human approvals were recorded, not that the buyer was satisfied in any other sense.",
      paymentConfirmation: "Payment fields are PayPal references recorded by PACT at settlement. Confirm them against PayPal if independent proof of settlement is needed.",
    },
    valid: false,
  };
  if (!structure.success) return base;
  const payload = structure.data;

  const key = await db.signingKey.findUnique({ where: { id: input.signingKeyId } });
  const bytes = Buffer.from(canonicalize(payload));
  const computedHash = hashCanonical(payload);
  base.checks.hash = { ok: true, detail: `Canonical SHA-256 ${computedHash}.` };
  if (!key) {
    base.checks.signature = { ok: false, detail: `Unknown signing key ${input.signingKeyId}.`, keyId: input.signingKeyId };
  } else {
    const ok = verifyBytes(key.publicKeyPem, bytes, input.signature);
    base.checks.signature = { ok, detail: ok ? `Ed25519 signature valid for key ${key.id}.` : "Signature does not match the payload. The receipt was altered or not issued by this platform.", keyId: key.id };
  }

  const stored = await db.receipt.findUnique({ where: { receiptNumber: payload.receiptNumber } });
  if (stored) {
    base.checks.hash = { ok: stored.payloadHash === computedHash, detail: stored.payloadHash === computedHash ? `Hash matches the issued receipt (${computedHash}).` : `Hash differs from the issued receipt (${stored.payloadHash}).` };
  }

  const evidenceIds = payload.verification.runs.flatMap((r) => r.evidenceHashes);
  const records = await db.evidenceRecord.findMany({ where: { id: { in: evidenceIds.map((e) => e.id) } }, select: { id: true, contentHash: true } });
  const mismatched = evidenceIds.filter((e) => {
    const rec = records.find((r) => r.id === e.id);
    return !rec || rec.contentHash !== e.hash;
  });
  base.checks.evidence = {
    ok: mismatched.length === 0 && evidenceIds.length > 0,
    detail: evidenceIds.length === 0 ? "Receipt lists no evidence." : mismatched.length === 0 ? `${records.length} evidence records match their recorded hashes.` : `${mismatched.length} evidence references do not match platform records.`,
    checked: records.length,
    mismatched: mismatched.map((e) => e.id),
  };

  const capture = await db.payPalCapture.findUnique({ where: { paypalCaptureId: payload.payment.captureId } });
  base.checks.paymentRecord = {
    ok: Boolean(capture && capture.status === "COMPLETED" && capture.amountCents === payload.payment.amountCents && capture.currency === payload.payment.currency),
    detail: capture ? `Capture ${capture.paypalCaptureId} recorded as ${capture.status} for ${capture.amountCents} ${capture.currency}.` : "Capture reference not found in platform records.",
  };

  base.meaning.cryptographicIntegrity = base.checks.signature.ok && base.checks.hash.ok;
  base.valid = base.checks.structure.ok && base.checks.hash.ok && base.checks.signature.ok && base.checks.evidence.ok && base.checks.paymentRecord.ok;
  return base;
}
