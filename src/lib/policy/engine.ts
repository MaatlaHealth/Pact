import type {
  ContractStatus,
  PaymentState,
  PolicyAction,
  PolicyOutcome,
  TaskCategory,
  CriterionKind,
  PassportTier,
  AgentStatus,
  ApprovalKind,
  ApprovalStatus,
  VerificationRunStatus,
} from "@/generated/prisma/client";
import { AUTHORIZATION_VALID_DAYS } from "@/lib/paypal/payments";

/**
 * Deterministic financial policy engine.
 *
 * The engine takes a snapshot of facts loaded from the database and returns a
 * decision with every rule that was evaluated. It has no access to the
 * network, the database, or any language model. Agents can request an action;
 * only this engine can allow it.
 */

export const POLICY_ENGINE_VERSION = "1.0.0";

export type RuleSeverity = "deny" | "human";

export interface RuleResult {
  id: string;
  description: string;
  passed: boolean;
  severity: RuleSeverity;
  detail?: string;
}

export interface PolicyDecisionResult {
  action: PolicyAction;
  outcome: PolicyOutcome;
  rules: RuleResult[];
  engineVersion: string;
  summary: string;
}

export interface PolicySnapshot {
  action: PolicyAction;
  now: Date;
  policy: {
    currency: string;
    maxTransactionAmountCents: number;
    monthlyBudgetCents: number;
    perAgentLimitCents: number;
    coldStartAgentLimitCents: number;
    requireHumanApprovalForCapture: boolean;
    humanApprovalAboveCents: number | null;
    subjectiveCriteriaRequireHuman: boolean;
    maxNegotiationRounds: number;
    maxCorrectionAttempts: number;
    allowedCategories: string[];
    captureRateLimitPerHour: number;
  };
  contract: {
    id: string;
    status: ContractStatus;
    paymentState: PaymentState;
    currency: string;
    budgetCents: number;
    agreedAmountCents: number | null;
    category: TaskCategory;
    correctionCount: number;
    approvedHash: string | null;
    approvedVersionId: string | null;
    workerAgentId: string | null;
    verifierAgentId: string | null;
    buyerAgentId: string | null;
    deadline: Date | null;
  };
  /** Hash recomputed from the approved version's stored content. */
  recomputedApprovedHash: string | null;
  criteria: { key: string; kind: CriterionKind; required: boolean }[];
  latestDeliverable: { id: string; rootHash: string; submissionNumber: number } | null;
  latestVerification: {
    id: string;
    deliverableId: string;
    status: VerificationRunStatus;
    attempt: number;
    results: { key: string; kind: CriterionKind; required: boolean; passed: boolean | null }[];
  } | null;
  worker: {
    id: string;
    status: AgentStatus;
    capabilities: TaskCategory[];
    passportTier: PassportTier;
    capturedThisMonthCents: number;
  } | null;
  verifier: { id: string; isPlatformAgent: boolean } | null;
  spending: {
    capturedThisMonthCents: number;
    authorizedOutstandingCents: number;
    capturesLastHour: number;
  };
  authorization: {
    paypalAuthorizationId: string;
    status: string;
    amountCents: number;
    currency: string;
    createdAt: Date;
    expirationTime: Date | null;
  } | null;
  existingCaptures: { paypalCaptureId: string; status: string }[];
  approvals: { kind: ApprovalKind; status: ApprovalStatus; verificationRunId?: string | null }[];
  negotiationRounds: number;
  proposedAmountCents?: number | null;
  recipient: { configuredPayee: string | null; orderPayee: string | null };
}

type RuleFn = (s: PolicySnapshot) => RuleResult;

function rule(id: string, description: string, severity: RuleSeverity, check: (s: PolicySnapshot) => { passed: boolean; detail?: string }): RuleFn {
  return (s) => {
    const r = check(s);
    return { id, description, severity, passed: r.passed, detail: r.detail };
  };
}

function amountFor(s: PolicySnapshot): number {
  return s.proposedAmountCents ?? s.contract.agreedAmountCents ?? s.contract.budgetCents;
}

// ---------------------------------------------------------------------------
// Shared rules
// ---------------------------------------------------------------------------

const statusIs = (allowed: ContractStatus[]) =>
  rule("contract.status", `Contract status must be one of ${allowed.join(", ")}`, "deny", (s) => ({
    passed: allowed.includes(s.contract.status),
    detail: `Current status ${s.contract.status}.`,
  }));

const paymentStateIs = (allowed: PaymentState[]) =>
  rule("payment.state", `Payment state must be one of ${allowed.join(", ")}`, "deny", (s) => ({
    passed: allowed.includes(s.contract.paymentState),
    detail: `Current payment state ${s.contract.paymentState}.`,
  }));

const currencyMatchesPolicy = rule("currency.policy", "Contract currency must match the workspace policy currency", "deny", (s) => ({
  passed: s.contract.currency === s.policy.currency,
  detail: `Contract ${s.contract.currency}, policy ${s.policy.currency}.`,
}));

const categoryAllowed = rule("category.allowed", "Task category must be enabled in the spending policy", "deny", (s) => ({
  passed: s.policy.allowedCategories.includes(s.contract.category),
  detail: `Category ${s.contract.category}.`,
}));

const amountWithinMaxTransaction = rule("amount.max_transaction", "Amount must not exceed the maximum transaction amount", "deny", (s) => ({
  passed: amountFor(s) <= s.policy.maxTransactionAmountCents,
  detail: `Amount ${amountFor(s)} cents, limit ${s.policy.maxTransactionAmountCents} cents.`,
}));

const amountWithinBudget = rule("amount.within_budget", "Amount must not exceed the contract budget", "deny", (s) => ({
  passed: amountFor(s) <= s.contract.budgetCents,
  detail: `Amount ${amountFor(s)} cents, budget ${s.contract.budgetCents} cents.`,
}));

const amountPositive = rule("amount.positive", "Amount must be greater than zero", "deny", (s) => ({ passed: amountFor(s) > 0 }));

const monthlyBudgetHeadroom = rule("budget.monthly", "Captured plus outstanding authorized spend this month must stay within the monthly budget", "deny", (s) => {
  const projected = s.spending.capturedThisMonthCents + s.spending.authorizedOutstandingCents + amountFor(s);
  return { passed: projected <= s.policy.monthlyBudgetCents, detail: `Projected ${projected} cents of ${s.policy.monthlyBudgetCents} cents.` };
});

const approvedHashIntact = rule("contract.hash", "Approved contract content must match its recorded hash", "deny", (s) => ({
  passed: Boolean(s.contract.approvedHash) && s.contract.approvedHash === s.recomputedApprovedHash,
  detail: s.contract.approvedHash ? (s.contract.approvedHash === s.recomputedApprovedHash ? "Hash matches." : "Hash mismatch: contract content changed after approval.") : "No approved version.",
}));

const workerAssignedAndCapable = rule("worker.capable", "Assigned worker must be active and registered for the task category", "deny", (s) => {
  if (!s.worker) return { passed: false, detail: "No worker assigned." };
  if (s.worker.status !== "ACTIVE") return { passed: false, detail: `Worker is ${s.worker.status}.` };
  if (!s.worker.capabilities.includes(s.contract.category)) return { passed: false, detail: `Worker lacks capability ${s.contract.category}.` };
  return { passed: true };
});

const workerSpendLimit = rule("worker.spend_limit", "Worker's captured spend this month plus this amount must stay within the per-agent limit", "deny", (s) => {
  if (!s.worker) return { passed: false, detail: "No worker assigned." };
  const projected = s.worker.capturedThisMonthCents + amountFor(s);
  return { passed: projected <= s.policy.perAgentLimitCents, detail: `Projected ${projected} cents of ${s.policy.perAgentLimitCents} cents.` };
});

const coldStartLimit = rule("worker.cold_start", "Workers without verified history need human approval above the cold-start limit", "human", (s) => {
  if (!s.worker) return { passed: false, detail: "No worker assigned." };
  if (s.worker.passportTier !== "NEW") return { passed: true, detail: `Worker tier ${s.worker.passportTier}.` };
  const within = amountFor(s) <= s.policy.coldStartAgentLimitCents;
  const approved = s.approvals.some((a) => a.kind === "HUMAN_REVIEW" && a.status === "APPROVED");
  return { passed: within || approved, detail: within ? "Within cold-start limit." : approved ? "Human approval recorded." : `Amount exceeds cold-start limit of ${s.policy.coldStartAgentLimitCents} cents.` };
});

const notDisputed = rule("contract.not_disputed", "Contract must not be disputed", "deny", (s) => ({ passed: s.contract.status !== "DISPUTED" }));

const deadlineNotPassed = rule("contract.deadline", "Contract deadline must not have passed", "deny", (s) => ({
  passed: !s.contract.deadline || s.contract.deadline.getTime() >= s.now.getTime(),
}));

// ---------------------------------------------------------------------------
// Verification rules
// ---------------------------------------------------------------------------

const verificationPassed = rule("verification.passed", "Latest verification run must have passed", "deny", (s) => ({
  passed: s.latestVerification?.status === "PASSED",
  detail: s.latestVerification ? `Run ${s.latestVerification.attempt} is ${s.latestVerification.status}.` : "No verification run.",
}));

const verificationCoversLatestDeliverable = rule("verification.current", "Verification must refer to the most recent deliverable", "deny", (s) => ({
  passed: Boolean(s.latestVerification && s.latestDeliverable && s.latestVerification.deliverableId === s.latestDeliverable.id),
  detail: "A newer submission would need its own verification run.",
}));

const requiredObjectiveCriteriaPassed = rule("verification.objective", "Every required objective criterion must have an evidence-backed pass", "deny", (s) => {
  if (!s.latestVerification) return { passed: false, detail: "No verification run." };
  const required = s.criteria.filter((c) => c.kind === "OBJECTIVE" && c.required);
  const failing = required.filter((c) => {
    const r = s.latestVerification!.results.find((x) => x.key === c.key);
    return !r || r.passed !== true;
  });
  return { passed: failing.length === 0, detail: failing.length ? `Failing: ${failing.map((c) => c.key).join(", ")}.` : `${required.length} required objective criteria passed.` };
});

const subjectiveCriteriaReviewed = rule("verification.subjective", "Subjective criteria require an approved human review when the policy says so", "human", (s) => {
  const subjective = s.criteria.filter((c) => c.kind === "SUBJECTIVE");
  if (subjective.length === 0) return { passed: true, detail: "No subjective criteria." };
  if (!s.policy.subjectiveCriteriaRequireHuman) return { passed: true, detail: "Policy delegates subjective criteria to the verifier's rubric." };
  const approved = s.approvals.some((a) => a.kind === "SUBJECTIVE_REVIEW" && a.status === "APPROVED" && (!a.verificationRunId || a.verificationRunId === s.latestVerification?.id));
  return { passed: approved, detail: approved ? "Subjective review approved." : `${subjective.length} subjective criteria await human review.` };
});

const verifierIndependent = rule("verification.independent", "Verifier must be a platform verifier distinct from the worker", "deny", (s) => ({
  passed: Boolean(s.verifier && s.verifier.isPlatformAgent && s.verifier.id !== s.contract.workerAgentId),
}));

// ---------------------------------------------------------------------------
// Payment rules
// ---------------------------------------------------------------------------

const authorizationValid = rule("authorization.valid", "A PayPal authorization in CREATED status must exist and not be expired", "deny", (s) => {
  if (!s.authorization) return { passed: false, detail: "No authorization recorded." };
  if (s.authorization.status !== "CREATED") return { passed: false, detail: `Authorization status ${s.authorization.status}.` };
  const expiry = s.authorization.expirationTime ?? new Date(s.authorization.createdAt.getTime() + AUTHORIZATION_VALID_DAYS * 86_400_000);
  if (expiry.getTime() <= s.now.getTime()) return { passed: false, detail: `Authorization expired at ${expiry.toISOString()}.` };
  return { passed: true, detail: `Valid until ${expiry.toISOString()}.` };
});

const authorizationMatchesContract = rule("authorization.amount", "Authorized amount and currency must equal the agreed contract amount", "deny", (s) => {
  if (!s.authorization) return { passed: false, detail: "No authorization." };
  const agreed = s.contract.agreedAmountCents;
  const ok = agreed !== null && s.authorization.amountCents === agreed && s.authorization.currency === s.contract.currency;
  return { passed: ok, detail: `Authorized ${s.authorization.amountCents} ${s.authorization.currency}, agreed ${agreed ?? "none"} ${s.contract.currency}.` };
});

const noExistingCapture = rule("capture.duplicate", "No capture may already exist for this contract", "deny", (s) => ({
  passed: s.existingCaptures.length === 0,
  detail: s.existingCaptures.length ? `Capture ${s.existingCaptures[0].paypalCaptureId} already recorded.` : undefined,
}));

const captureRateLimit = rule("capture.rate_limit", "Captures per hour must stay within the policy limit", "deny", (s) => ({
  passed: s.spending.capturesLastHour < s.policy.captureRateLimitPerHour,
  detail: `${s.spending.capturesLastHour} captures in the last hour, limit ${s.policy.captureRateLimitPerHour}.`,
}));

const humanCaptureApproval = rule("capture.human_approval", "Human approval is required for capture when the policy demands it", "human", (s) => {
  const amount = amountFor(s);
  const needed = s.policy.requireHumanApprovalForCapture || (s.policy.humanApprovalAboveCents !== null && amount > s.policy.humanApprovalAboveCents);
  if (!needed) return { passed: true, detail: "Policy does not require human approval for this capture." };
  const approved = s.approvals.some((a) => a.kind === "CAPTURE" && a.status === "APPROVED" && (!a.verificationRunId || a.verificationRunId === s.latestVerification?.id));
  return { passed: approved, detail: approved ? "Capture approved by a workspace member." : "Awaiting capture approval." };
});

const recipientPermitted = rule("recipient.permitted", "Order payee must match the configured merchant recipient", "deny", (s) => {
  if (!s.recipient.configuredPayee) return { passed: true, detail: "Default REST app merchant is the only recipient." };
  return { passed: s.recipient.orderPayee === s.recipient.configuredPayee, detail: `Order payee ${s.recipient.orderPayee ?? "default"}, configured ${s.recipient.configuredPayee}.` };
});

const correctionBudget = rule("corrections.limit", "Correction attempts must stay within the policy limit", "deny", (s) => ({
  passed: s.contract.correctionCount <= s.policy.maxCorrectionAttempts,
  detail: `${s.contract.correctionCount} of ${s.policy.maxCorrectionAttempts} corrections used.`,
}));

const negotiationRounds = rule("negotiation.rounds", "Negotiation rounds must stay within the policy limit", "deny", (s) => ({
  passed: s.negotiationRounds <= s.policy.maxNegotiationRounds,
  detail: `${s.negotiationRounds} of ${s.policy.maxNegotiationRounds} rounds.`,
}));

const hasObjectiveCriteria = rule("criteria.objective_present", "An approved contract must contain at least one objective criterion", "deny", (s) => ({
  passed: s.criteria.some((c) => c.kind === "OBJECTIVE"),
}));

// ---------------------------------------------------------------------------
// Rule sets per action
// ---------------------------------------------------------------------------

const RULES: Record<PolicyAction, RuleFn[]> = {
  APPROVE_CONTRACT: [statusIs(["AWAITING_APPROVAL"]), currencyMatchesPolicy, categoryAllowed, amountPositive, amountWithinMaxTransaction, hasObjectiveCriteria, deadlineNotPassed],
  START_NEGOTIATION: [statusIs(["NEGOTIATING"]), approvedHashIntact, categoryAllowed, deadlineNotPassed],
  ACCEPT_NEGOTIATED_TERMS: [statusIs(["NEGOTIATING"]), approvedHashIntact, amountPositive, amountWithinBudget, amountWithinMaxTransaction, workerAssignedAndCapable, negotiationRounds, monthlyBudgetHeadroom, workerSpendLimit],
  CREATE_PAYMENT_ORDER: [
    statusIs(["AWAITING_PAYMENT_AUTHORIZATION"]),
    paymentStateIs(["NONE", "ORDER_CREATED", "AWAITING_PAYER_APPROVAL"]),
    approvedHashIntact,
    currencyMatchesPolicy,
    categoryAllowed,
    amountPositive,
    amountWithinBudget,
    amountWithinMaxTransaction,
    monthlyBudgetHeadroom,
    workerAssignedAndCapable,
    workerSpendLimit,
    deadlineNotPassed,
  ],
  AUTHORIZE_PAYMENT: [
    statusIs(["AWAITING_PAYMENT_AUTHORIZATION"]),
    paymentStateIs(["ORDER_CREATED", "AWAITING_PAYER_APPROVAL", "PAYER_APPROVED"]),
    approvedHashIntact,
    amountWithinBudget,
    amountWithinMaxTransaction,
    monthlyBudgetHeadroom,
    workerAssignedAndCapable,
    recipientPermitted,
  ],
  START_WORK: [statusIs(["AUTHORIZED", "CORRECTION_REQUIRED"]), paymentStateIs(["AUTHORIZED"]), approvedHashIntact, authorizationValid, workerAssignedAndCapable, correctionBudget],
  SUBMIT_DELIVERABLE: [statusIs(["IN_PROGRESS"]), paymentStateIs(["AUTHORIZED"]), approvedHashIntact, correctionBudget],
  RUN_VERIFICATION: [statusIs(["UNDER_VERIFICATION"]), approvedHashIntact, verifierIndependent],
  CAPTURE_PAYMENT: [
    statusIs(["ELIGIBLE_FOR_CAPTURE", "AWAITING_HUMAN_REVIEW"]),
    paymentStateIs(["AUTHORIZED"]),
    notDisputed,
    approvedHashIntact,
    authorizationValid,
    authorizationMatchesContract,
    verificationPassed,
    verificationCoversLatestDeliverable,
    requiredObjectiveCriteriaPassed,
    verifierIndependent,
    amountWithinBudget,
    amountWithinMaxTransaction,
    monthlyBudgetHeadroom,
    workerAssignedAndCapable,
    workerSpendLimit,
    recipientPermitted,
    noExistingCapture,
    captureRateLimit,
    subjectiveCriteriaReviewed,
    coldStartLimit,
    humanCaptureApproval,
  ],
  VOID_AUTHORIZATION: [
    statusIs(["AUTHORIZED", "IN_PROGRESS", "UNDER_VERIFICATION", "CORRECTION_REQUIRED", "AWAITING_HUMAN_REVIEW", "ELIGIBLE_FOR_CAPTURE", "FAILED", "EXPIRED"]),
    paymentStateIs(["AUTHORIZED"]),
    noExistingCapture,
  ],
};

export function evaluatePolicy(snapshot: PolicySnapshot): PolicyDecisionResult {
  const rules = RULES[snapshot.action].map((fn) => fn(snapshot));
  const denied = rules.filter((r) => !r.passed && r.severity === "deny");
  const needsHuman = rules.filter((r) => !r.passed && r.severity === "human");
  let outcome: PolicyOutcome;
  let summary: string;
  if (denied.length > 0) {
    outcome = "DENY";
    summary = `Denied: ${denied.map((r) => r.description).join("; ")}.`;
  } else if (needsHuman.length > 0) {
    outcome = "REQUIRE_HUMAN_APPROVAL";
    summary = `Human approval required: ${needsHuman.map((r) => r.detail ?? r.description).join("; ")}`;
  } else {
    outcome = "ALLOW";
    summary = `All ${rules.length} rules passed.`;
  }
  return { action: snapshot.action, outcome, rules, engineVersion: POLICY_ENGINE_VERSION, summary };
}
