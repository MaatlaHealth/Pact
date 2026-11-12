import { describe, it, expect } from "vitest";
import { evaluatePolicy, type PolicySnapshot } from "@/lib/policy/engine";

function baseSnapshot(overrides: Partial<PolicySnapshot> = {}): PolicySnapshot {
  const now = new Date("2026-11-12T10:00:00Z");
  return {
    action: "CAPTURE_PAYMENT",
    now,
    policy: {
      currency: "USD",
      maxTransactionAmountCents: 10000,
      monthlyBudgetCents: 50000,
      perAgentLimitCents: 25000,
      coldStartAgentLimitCents: 7500,
      requireHumanApprovalForCapture: false,
      humanApprovalAboveCents: null,
      subjectiveCriteriaRequireHuman: true,
      maxNegotiationRounds: 4,
      maxCorrectionAttempts: 3,
      allowedCategories: ["LANDING_PAGE", "JSON_DATASET"],
      captureRateLimitPerHour: 20,
    },
    contract: {
      id: "c1",
      status: "ELIGIBLE_FOR_CAPTURE",
      paymentState: "AUTHORIZED",
      currency: "USD",
      budgetCents: 6000,
      agreedAmountCents: 5500,
      category: "LANDING_PAGE",
      correctionCount: 1,
      approvedHash: "sha256:abc",
      approvedVersionId: "v1",
      workerAgentId: "w1",
      verifierAgentId: "ver1",
      buyerAgentId: "b1",
      deadline: null,
    },
    recomputedApprovedHash: "sha256:abc",
    criteria: [
      { key: "available", kind: "OBJECTIVE", required: true },
      { key: "form", kind: "OBJECTIVE", required: true },
    ],
    latestDeliverable: { id: "d2", rootHash: "sha256:root", submissionNumber: 2 },
    latestVerification: {
      id: "run2",
      deliverableId: "d2",
      status: "PASSED",
      attempt: 2,
      results: [
        { key: "available", kind: "OBJECTIVE", required: true, passed: true },
        { key: "form", kind: "OBJECTIVE", required: true, passed: true },
      ],
    },
    worker: { id: "w1", status: "ACTIVE", capabilities: ["LANDING_PAGE"], passportTier: "ESTABLISHED", capturedThisMonthCents: 0 },
    verifier: { id: "ver1", isPlatformAgent: true },
    spending: { capturedThisMonthCents: 0, authorizedOutstandingCents: 0, capturesLastHour: 0 },
    authorization: { paypalAuthorizationId: "AUTH1", status: "CREATED", amountCents: 5500, currency: "USD", createdAt: new Date("2026-11-11T10:00:00Z"), expirationTime: new Date("2026-12-10T10:00:00Z") },
    existingCaptures: [],
    approvals: [],
    negotiationRounds: 2,
    proposedAmountCents: null,
    recipient: { configuredPayee: null, orderPayee: null },
    ...overrides,
  };
}

describe("policy engine: capture", () => {
  it("allows capture when every rule passes", () => {
    const result = evaluatePolicy(baseSnapshot());
    expect(result.outcome).toBe("ALLOW");
    expect(result.rules.every((r) => r.passed)).toBe(true);
  });

  it("denies capture when verification failed", () => {
    const s = baseSnapshot();
    s.latestVerification!.status = "FAILED";
    s.latestVerification!.results[1].passed = false;
    const result = evaluatePolicy(s);
    expect(result.outcome).toBe("DENY");
    expect(result.rules.find((r) => r.id === "verification.passed")?.passed).toBe(false);
    expect(result.rules.find((r) => r.id === "verification.objective")?.passed).toBe(false);
  });

  it("denies capture when a required objective criterion has no tool-backed pass", () => {
    const s = baseSnapshot();
    s.latestVerification!.results[0].passed = null;
    const result = evaluatePolicy(s);
    expect(result.outcome).toBe("DENY");
    expect(result.rules.find((r) => r.id === "verification.objective")?.detail).toContain("available");
  });

  it("denies capture when the approved contract hash no longer matches", () => {
    const result = evaluatePolicy(baseSnapshot({ recomputedApprovedHash: "sha256:tampered" }));
    expect(result.outcome).toBe("DENY");
    expect(result.rules.find((r) => r.id === "contract.hash")?.passed).toBe(false);
  });

  it("denies a second capture", () => {
    const result = evaluatePolicy(baseSnapshot({ existingCaptures: [{ paypalCaptureId: "CAP1", status: "COMPLETED" }] }));
    expect(result.outcome).toBe("DENY");
    expect(result.rules.find((r) => r.id === "capture.duplicate")?.passed).toBe(false);
  });

  it("denies capture when the authorization expired", () => {
    const s = baseSnapshot();
    s.authorization!.expirationTime = new Date("2026-11-01T00:00:00Z");
    expect(evaluatePolicy(s).outcome).toBe("DENY");
  });

  it("denies capture when the authorized amount differs from the agreed amount", () => {
    const s = baseSnapshot();
    s.authorization!.amountCents = 6000;
    const result = evaluatePolicy(s);
    expect(result.outcome).toBe("DENY");
    expect(result.rules.find((r) => r.id === "authorization.amount")?.passed).toBe(false);
  });

  it("denies capture that would exceed the monthly budget", () => {
    const result = evaluatePolicy(baseSnapshot({ spending: { capturedThisMonthCents: 46000, authorizedOutstandingCents: 0, capturesLastHour: 0 } }));
    expect(result.outcome).toBe("DENY");
    expect(result.rules.find((r) => r.id === "budget.monthly")?.passed).toBe(false);
  });

  it("denies capture when verification covers an older deliverable", () => {
    const result = evaluatePolicy(baseSnapshot({ latestDeliverable: { id: "d3", rootHash: "sha256:new", submissionNumber: 3 } }));
    expect(result.outcome).toBe("DENY");
    expect(result.rules.find((r) => r.id === "verification.current")?.passed).toBe(false);
  });

  it("denies capture when the verifier is the worker", () => {
    const result = evaluatePolicy(baseSnapshot({ verifier: { id: "w1", isPlatformAgent: true } }));
    expect(result.outcome).toBe("DENY");
  });

  it("denies capture when the payee differs from the configured recipient", () => {
    const result = evaluatePolicy(baseSnapshot({ recipient: { configuredPayee: "merchant@example.com", orderPayee: "attacker@example.com" } }));
    expect(result.outcome).toBe("DENY");
    expect(result.rules.find((r) => r.id === "recipient.permitted")?.passed).toBe(false);
  });

  it("requires human approval when the policy demands it and none is recorded", () => {
    const s = baseSnapshot();
    s.policy.requireHumanApprovalForCapture = true;
    const result = evaluatePolicy(s);
    expect(result.outcome).toBe("REQUIRE_HUMAN_APPROVAL");
    s.approvals = [{ kind: "CAPTURE", status: "APPROVED", verificationRunId: "run2" }];
    expect(evaluatePolicy(s).outcome).toBe("ALLOW");
  });

  it("ignores a capture approval tied to an older verification run", () => {
    const s = baseSnapshot();
    s.policy.requireHumanApprovalForCapture = true;
    s.approvals = [{ kind: "CAPTURE", status: "APPROVED", verificationRunId: "run1" }];
    expect(evaluatePolicy(s).outcome).toBe("REQUIRE_HUMAN_APPROVAL");
  });

  it("requires human approval for subjective criteria when configured", () => {
    const s = baseSnapshot();
    s.criteria.push({ key: "design", kind: "SUBJECTIVE", required: true });
    s.latestVerification!.results.push({ key: "design", kind: "SUBJECTIVE", required: true, passed: true });
    expect(evaluatePolicy(s).outcome).toBe("REQUIRE_HUMAN_APPROVAL");
    s.policy.subjectiveCriteriaRequireHuman = false;
    expect(evaluatePolicy(s).outcome).toBe("ALLOW");
  });

  it("requires human approval for a NEW worker above the cold-start limit", () => {
    const s = baseSnapshot();
    s.worker!.passportTier = "NEW";
    s.contract.agreedAmountCents = 8000;
    s.authorization!.amountCents = 8000;
    s.contract.budgetCents = 9000;
    expect(evaluatePolicy(s).outcome).toBe("REQUIRE_HUMAN_APPROVAL");
    s.contract.agreedAmountCents = 7000;
    s.authorization!.amountCents = 7000;
    expect(evaluatePolicy(s).outcome).toBe("ALLOW");
  });

  it("denies when the capture rate limit is reached", () => {
    const result = evaluatePolicy(baseSnapshot({ spending: { capturedThisMonthCents: 0, authorizedOutstandingCents: 0, capturesLastHour: 20 } }));
    expect(result.outcome).toBe("DENY");
  });

  it("deny takes precedence over human approval", () => {
    const s = baseSnapshot();
    s.policy.requireHumanApprovalForCapture = true;
    s.existingCaptures = [{ paypalCaptureId: "CAP1", status: "COMPLETED" }];
    expect(evaluatePolicy(s).outcome).toBe("DENY");
  });
});

describe("policy engine: other actions", () => {
  it("blocks accepting negotiated terms above budget", () => {
    const s = baseSnapshot({ action: "ACCEPT_NEGOTIATED_TERMS", proposedAmountCents: 6500 });
    s.contract.status = "NEGOTIATING";
    const result = evaluatePolicy(s);
    expect(result.outcome).toBe("DENY");
    expect(result.rules.find((r) => r.id === "amount.within_budget")?.passed).toBe(false);
  });

  it("allows accepting negotiated terms within budget", () => {
    const s = baseSnapshot({ action: "ACCEPT_NEGOTIATED_TERMS", proposedAmountCents: 5000 });
    s.contract.status = "NEGOTIATING";
    expect(evaluatePolicy(s).outcome).toBe("ALLOW");
  });

  it("blocks creating a payment order for a disallowed category", () => {
    const s = baseSnapshot({ action: "CREATE_PAYMENT_ORDER" });
    s.contract.status = "AWAITING_PAYMENT_AUTHORIZATION";
    s.contract.paymentState = "NONE";
    s.policy.allowedCategories = ["JSON_DATASET"];
    expect(evaluatePolicy(s).outcome).toBe("DENY");
  });

  it("blocks work after the correction limit", () => {
    const s = baseSnapshot({ action: "START_WORK" });
    s.contract.status = "CORRECTION_REQUIRED";
    s.contract.correctionCount = 4;
    expect(evaluatePolicy(s).outcome).toBe("DENY");
  });

  it("requires at least one objective criterion to approve a contract", () => {
    const s = baseSnapshot({ action: "APPROVE_CONTRACT", criteria: [{ key: "vibe", kind: "SUBJECTIVE", required: true }] });
    s.contract.status = "AWAITING_APPROVAL";
    expect(evaluatePolicy(s).outcome).toBe("DENY");
  });

  it("allows voiding an authorization that has no capture", () => {
    const s = baseSnapshot({ action: "VOID_AUTHORIZATION" });
    s.contract.status = "IN_PROGRESS";
    expect(evaluatePolicy(s).outcome).toBe("ALLOW");
    s.existingCaptures = [{ paypalCaptureId: "CAP1", status: "COMPLETED" }];
    expect(evaluatePolicy(s).outcome).toBe("DENY");
  });
});
