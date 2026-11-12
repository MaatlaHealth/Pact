import { describe, it, expect } from "vitest";
import { assertContractTransition, assertPaymentTransition, assertVerificationTransition, canTransitionContract, CONTRACT_TRANSITIONS, InvalidTransitionError } from "@/lib/policy/state-machine";

describe("contract state machine", () => {
  it("accepts the happy path", () => {
    const path = ["DRAFT", "AWAITING_APPROVAL", "NEGOTIATING", "AWAITING_PAYMENT_AUTHORIZATION", "AUTHORIZED", "IN_PROGRESS", "UNDER_VERIFICATION", "CORRECTION_REQUIRED", "IN_PROGRESS", "UNDER_VERIFICATION", "ELIGIBLE_FOR_CAPTURE", "CAPTURE_PENDING", "CAPTURED"] as const;
    for (let i = 1; i < path.length; i += 1) expect(() => assertContractTransition(path[i - 1], path[i])).not.toThrow();
  });

  it("rejects skipping verification", () => {
    expect(() => assertContractTransition("IN_PROGRESS", "CAPTURED")).toThrow(InvalidTransitionError);
    expect(() => assertContractTransition("AUTHORIZED", "ELIGIBLE_FOR_CAPTURE")).toThrow(InvalidTransitionError);
  });

  it("rejects leaving terminal states", () => {
    for (const s of ["VOIDED", "EXPIRED", "FAILED", "CANCELLED"] as const) {
      expect(CONTRACT_TRANSITIONS[s]).toHaveLength(0);
      expect(canTransitionContract(s, "AUTHORIZED")).toBe(false);
    }
  });

  it("only allows dispute from captured or human review", () => {
    expect(canTransitionContract("CAPTURED", "DISPUTED")).toBe(true);
    expect(canTransitionContract("AWAITING_HUMAN_REVIEW", "DISPUTED")).toBe(true);
    expect(canTransitionContract("IN_PROGRESS", "DISPUTED")).toBe(false);
  });
});

describe("payment state machine", () => {
  it("never reports an order as authorized without the payer step", () => {
    expect(() => assertPaymentTransition("NONE", "AUTHORIZED")).toThrow();
    expect(() => assertPaymentTransition("ORDER_CREATED", "CAPTURED")).toThrow();
  });

  it("handles uncertain captures", () => {
    expect(() => assertPaymentTransition("CAPTURE_PENDING", "CAPTURE_UNCERTAIN")).not.toThrow();
    expect(() => assertPaymentTransition("CAPTURE_UNCERTAIN", "CAPTURED")).not.toThrow();
    expect(() => assertPaymentTransition("CAPTURE_UNCERTAIN", "AUTHORIZED")).not.toThrow();
  });

  it("treats captured as terminal", () => {
    expect(() => assertPaymentTransition("CAPTURED", "AUTHORIZED")).toThrow();
    expect(() => assertPaymentTransition("CAPTURED", "VOID_PENDING")).toThrow();
  });
});

describe("verification state machine", () => {
  it("allows re-verification after failure and after pass", () => {
    expect(() => assertVerificationTransition("FAILED", "QUEUED")).not.toThrow();
    expect(() => assertVerificationTransition("PASSED", "QUEUED")).not.toThrow();
    expect(() => assertVerificationTransition("NOT_STARTED", "PASSED")).toThrow();
  });
});
