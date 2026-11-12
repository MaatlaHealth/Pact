import { describe, it, expect } from "vitest";
import { createPrivateKey, createPublicKey } from "node:crypto";
import { generateSigningKeyPair, signBytes, verifyBytes } from "@/lib/receipts/signing";
import { canonicalize, hashCanonical } from "@/lib/contracts/canonical";
import { receiptPayloadSchema, RECEIPT_VERSION } from "@/lib/receipts/service";
import { tierFor } from "@/lib/passport/service";

const payload = {
  receiptVersion: RECEIPT_VERSION,
  receiptNumber: "POWR-20261112-ABCDEF1234",
  issuedAt: "2026-11-12T10:00:00.000Z",
  contract: { id: "c1", title: "Landing page", category: "LANDING_PAGE", approvedVersion: 1, approvedContentHash: "sha256:abc", approvedAt: "2026-11-12T09:00:00.000Z" },
  buyer: { organizationId: "o1", organizationSlug: "acme" },
  worker: { agentId: "w1", agentSlug: "atlas-web-worker", agentName: "Atlas Web Worker" },
  verifier: { agentId: "v1", agentSlug: "pact-verifier" },
  deliverable: { id: "d1", submissionNumber: 2, rootHash: "sha256:root", fileCount: 3 },
  acceptanceCriteria: [{ key: "available", kind: "OBJECTIVE", method: "HTTP_AVAILABILITY", description: "Responds 200", required: true }],
  verification: { runs: [{ id: "r1", attempt: 1, status: "FAILED", finishedAt: null, results: [{ key: "available", passed: false, score: null }], evidenceHashes: [{ id: "e1", kind: "HTTP_TRACE", hash: "sha256:e1", label: "GET /" }] }], finalRunId: "r2", finalStatus: "PASSED" },
  approvals: [],
  policy: { captureDecisionId: "p1", engineVersion: "1.0.0", outcome: "ALLOW" },
  payment: { provider: "paypal" as const, environment: "sandbox", amountCents: 5500, currency: "USD", orderId: "ORD", authorizationId: "AUTH", captureId: "CAP", captureStatus: "COMPLETED", settledAt: "2026-11-12T09:59:00.000Z" },
};

describe("receipt signing", () => {
  it("signs canonical bytes and detects tampering", () => {
    const keys = generateSigningKeyPair("test-key");
    const pair = { keyId: keys.keyId, privateKey: createPrivateKey(keys.privateKeyPem), publicKey: createPublicKey(keys.publicKeyPem), publicKeyPem: keys.publicKeyPem };
    const bytes = Buffer.from(canonicalize(payload));
    const signature = signBytes(pair, bytes);
    expect(verifyBytes(keys.publicKeyPem, bytes, signature)).toBe(true);
    const tampered = { ...payload, payment: { ...payload.payment, amountCents: 9999 } };
    expect(verifyBytes(keys.publicKeyPem, Buffer.from(canonicalize(tampered)), signature)).toBe(false);
    expect(hashCanonical(payload)).not.toBe(hashCanonical(tampered));
    const other = generateSigningKeyPair("other");
    expect(verifyBytes(other.publicKeyPem, bytes, signature)).toBe(false);
    expect(verifyBytes(keys.publicKeyPem, bytes, "not-a-signature")).toBe(false);
  });

  it("validates the receipt payload shape", () => {
    expect(receiptPayloadSchema.safeParse(payload).success).toBe(true);
    expect(receiptPayloadSchema.safeParse({ ...payload, payment: { ...payload.payment, captureId: undefined } }).success).toBe(false);
    expect(receiptPayloadSchema.safeParse({ ...payload, receiptVersion: "0.9" }).success).toBe(false);
  });
});

describe("trust passport tiers", () => {
  it("derives tiers from verified tasks and corrections only", () => {
    expect(tierFor(0, 0)).toBe("NEW");
    expect(tierFor(2, 0)).toBe("NEW");
    expect(tierFor(3, 3)).toBe("ESTABLISHED");
    expect(tierFor(3, 4)).toBe("NEW");
    expect(tierFor(10, 5)).toBe("TRUSTED");
    expect(tierFor(10, 6)).toBe("ESTABLISHED");
  });
});
