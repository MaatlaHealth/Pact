import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/lib/db";
import { approveContract, editContract } from "@/lib/contracts/service";
import { hashCanonical } from "@/lib/contracts/canonical";
import { transitionContract } from "@/lib/contracts/transitions";
import { decide, loadPolicySnapshot } from "@/lib/policy/snapshot";
import { InvalidTransitionError } from "@/lib/policy/state-machine";
import { createOrgWithOwner, cleanupOrg, createContractWithVersion, ensureAgents } from "./fixtures";
import type { ContractContent } from "@/lib/contracts/schema";

let org: Awaited<ReturnType<typeof createOrgWithOwner>>;
let agents: Awaited<ReturnType<typeof ensureAgents>>;

beforeAll(async () => {
  org = await createOrgWithOwner("payments");
  agents = await ensureAgents();
});

afterAll(async () => {
  await cleanupOrg(org.organization.id);
});

describe("contract approval and immutability", () => {
  it("freezes the approved hash, records the decision, and queues negotiation", async () => {
    const { contract, version } = await createContractWithVersion(org.principal);
    await approveContract(org.principal, contract.id);
    const approved = await db.contract.findUniqueOrThrow({ where: { id: contract.id }, include: { approvedVersion: true } });
    expect(approved.status).toBe("NEGOTIATING");
    expect(approved.approvedHash).toBe(version.contentHash);
    expect(hashCanonical(approved.approvedVersion!.content)).toBe(version.contentHash);
    const job = await db.job.findFirst({ where: { contractId: contract.id, type: "negotiation.run" } });
    expect(job).not.toBeNull();
    const decision = await db.policyDecision.findFirst({ where: { contractId: contract.id, action: "APPROVE_CONTRACT" } });
    expect(decision?.outcome).toBe("ALLOW");
    await expect(editContract(org.principal, contract.id, { ...(version.content as unknown as ContractContent), title: "Changed after approval" })).rejects.toMatchObject({ status: 409 });
  });

  it("creates a new version with a new hash when edited before approval", async () => {
    const { contract, version, content } = await createContractWithVersion(org.principal);
    const next = await editContract(org.principal, contract.id, { ...content, title: "Edited title" });
    expect(next.version).toBe(version.version + 1);
    expect(next.contentHash).not.toBe(version.contentHash);
  });

  it("refuses approval when the policy denies it", async () => {
    const { contract } = await createContractWithVersion(org.principal, { budgetCents: 999_999 });
    await db.contract.update({ where: { id: contract.id }, data: { budgetCents: 999_999 } });
    await expect(approveContract(org.principal, contract.id)).rejects.toMatchObject({ code: "policy_denied" });
  });
});

describe("state transitions", () => {
  it("rejects invalid transitions atomically", async () => {
    const { contract } = await createContractWithVersion(org.principal);
    await expect(db.$transaction((tx) => transitionContract(tx, contract.id, { status: "CAPTURED", actor: { type: "SYSTEM" }, reason: "nope" }))).rejects.toBeInstanceOf(InvalidTransitionError);
    const unchanged = await db.contract.findUniqueOrThrow({ where: { id: contract.id } });
    expect(unchanged.status).toBe("AWAITING_APPROVAL");
  });

  it("serialises concurrent transitions with row locks so only one wins", async () => {
    const { contract } = await createContractWithVersion(org.principal);
    const attempt = () => db.$transaction((tx) => transitionContract(tx, contract.id, { status: "NEGOTIATING", actor: { type: "SYSTEM" }, reason: "race" }));
    const results = await Promise.allSettled([attempt(), attempt()]);
    const fulfilled = results.filter((r) => r.status === "fulfilled").length;
    const rejected = results.filter((r) => r.status === "rejected").length;
    expect(fulfilled).toBe(1);
    expect(rejected).toBe(1);
  });
});

describe("financial idempotency and append-only records", () => {
  it("allows only one capture operation per contract", async () => {
    const { contract } = await createContractWithVersion(org.principal);
    await db.financialOperation.create({ data: { contractId: contract.id, operation: "CAPTURE_AUTHORIZATION", idempotencyKey: `pact-capture-${contract.id}` } });
    await expect(db.financialOperation.create({ data: { contractId: contract.id, operation: "CAPTURE_AUTHORIZATION", idempotencyKey: `other-${contract.id}` } })).rejects.toMatchObject({ code: "P2002" });
  });

  it("deduplicates webhook events by PayPal event id", async () => {
    const eventId = `WH-${contract_suffix()}`;
    await db.webhookEvent.create({ data: { eventId, eventType: "PAYMENT.CAPTURE.COMPLETED", signatureVerified: true, verificationStatus: "SUCCESS", payload: {} } });
    await expect(db.webhookEvent.create({ data: { eventId, eventType: "PAYMENT.CAPTURE.COMPLETED", signatureVerified: true, verificationStatus: "SUCCESS", payload: {} } })).rejects.toMatchObject({ code: "P2002" });
    await db.webhookEvent.delete({ where: { eventId } });
  });

  it("rejects updates and deletes on evidence and policy decisions at the database level", async () => {
    const { contract } = await createContractWithVersion(org.principal);
    const decision = await db.policyDecision.create({ data: { organizationId: org.organization.id, contractId: contract.id, action: "CAPTURE_PAYMENT", outcome: "DENY", rules: [], inputSnapshot: {}, engineVersion: "test" } });
    await expect(db.policyDecision.update({ where: { id: decision.id }, data: { outcome: "ALLOW" } })).rejects.toThrow(/append-only/);
    await expect(db.policyDecision.delete({ where: { id: decision.id } })).rejects.toThrow(/append-only/);
  });
});

describe("policy snapshot from the database", () => {
  it("builds a snapshot and denies capture for an unverified contract", async () => {
    const { contract } = await createContractWithVersion(org.principal);
    await approveContract(org.principal, contract.id);
    await db.contract.update({ where: { id: contract.id }, data: { workerAgentId: agents.worker.id, verifierAgentId: agents.verifier.id, agreedAmountCents: 5500, status: "ELIGIBLE_FOR_CAPTURE", paymentState: "AUTHORIZED" } });
    const snapshot = await db.$transaction((tx) => loadPolicySnapshot(tx, contract.id, "CAPTURE_PAYMENT"));
    expect(snapshot.recomputedApprovedHash).toBe(snapshot.contract.approvedHash);
    expect(snapshot.worker?.capabilities).toContain("LANDING_PAGE");
    const decision = await db.$transaction((tx) => decide(tx, contract.id, "CAPTURE_PAYMENT"));
    expect(decision.outcome).toBe("DENY");
    expect(decision.rules.find((r) => r.id === "authorization.valid")?.passed).toBe(false);
    expect(decision.rules.find((r) => r.id === "verification.passed")?.passed).toBe(false);
    const stored = await db.policyDecision.findUnique({ where: { id: decision.decisionId } });
    expect(stored?.outcome).toBe("DENY");
  });

  it("detects content tampering after approval", async () => {
    const { contract } = await createContractWithVersion(org.principal);
    await approveContract(org.principal, contract.id);
    const approved = await db.contract.findUniqueOrThrow({ where: { id: contract.id } });
    await db.contractVersion.update({ where: { id: approved.approvedVersionId! }, data: { content: { tampered: true } } });
    const decision = await db.$transaction((tx) => decide(tx, contract.id, "START_NEGOTIATION"));
    expect(decision.outcome).toBe("DENY");
    expect(decision.rules.find((r) => r.id === "contract.hash")?.passed).toBe(false);
  });
});

function contract_suffix() {
  return Math.random().toString(36).slice(2, 10);
}
