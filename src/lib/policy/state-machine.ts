import type { ContractStatus, PaymentState, VerificationState } from "@/generated/prisma/client";

/**
 * Explicit state machines for the three domains. Every transition in the
 * application goes through assertTransition so an invalid move throws before
 * anything is written.
 */

export const CONTRACT_TRANSITIONS: Record<ContractStatus, ContractStatus[]> = {
  DRAFT: ["AWAITING_APPROVAL", "CANCELLED"],
  AWAITING_APPROVAL: ["DRAFT", "NEGOTIATING", "CANCELLED"],
  NEGOTIATING: ["AWAITING_PAYMENT_AUTHORIZATION", "FAILED", "CANCELLED"],
  AWAITING_PAYMENT_AUTHORIZATION: ["AUTHORIZED", "FAILED", "CANCELLED", "EXPIRED"],
  AUTHORIZED: ["IN_PROGRESS", "VOID_PENDING", "EXPIRED", "FAILED"],
  IN_PROGRESS: ["UNDER_VERIFICATION", "VOID_PENDING", "EXPIRED", "FAILED"],
  UNDER_VERIFICATION: ["CORRECTION_REQUIRED", "AWAITING_HUMAN_REVIEW", "ELIGIBLE_FOR_CAPTURE", "VOID_PENDING", "FAILED", "EXPIRED"],
  CORRECTION_REQUIRED: ["IN_PROGRESS", "VOID_PENDING", "FAILED", "EXPIRED"],
  AWAITING_HUMAN_REVIEW: ["ELIGIBLE_FOR_CAPTURE", "CORRECTION_REQUIRED", "VOID_PENDING", "DISPUTED", "EXPIRED"],
  ELIGIBLE_FOR_CAPTURE: ["CAPTURE_PENDING", "AWAITING_HUMAN_REVIEW", "VOID_PENDING", "EXPIRED"],
  CAPTURE_PENDING: ["CAPTURED", "ELIGIBLE_FOR_CAPTURE", "FAILED"],
  CAPTURED: ["DISPUTED"],
  VOID_PENDING: ["VOIDED", "AUTHORIZED", "FAILED"],
  VOIDED: [],
  EXPIRED: [],
  DISPUTED: ["CAPTURED", "FAILED"],
  FAILED: [],
  CANCELLED: [],
};

export const PAYMENT_TRANSITIONS: Record<PaymentState, PaymentState[]> = {
  NONE: ["ORDER_CREATED"],
  ORDER_CREATED: ["AWAITING_PAYER_APPROVAL", "PAYER_APPROVED", "FAILED", "EXPIRED"],
  AWAITING_PAYER_APPROVAL: ["PAYER_APPROVED", "AUTHORIZED", "FAILED", "EXPIRED"],
  PAYER_APPROVED: ["AUTHORIZED", "DENIED", "FAILED"],
  AUTHORIZED: ["CAPTURE_PENDING", "VOID_PENDING", "EXPIRED", "DENIED"],
  CAPTURE_PENDING: ["CAPTURED", "CAPTURE_UNCERTAIN", "AUTHORIZED", "FAILED", "DENIED"],
  CAPTURE_UNCERTAIN: ["CAPTURED", "AUTHORIZED", "FAILED"],
  CAPTURED: [],
  VOID_PENDING: ["VOIDED", "AUTHORIZED", "FAILED"],
  VOIDED: [],
  EXPIRED: [],
  DENIED: [],
  FAILED: [],
};

export const VERIFICATION_TRANSITIONS: Record<VerificationState, VerificationState[]> = {
  NOT_STARTED: ["QUEUED"],
  QUEUED: ["RUNNING", "ERROR"],
  RUNNING: ["PASSED", "FAILED", "NEEDS_HUMAN_REVIEW", "ERROR"],
  PASSED: ["QUEUED"],
  FAILED: ["QUEUED"],
  NEEDS_HUMAN_REVIEW: ["PASSED", "FAILED", "QUEUED"],
  ERROR: ["QUEUED"],
};

export class InvalidTransitionError extends Error {
  domain: string;
  from: string;
  to: string;
  constructor(domain: string, from: string, to: string) {
    super(`Invalid ${domain} transition ${from} -> ${to}`);
    this.name = "InvalidTransitionError";
    this.domain = domain;
    this.from = from;
    this.to = to;
  }
}

export function canTransitionContract(from: ContractStatus, to: ContractStatus): boolean {
  return CONTRACT_TRANSITIONS[from].includes(to);
}

export function canTransitionPayment(from: PaymentState, to: PaymentState): boolean {
  return PAYMENT_TRANSITIONS[from].includes(to);
}

export function canTransitionVerification(from: VerificationState, to: VerificationState): boolean {
  return VERIFICATION_TRANSITIONS[from].includes(to);
}

export function assertContractTransition(from: ContractStatus, to: ContractStatus): void {
  if (!canTransitionContract(from, to)) throw new InvalidTransitionError("contract", from, to);
}

export function assertPaymentTransition(from: PaymentState, to: PaymentState): void {
  if (!canTransitionPayment(from, to)) throw new InvalidTransitionError("payment", from, to);
}

export function assertVerificationTransition(from: VerificationState, to: VerificationState): void {
  if (!canTransitionVerification(from, to)) throw new InvalidTransitionError("verification", from, to);
}

export const TERMINAL_CONTRACT_STATUSES: ContractStatus[] = ["VOIDED", "EXPIRED", "FAILED", "CANCELLED"];
export const ACTIVE_CONTRACT_STATUSES: ContractStatus[] = [
  "NEGOTIATING",
  "AWAITING_PAYMENT_AUTHORIZATION",
  "AUTHORIZED",
  "IN_PROGRESS",
  "UNDER_VERIFICATION",
  "CORRECTION_REQUIRED",
  "AWAITING_HUMAN_REVIEW",
  "ELIGIBLE_FOR_CAPTURE",
  "CAPTURE_PENDING",
];
export const VOIDABLE_CONTRACT_STATUSES: ContractStatus[] = [
  "AUTHORIZED",
  "IN_PROGRESS",
  "UNDER_VERIFICATION",
  "CORRECTION_REQUIRED",
  "AWAITING_HUMAN_REVIEW",
  "ELIGIBLE_FOR_CAPTURE",
];

export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  DRAFT: "Draft",
  AWAITING_APPROVAL: "Awaiting approval",
  NEGOTIATING: "Negotiating",
  AWAITING_PAYMENT_AUTHORIZATION: "Awaiting payment authorization",
  AUTHORIZED: "Authorized",
  IN_PROGRESS: "In progress",
  UNDER_VERIFICATION: "Under verification",
  CORRECTION_REQUIRED: "Correction required",
  AWAITING_HUMAN_REVIEW: "Awaiting human review",
  ELIGIBLE_FOR_CAPTURE: "Eligible for capture",
  CAPTURE_PENDING: "Capture pending",
  CAPTURED: "Captured",
  VOID_PENDING: "Void pending",
  VOIDED: "Voided",
  EXPIRED: "Expired",
  DISPUTED: "Disputed",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
};

export const PAYMENT_STATE_LABELS: Record<PaymentState, string> = {
  NONE: "No payment",
  ORDER_CREATED: "Order created",
  AWAITING_PAYER_APPROVAL: "Awaiting payer approval",
  PAYER_APPROVED: "Payer approved",
  AUTHORIZED: "Authorized",
  CAPTURE_PENDING: "Capture pending",
  CAPTURE_UNCERTAIN: "Capture outcome uncertain",
  CAPTURED: "Captured",
  VOID_PENDING: "Void pending",
  VOIDED: "Voided",
  EXPIRED: "Expired",
  DENIED: "Denied",
  FAILED: "Failed",
};

export const VERIFICATION_STATE_LABELS: Record<VerificationState, string> = {
  NOT_STARTED: "Not started",
  QUEUED: "Queued",
  RUNNING: "Running",
  PASSED: "Passed",
  FAILED: "Failed",
  NEEDS_HUMAN_REVIEW: "Needs human review",
  ERROR: "Error",
};
