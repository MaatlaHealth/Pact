import type { Prisma, ActorType } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { HttpError } from "@/lib/security/request";
import { recordAudit } from "@/lib/audit";
import { payPalValueToCents } from "@/lib/money";
import { decide, PolicyDeniedError } from "@/lib/policy/snapshot";
import { transitionContract } from "@/lib/contracts/transitions";
import { enqueue } from "@/lib/jobs/queue";
import {
  paypalClient,
  paypalConfigured,
  createAuthorizeOrder,
  getOrder,
  authorizeOrder,
  approvalLink,
  firstAuthorization,
  captureAuthorization,
  voidAuthorization,
  getAuthorization,
  PayPalUncertainError,
  PayPalApiError,
  type PayPalOrderResource,
  type PayPalAuthorizationResource,
  type PayPalCaptureResource,
} from "@/lib/paypal";

export interface Actor {
  type: ActorType;
  id?: string | null;
  label?: string | null;
}

const SYSTEM_ACTOR: Actor = { type: "SYSTEM", label: "Payment service" };

function assertPayPalConfigured() {
  if (!paypalConfigured()) {
    throw new HttpError(503, "PayPal is not configured on this deployment. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET.", "paypal_not_configured");
  }
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

export function paymentReturnUrls(contractId: string) {
  const base = env().APP_URL;
  return {
    returnUrl: `${base}/api/payments/paypal/return?contract=${contractId}`,
    cancelUrl: `${base}/app/contracts/${contractId}?payment=cancelled`,
  };
}

// ---------------------------------------------------------------------------
// Create order (intent AUTHORIZE)
// ---------------------------------------------------------------------------

export async function createPaymentOrder(contractId: string, actor: Actor): Promise<{ approveUrl: string; paypalOrderId: string; reused: boolean }> {
  assertPayPalConfigured();

  // Phase 1: policy decision and idempotency record, atomically.
  const prepared = await db.$transaction(async (tx) => {
    const contract = await tx.contract.findUniqueOrThrow({ where: { id: contractId }, include: { paypalOrder: true, approvedVersion: true } });
    if (contract.paypalOrder && contract.paypalOrder.approveUrl && ["ORDER_CREATED", "AWAITING_PAYER_APPROVAL"].includes(contract.paymentState)) {
      return { reuse: contract.paypalOrder };
    }
    const decision = await decide(tx, contractId, "CREATE_PAYMENT_ORDER", { actorLabel: actor.label ?? undefined });
    if (decision.outcome !== "ALLOW") throw new PolicyDeniedError(decision);
    const amount = contract.agreedAmountCents ?? contract.budgetCents;
    const op = await tx.financialOperation.upsert({
      where: { contractId_operation: { contractId, operation: "CREATE_ORDER" } },
      create: { contractId, operation: "CREATE_ORDER", idempotencyKey: `pact-order-${contractId}`, attempts: 1 },
      update: { attempts: { increment: 1 }, status: "PENDING" },
    });
    return { contract, amount, op };
  });

  if ("reuse" in prepared && prepared.reuse) {
    return { approveUrl: prepared.reuse.approveUrl!, paypalOrderId: prepared.reuse.paypalOrderId, reused: true };
  }
  if ("reuse" in prepared) throw new Error("Unexpected empty order reuse.");

  const { contract, amount, op } = prepared;
  const urls = paymentReturnUrls(contractId);
  let order: PayPalOrderResource;
  try {
    order = await createAuthorizeOrder(paypalClient(), {
      requestId: op.idempotencyKey,
      amountCents: amount,
      currency: contract.currency,
      referenceId: contractId,
      customId: contractId,
      description: `PACT contract: ${contract.title}`,
      returnUrl: urls.returnUrl,
      cancelUrl: urls.cancelUrl,
      payeeEmail: env().PAYPAL_PAYEE_EMAIL,
    });
  } catch (error) {
    await db.financialOperation.update({ where: { id: op.id }, data: { status: error instanceof PayPalUncertainError ? "UNCERTAIN" : "FAILED", lastError: String(error).slice(0, 2000), finishedAt: new Date() } });
    await recordAudit({ organizationId: contract.organizationId, contractId, actorType: "SYSTEM", actorLabel: "PayPal", action: "payment.order_create_failed", title: "PayPal order creation failed", description: error instanceof Error ? error.message : String(error), severity: "WARNING" });
    throw error instanceof PayPalApiError ? new HttpError(502, `PayPal rejected the order: ${error.message}`, "paypal_error", { debugId: error.debugId, issues: error.issues }) : error;
  }

  const approveUrl = approvalLink(order);
  if (!approveUrl) throw new HttpError(502, "PayPal did not return an approval link.", "paypal_error");

  await db.$transaction(async (tx) => {
    await tx.payPalOrder.upsert({
      where: { contractId },
      create: {
        contractId,
        organizationId: contract.organizationId,
        environment: env().PAYPAL_ENVIRONMENT === "live" ? "LIVE" : "SANDBOX",
        paypalOrderId: order.id,
        intent: "AUTHORIZE",
        status: order.status,
        amountCents: amount,
        currency: contract.currency,
        requestId: op.idempotencyKey,
        approveUrl,
        createResponse: toJson(order),
        latestResponse: toJson(order),
      },
      update: { status: order.status, approveUrl, latestResponse: toJson(order) },
    });
    await tx.financialOperation.update({ where: { id: op.id }, data: { status: "SUCCEEDED", response: toJson({ id: order.id, status: order.status }), finishedAt: new Date() } });
    const paypalOrder = await tx.payPalOrder.findUniqueOrThrow({ where: { contractId } });
    await transitionContract(tx, contractId, {
      paymentState: "ORDER_CREATED",
      actor,
      reason: `PayPal order ${order.id} created with intent AUTHORIZE for ${amount} ${contract.currency}. No funds are reserved until the payer approves and the order is authorized.`,
      paymentEvent: { source: "API", kind: "order.created", orderId: paypalOrder.id, payload: toJson({ paypalOrderId: order.id, status: order.status }) },
    });
    await transitionContract(tx, contractId, {
      paymentState: "AWAITING_PAYER_APPROVAL",
      actor: SYSTEM_ACTOR,
      reason: "Waiting for the payer to approve the order in PayPal.",
      paymentEvent: { source: "SYSTEM", kind: "order.awaiting_approval", orderId: paypalOrder.id },
    });
  });

  return { approveUrl, paypalOrderId: order.id, reused: false };
}

// ---------------------------------------------------------------------------
// Authorize after payer approval
// ---------------------------------------------------------------------------

export async function completePayerApproval(contractId: string, paypalOrderId: string, actor: Actor): Promise<{ status: "authorized" | "already_authorized" | "not_approved"; detail: string }> {
  assertPayPalConfigured();
  const existing = await db.payPalOrder.findUnique({ where: { contractId }, include: { contract: true, authorizations: true } });
  if (!existing || existing.paypalOrderId !== paypalOrderId) throw new HttpError(404, "Order does not belong to this contract.");
  if (existing.contract.paymentState === "AUTHORIZED" || existing.authorizations.some((a) => a.status === "CREATED")) {
    return { status: "already_authorized", detail: "This order was already authorized." };
  }

  const client = paypalClient();
  const remote = await getOrder(client, paypalOrderId);
  await db.payPalOrder.update({ where: { id: existing.id }, data: { status: remote.status, latestResponse: toJson(remote), payerId: remote.payer?.payer_id ?? null, payerEmail: remote.payer?.email_address ?? remote.payment_source?.paypal?.email_address ?? null } });

  if (remote.status === "COMPLETED") {
    // Authorized out of band (webhook or earlier attempt). Reconcile instead of re-authorizing.
    await reconcileContractPayment(contractId, SYSTEM_ACTOR);
    return { status: "already_authorized", detail: "Order was already authorized; records reconciled." };
  }
  if (remote.status !== "APPROVED") {
    await recordAudit({ organizationId: existing.organizationId, contractId, actorType: "SYSTEM", actorLabel: "PayPal", action: "payment.return_not_approved", title: `Payer returned without approval (order status ${remote.status})`, severity: "NOTICE" });
    return { status: "not_approved", detail: `PayPal reports the order is ${remote.status}. Approval has not completed.` };
  }

  const op = await db.$transaction(async (tx) => {
    await transitionContract(tx, contractId, {
      paymentState: "PAYER_APPROVED",
      actor,
      reason: `Payer approved PayPal order ${paypalOrderId}.`,
      paymentEvent: { source: "API", kind: "order.payer_approved", orderId: existing.id, payload: toJson({ payerId: remote.payer?.payer_id }) },
    });
    const decision = await decide(tx, contractId, "AUTHORIZE_PAYMENT", { actorLabel: actor.label ?? undefined });
    if (decision.outcome !== "ALLOW") throw new PolicyDeniedError(decision);
    return tx.financialOperation.upsert({
      where: { contractId_operation: { contractId, operation: "AUTHORIZE_ORDER" } },
      create: { contractId, operation: "AUTHORIZE_ORDER", idempotencyKey: `pact-auth-${contractId}`, attempts: 1 },
      update: { attempts: { increment: 1 }, status: "PENDING" },
    });
  });

  let authorized: PayPalOrderResource;
  try {
    authorized = await authorizeOrder(client, paypalOrderId, op.idempotencyKey);
  } catch (error) {
    if (error instanceof PayPalUncertainError) {
      await db.financialOperation.update({ where: { id: op.id }, data: { status: "UNCERTAIN", lastError: error.message, finishedAt: new Date() } });
      await enqueue("payment.reconcile", { contractId }, { contractId, dedupeKey: `reconcile:${contractId}:${Date.now()}` });
      throw new HttpError(502, "PayPal did not confirm the authorization. PACT will reconcile automatically.", "paypal_uncertain");
    }
    await db.financialOperation.update({ where: { id: op.id }, data: { status: "FAILED", lastError: String(error).slice(0, 2000), finishedAt: new Date() } });
    await db.$transaction((tx) =>
      transitionContract(tx, contractId, {
        paymentState: "DENIED",
        status: "FAILED",
        data: { failureReason: `PayPal authorization failed: ${error instanceof Error ? error.message : String(error)}` },
        actor: SYSTEM_ACTOR,
        reason: `PayPal authorization failed: ${error instanceof Error ? error.message : String(error)}`,
        severity: "WARNING",
        paymentEvent: { source: "API", kind: "authorization.failed", orderId: existing.id, payload: toJson({ error: String(error) }) },
      }),
    );
    throw error instanceof PayPalApiError ? new HttpError(502, `PayPal declined the authorization: ${error.message}`, "paypal_error", { debugId: error.debugId, issues: error.issues }) : error;
  }

  const auth = firstAuthorization(authorized);
  if (!auth) throw new HttpError(502, "PayPal authorized the order but returned no authorization resource.", "paypal_error");
  await persistAuthorization(contractId, existing.id, auth, authorized, actor, "API");
  await db.financialOperation.update({ where: { id: op.id }, data: { status: "SUCCEEDED", response: toJson({ authorizationId: auth.id, status: auth.status }), finishedAt: new Date() } });
  await enqueue("work.execute", { contractId }, { contractId, dedupeKey: `work:${contractId}:1` });
  return { status: "authorized", detail: `Authorization ${auth.id} created for ${auth.amount.value} ${auth.amount.currency_code}.` };
}

async function persistAuthorization(contractId: string, orderRowId: string, auth: PayPalAuthorizationResource, order: PayPalOrderResource, actor: Actor, source: "API" | "WEBHOOK" | "SYSTEM") {
  await db.$transaction(async (tx) => {
    await tx.payPalAuthorization.upsert({
      where: { paypalAuthorizationId: auth.id },
      create: {
        orderId: orderRowId,
        paypalAuthorizationId: auth.id,
        status: auth.status,
        amountCents: payPalValueToCents(auth.amount.value),
        currency: auth.amount.currency_code,
        expirationTime: auth.expiration_time ? new Date(auth.expiration_time) : null,
        rawResponse: toJson(auth),
      },
      update: { status: auth.status, expirationTime: auth.expiration_time ? new Date(auth.expiration_time) : undefined, rawResponse: toJson(auth) },
    });
    await tx.payPalOrder.update({ where: { id: orderRowId }, data: { status: order.status, latestResponse: toJson(order) } });
    const contract = await tx.contract.findUniqueOrThrow({ where: { id: contractId } });
    if (auth.status === "CREATED" && contract.paymentState !== "AUTHORIZED") {
      await transitionContract(tx, contractId, {
        status: contract.status === "AWAITING_PAYMENT_AUTHORIZATION" ? "AUTHORIZED" : undefined,
        paymentState: "AUTHORIZED",
        actor,
        reason: `PayPal authorization ${auth.id} holds ${auth.amount.value} ${auth.amount.currency_code}. Valid until ${auth.expiration_time ?? "the standard 29-day window"}.`,
        severity: "NOTICE",
        paymentEvent: { source, kind: "authorization.created", orderId: orderRowId, payload: toJson({ authorizationId: auth.id, amount: auth.amount, expirationTime: auth.expiration_time }) },
      });
    }
  });
}

// ---------------------------------------------------------------------------
// Capture
// ---------------------------------------------------------------------------

export interface CaptureOutcome {
  outcome: "captured" | "pending" | "human_approval_required" | "uncertain";
  captureId?: string;
  detail: string;
}

/**
 * Captures the authorized payment. The policy engine decides; this function
 * only carries out an ALLOW. A REQUIRE_HUMAN_APPROVAL outcome creates an
 * approval request and parks the contract. A DENY throws.
 */
export async function capturePayment(contractId: string, actor: Actor): Promise<CaptureOutcome> {
  assertPayPalConfigured();

  const prepared = await db.$transaction(async (tx) => {
    const decision = await decide(tx, contractId, "CAPTURE_PAYMENT", { actorLabel: actor.label ?? undefined });
    const contract = await tx.contract.findUniqueOrThrow({ where: { id: contractId }, include: { paypalOrder: { include: { authorizations: { orderBy: { createdAt: "desc" }, take: 1 } } }, verificationRuns: { orderBy: { attempt: "desc" }, take: 1 } } });
    if (decision.outcome === "DENY") throw new PolicyDeniedError(decision);
    if (decision.outcome === "REQUIRE_HUMAN_APPROVAL") {
      const failing = decision.rules.filter((r) => !r.passed && r.severity === "human");
      const kind = failing.some((r) => r.id === "verification.subjective") ? "SUBJECTIVE_REVIEW" : failing.some((r) => r.id === "worker.cold_start") ? "HUMAN_REVIEW" : "CAPTURE";
      const existingPending = await tx.approvalRequest.findFirst({ where: { contractId, kind, status: "PENDING" } });
      if (!existingPending) {
        await tx.approvalRequest.create({
          data: {
            organizationId: contract.organizationId,
            contractId,
            kind,
            title: kind === "SUBJECTIVE_REVIEW" ? "Review subjective criteria before capture" : kind === "HUMAN_REVIEW" ? "Approve payment to a new worker" : "Approve payment capture",
            description: failing.map((r) => r.detail ?? r.description).join(" "),
            context: toJson({ verificationRunId: contract.verificationRuns[0]?.id ?? null, decisionId: decision.decisionId, rules: failing }),
          },
        });
      }
      if (contract.status !== "AWAITING_HUMAN_REVIEW") {
        await transitionContract(tx, contractId, { status: "AWAITING_HUMAN_REVIEW", actor: SYSTEM_ACTOR, reason: decision.summary, severity: "NOTICE" });
      }
      return { human: true as const, detail: decision.summary };
    }
    const auth = contract.paypalOrder?.authorizations[0];
    if (!auth || !contract.paypalOrder) throw new HttpError(409, "No authorization to capture.");
    const op = await tx.financialOperation.upsert({
      where: { contractId_operation: { contractId, operation: "CAPTURE_AUTHORIZATION" } },
      create: { contractId, operation: "CAPTURE_AUTHORIZATION", idempotencyKey: `pact-capture-${contractId}`, attempts: 1 },
      update: { attempts: { increment: 1 }, status: "PENDING" },
    });
    if (op.attempts > 1) {
      const prior = await tx.payPalCapture.findFirst({ where: { authorizationId: auth.id } });
      if (prior) throw new HttpError(409, `Capture ${prior.paypalCaptureId} already exists for this contract.`, "duplicate_capture");
    }
    await transitionContract(tx, contractId, {
      status: contract.status === "AWAITING_HUMAN_REVIEW" ? "ELIGIBLE_FOR_CAPTURE" : undefined,
      actor: SYSTEM_ACTOR,
      reason: "Policy engine allowed capture.",
    });
    await transitionContract(tx, contractId, {
      status: "CAPTURE_PENDING",
      paymentState: "CAPTURE_PENDING",
      actor,
      reason: `Capturing authorization ${auth.paypalAuthorizationId} for ${auth.amountCents} ${auth.currency}.`,
      paymentEvent: { source: "API", kind: "capture.requested", orderId: contract.paypalOrder.id, payload: toJson({ authorizationId: auth.paypalAuthorizationId, decisionId: decision.decisionId }) },
    });
    return { human: false as const, contract, auth, op, orderRowId: contract.paypalOrder.id };
  });

  if (prepared.human) return { outcome: "human_approval_required", detail: prepared.detail };

  const { contract, auth, op, orderRowId } = prepared;
  let capture: PayPalCaptureResource;
  try {
    capture = await captureAuthorization(paypalClient(), auth.paypalAuthorizationId, {
      requestId: op.idempotencyKey,
      amountCents: auth.amountCents,
      currency: auth.currency,
      invoiceId: `PACT-${contractId.slice(0, 8).toUpperCase()}-${contractId.slice(-6).toUpperCase()}`,
      noteToPayer: `PACT contract ${contract.title}`.slice(0, 255),
    });
  } catch (error) {
    if (error instanceof PayPalUncertainError) {
      await db.$transaction(async (tx) => {
        await tx.financialOperation.update({ where: { id: op.id }, data: { status: "UNCERTAIN", lastError: error.message } });
        await transitionContract(tx, contractId, {
          paymentState: "CAPTURE_UNCERTAIN",
          actor: SYSTEM_ACTOR,
          reason: "PayPal did not return a response to the capture request. Reconciliation is scheduled; no second capture will be attempted.",
          severity: "WARNING",
          paymentEvent: { source: "API", kind: "capture.uncertain", orderId: orderRowId },
        });
      });
      await enqueue("payment.reconcile", { contractId }, { contractId, dedupeKey: `reconcile:${contractId}:uncertain`, runAt: new Date(Date.now() + 30_000) });
      return { outcome: "uncertain", detail: "Capture outcome unknown; reconciliation scheduled." };
    }
    const message = error instanceof Error ? error.message : String(error);
    await db.$transaction(async (tx) => {
      await tx.financialOperation.update({ where: { id: op.id }, data: { status: "FAILED", lastError: message.slice(0, 2000), finishedAt: new Date() } });
      await transitionContract(tx, contractId, {
        status: "ELIGIBLE_FOR_CAPTURE",
        paymentState: "AUTHORIZED",
        actor: SYSTEM_ACTOR,
        reason: `PayPal capture failed: ${message}`,
        severity: "WARNING",
        paymentEvent: { source: "API", kind: "capture.failed", orderId: orderRowId, payload: toJson({ error: message }) },
      });
    });
    throw error instanceof PayPalApiError ? new HttpError(502, `PayPal declined the capture: ${error.message}`, "paypal_error", { debugId: error.debugId, issues: error.issues }) : error;
  }

  return recordCaptureResult(contractId, auth.id, orderRowId, capture, op.id, actor, "API");
}

async function recordCaptureResult(contractId: string, authorizationRowId: string, orderRowId: string, capture: PayPalCaptureResource, opId: string | null, actor: Actor, source: "API" | "WEBHOOK" | "SYSTEM"): Promise<CaptureOutcome> {
  const outcome = await db.$transaction(async (tx) => {
    await tx.payPalCapture.upsert({
      where: { paypalCaptureId: capture.id },
      create: {
        authorizationId: authorizationRowId,
        paypalCaptureId: capture.id,
        status: capture.status,
        amountCents: payPalValueToCents(capture.amount.value),
        currency: capture.amount.currency_code,
        finalCapture: capture.final_capture ?? true,
        requestId: opId ? `pact-capture-${contractId}` : `paypal-${capture.id}`,
        rawResponse: toJson(capture),
      },
      update: { status: capture.status, rawResponse: toJson(capture) },
    });
    if (opId) await tx.financialOperation.update({ where: { id: opId }, data: { status: "SUCCEEDED", response: toJson({ captureId: capture.id, status: capture.status }), finishedAt: new Date() } });
    const contract = await tx.contract.findUniqueOrThrow({ where: { id: contractId } });
    if (capture.status === "COMPLETED") {
      if (contract.paymentState !== "CAPTURED") {
        await tx.payPalAuthorization.update({ where: { id: authorizationRowId }, data: { status: "CAPTURED" } });
        await transitionContract(tx, contractId, {
          status: "CAPTURED",
          paymentState: "CAPTURED",
          actor,
          reason: `PayPal capture ${capture.id} completed for ${capture.amount.value} ${capture.amount.currency_code}.`,
          severity: "NOTICE",
          paymentEvent: { source, kind: "capture.completed", orderId: orderRowId, payload: toJson({ captureId: capture.id, amount: capture.amount, breakdown: capture.seller_receivable_breakdown }) },
        });
      }
      return { outcome: "captured" as const, captureId: capture.id, detail: `Capture ${capture.id} completed.` };
    }
    if (capture.status === "PENDING") {
      await transitionContract(tx, contractId, {
        actor: SYSTEM_ACTOR,
        reason: `PayPal capture ${capture.id} is pending (${capture.status_details?.reason ?? "no reason given"}). Waiting for the webhook.`,
        paymentEvent: { source, kind: "capture.pending", orderId: orderRowId, payload: toJson({ captureId: capture.id, reason: capture.status_details?.reason }) },
      });
      return { outcome: "pending" as const, captureId: capture.id, detail: `Capture ${capture.id} is pending.` };
    }
    await transitionContract(tx, contractId, {
      status: "FAILED",
      paymentState: "DENIED",
      data: { failureReason: `PayPal capture ${capture.id} ${capture.status}.` },
      actor: SYSTEM_ACTOR,
      reason: `PayPal capture ${capture.id} ended in ${capture.status}.`,
      severity: "CRITICAL",
      paymentEvent: { source, kind: "capture.denied", orderId: orderRowId, payload: toJson({ captureId: capture.id, status: capture.status }) },
    });
    return { outcome: "pending" as const, captureId: capture.id, detail: `Capture ${capture.id} ${capture.status}.` };
  });

  if (outcome.outcome === "captured") {
    await enqueue("receipt.generate", { contractId }, { contractId, dedupeKey: `receipt:${contractId}` });
  } else if (capture.status === "PENDING") {
    await enqueue("payment.reconcile", { contractId }, { contractId, dedupeKey: `reconcile:${contractId}:pending-${capture.id}`, runAt: new Date(Date.now() + 120_000) });
  }
  return outcome;
}

// ---------------------------------------------------------------------------
// Void
// ---------------------------------------------------------------------------

export async function voidContractAuthorization(contractId: string, actor: Actor, reason: string): Promise<void> {
  assertPayPalConfigured();
  const prepared = await db.$transaction(async (tx) => {
    const decision = await decide(tx, contractId, "VOID_AUTHORIZATION", { actorLabel: actor.label ?? undefined });
    if (decision.outcome !== "ALLOW") throw new PolicyDeniedError(decision);
    const contract = await tx.contract.findUniqueOrThrow({ where: { id: contractId }, include: { paypalOrder: { include: { authorizations: { orderBy: { createdAt: "desc" }, take: 1 } } } } });
    const auth = contract.paypalOrder?.authorizations[0];
    if (!auth || !contract.paypalOrder) throw new HttpError(409, "No authorization to void.");
    const op = await tx.financialOperation.upsert({
      where: { contractId_operation: { contractId, operation: "VOID_AUTHORIZATION" } },
      create: { contractId, operation: "VOID_AUTHORIZATION", idempotencyKey: `pact-void-${contractId}`, attempts: 1 },
      update: { attempts: { increment: 1 }, status: "PENDING" },
    });
    await transitionContract(tx, contractId, {
      status: "VOID_PENDING",
      paymentState: "VOID_PENDING",
      actor,
      reason,
      paymentEvent: { source: "USER", kind: "void.requested", orderId: contract.paypalOrder.id },
    });
    return { auth, op, orderRowId: contract.paypalOrder.id };
  });

  try {
    await voidAuthorization(paypalClient(), prepared.auth.paypalAuthorizationId, prepared.op.idempotencyKey);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.$transaction(async (tx) => {
      await tx.financialOperation.update({ where: { id: prepared.op.id }, data: { status: error instanceof PayPalUncertainError ? "UNCERTAIN" : "FAILED", lastError: message.slice(0, 2000) } });
      await transitionContract(tx, contractId, { status: "AUTHORIZED", paymentState: "AUTHORIZED", actor: SYSTEM_ACTOR, reason: `Void failed: ${message}`, severity: "WARNING", paymentEvent: { source: "API", kind: "void.failed", orderId: prepared.orderRowId } });
    });
    if (error instanceof PayPalUncertainError) await enqueue("payment.reconcile", { contractId }, { contractId });
    throw error instanceof PayPalApiError ? new HttpError(502, `PayPal could not void the authorization: ${error.message}`, "paypal_error") : error;
  }

  await db.$transaction(async (tx) => {
    await tx.payPalAuthorization.update({ where: { id: prepared.auth.id }, data: { status: "VOIDED" } });
    await tx.financialOperation.update({ where: { id: prepared.op.id }, data: { status: "SUCCEEDED", finishedAt: new Date() } });
    await transitionContract(tx, contractId, {
      status: "VOIDED",
      paymentState: "VOIDED",
      actor: SYSTEM_ACTOR,
      reason: `Authorization ${prepared.auth.paypalAuthorizationId} voided. The hold on the payer's funds is released.`,
      severity: "NOTICE",
      paymentEvent: { source: "API", kind: "void.completed", orderId: prepared.orderRowId, payload: toJson({ authorizationId: prepared.auth.paypalAuthorizationId }) },
    });
  });
}

// ---------------------------------------------------------------------------
// Reconciliation
// ---------------------------------------------------------------------------

/**
 * Pulls the order from PayPal and brings local records in line. Used after
 * uncertain outcomes, webhook events, and on a schedule.
 */
export async function reconcileContractPayment(contractId: string, actor: Actor = SYSTEM_ACTOR): Promise<{ changed: boolean; summary: string }> {
  assertPayPalConfigured();
  const local = await db.payPalOrder.findUnique({ where: { contractId }, include: { contract: true, authorizations: { include: { captures: true } } } });
  if (!local) return { changed: false, summary: "No PayPal order recorded for this contract." };

  const client = paypalClient();
  const remote = await getOrder(client, local.paypalOrderId);
  const notes: string[] = [];
  await db.payPalOrder.update({ where: { id: local.id }, data: { status: remote.status, latestResponse: toJson(remote), payerId: remote.payer?.payer_id ?? local.payerId, payerEmail: remote.payer?.email_address ?? local.payerEmail } });

  const remoteAuth = firstAuthorization(remote);
  if (remoteAuth) {
    const current = await getAuthorization(client, remoteAuth.id).catch(() => remoteAuth);
    const known = local.authorizations.find((a) => a.paypalAuthorizationId === current.id);
    if (!known || known.status !== current.status) notes.push(`authorization ${current.id} is ${current.status}`);
    await persistAuthorization(contractId, local.id, current, remote, actor, "SYSTEM");
    const authRow = await db.payPalAuthorization.findUniqueOrThrow({ where: { paypalAuthorizationId: current.id } });

    const remoteCaptures = remote.purchase_units?.[0]?.payments?.captures ?? [];
    for (const capture of remoteCaptures) {
      const knownCapture = authRow && local.authorizations.flatMap((a) => a.captures).find((c) => c.paypalCaptureId === capture.id);
      if (!knownCapture || knownCapture.status !== capture.status) {
        notes.push(`capture ${capture.id} is ${capture.status}`);
        const op = await db.financialOperation.findUnique({ where: { contractId_operation: { contractId, operation: "CAPTURE_AUTHORIZATION" } } });
        await recordCaptureResult(contractId, authRow.id, local.id, capture, op?.id ?? null, actor, "SYSTEM");
      }
    }

    const fresh = await db.contract.findUniqueOrThrow({ where: { id: contractId } });
    if (fresh.paymentState === "CAPTURE_UNCERTAIN" && remoteCaptures.length === 0) {
      await db.$transaction(async (tx) => {
        await tx.financialOperation.updateMany({ where: { contractId, operation: "CAPTURE_AUTHORIZATION" }, data: { status: "FAILED", lastError: "Reconciliation found no capture at PayPal." } });
        await transitionContract(tx, contractId, { status: "ELIGIBLE_FOR_CAPTURE", paymentState: "AUTHORIZED", actor, reason: "Reconciliation: PayPal shows no capture; the authorization is still open.", paymentEvent: { source: "SYSTEM", kind: "reconcile.no_capture", orderId: local.id } });
      });
      notes.push("uncertain capture resolved: not captured");
    }

    if ((current.status === "VOIDED" || current.status === "EXPIRED") && fresh.paymentState === "AUTHORIZED") {
      const paymentState = current.status === "VOIDED" ? "VOIDED" : "EXPIRED";
      await db.$transaction(async (tx) => {
        await transitionContract(tx, contractId, {
          status: paymentState === "VOIDED" ? (fresh.status === "VOID_PENDING" ? "VOIDED" : undefined) : "EXPIRED",
          paymentState: paymentState === "VOIDED" ? "VOID_PENDING" : "EXPIRED",
          actor,
          reason: `Reconciliation: PayPal reports the authorization is ${current.status}.`,
          severity: "WARNING",
          paymentEvent: { source: "SYSTEM", kind: `authorization.${current.status.toLowerCase()}`, orderId: local.id },
        });
        if (paymentState === "VOIDED") {
          await transitionContract(tx, contractId, { paymentState: "VOIDED", status: fresh.status === "VOID_PENDING" ? undefined : "VOID_PENDING", actor, reason: "Authorization voided at PayPal." });
        }
      });
      notes.push(`authorization ${current.status.toLowerCase()}`);
    }
  } else if (remote.status === "APPROVED" && local.contract.paymentState === "AWAITING_PAYER_APPROVAL") {
    await db.$transaction((tx) => transitionContract(tx, contractId, { paymentState: "PAYER_APPROVED", actor, reason: "Reconciliation: payer approved the order.", paymentEvent: { source: "SYSTEM", kind: "order.payer_approved", orderId: local.id } }));
    notes.push("payer approved");
  }

  const summary = notes.length ? `Reconciled: ${notes.join("; ")}.` : "Reconciled: no changes.";
  await recordAudit({ organizationId: local.organizationId, contractId, actorType: "SYSTEM", actorLabel: "Reconciliation", action: "payment.reconciled", title: summary, metadata: { paypalOrderId: local.paypalOrderId, status: remote.status } });
  return { changed: notes.length > 0, summary };
}

/** Marks authorizations past their PayPal expiry as expired. Run on a schedule by the worker. */
export async function expireStaleAuthorizations(): Promise<number> {
  const now = new Date();
  const stale = await db.payPalAuthorization.findMany({
    where: { status: "CREATED", expirationTime: { lt: now }, order: { contract: { paymentState: "AUTHORIZED" } } },
    include: { order: true },
  });
  let count = 0;
  for (const auth of stale) {
    try {
      await db.$transaction(async (tx) => {
        await tx.payPalAuthorization.update({ where: { id: auth.id }, data: { status: "EXPIRED" } });
        await transitionContract(tx, auth.order.contractId, {
          status: "EXPIRED",
          paymentState: "EXPIRED",
          actor: SYSTEM_ACTOR,
          reason: `Authorization ${auth.paypalAuthorizationId} expired at ${auth.expirationTime?.toISOString()}. No capture is possible without a new authorization.`,
          severity: "WARNING",
          paymentEvent: { source: "SYSTEM", kind: "authorization.expired", orderId: auth.orderId },
        });
      });
      count += 1;
    } catch (error) {
      logger.warn("Could not expire authorization", { authorizationId: auth.paypalAuthorizationId, error: String(error) });
    }
  }
  return count;
}

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

export async function processWebhookEvent(webhookEventId: string): Promise<void> {
  const event = await db.webhookEvent.findUniqueOrThrow({ where: { id: webhookEventId } });
  if (event.processingStatus === "PROCESSED" || event.processingStatus === "IGNORED") return;
  if (!event.signatureVerified) {
    await db.webhookEvent.update({ where: { id: event.id }, data: { processingStatus: "REJECTED", processedAt: new Date(), error: "Signature not verified." } });
    return;
  }
  const payload = event.payload as { resource?: Record<string, unknown> };
  const resource = payload.resource ?? {};
  const contractId = await locateContract(event.resourceType, event.resourceId, resource);
  if (!contractId) {
    await db.webhookEvent.update({ where: { id: event.id }, data: { processingStatus: "IGNORED", processedAt: new Date(), error: "No matching contract." } });
    return;
  }
  try {
    const result = await reconcileContractPayment(contractId, { type: "WEBHOOK", label: `PayPal webhook ${event.eventType}` });
    await db.webhookEvent.update({ where: { id: event.id }, data: { processingStatus: "PROCESSED", processedAt: new Date(), error: result.summary } });
  } catch (error) {
    await db.webhookEvent.update({ where: { id: event.id }, data: { processingStatus: "FAILED", error: String(error).slice(0, 2000) } });
    throw error;
  }
}

async function locateContract(resourceType: string | null, resourceId: string | null, resource: Record<string, unknown>): Promise<string | null> {
  const customId = typeof resource.custom_id === "string" ? resource.custom_id : undefined;
  if (customId) {
    const byCustom = await db.contract.findUnique({ where: { id: customId }, select: { id: true } });
    if (byCustom) return byCustom.id;
  }
  if (!resourceId) return null;
  if (resourceType === "checkout-order" || resourceType === "order") {
    const order = await db.payPalOrder.findUnique({ where: { paypalOrderId: resourceId }, select: { contractId: true } });
    return order?.contractId ?? null;
  }
  if (resourceType === "authorization") {
    const auth = await db.payPalAuthorization.findUnique({ where: { paypalAuthorizationId: resourceId }, include: { order: true } });
    return auth?.order.contractId ?? null;
  }
  if (resourceType === "capture") {
    const capture = await db.payPalCapture.findUnique({ where: { paypalCaptureId: resourceId }, include: { authorization: { include: { order: true } } } });
    if (capture) return capture.authorization.order.contractId;
  }
  // Fall back to the supplementary order link that PayPal includes in payment resources.
  const links = (resource.links as { rel?: string; href?: string }[] | undefined) ?? [];
  const up = links.find((l) => l.rel === "up")?.href;
  const orderIdMatch = up ? /\/orders\/([A-Z0-9]+)/.exec(up) : null;
  if (orderIdMatch) {
    const order = await db.payPalOrder.findUnique({ where: { paypalOrderId: orderIdMatch[1] }, select: { contractId: true } });
    if (order) return order.contractId;
  }
  const related = (resource.supplementary_data as { related_ids?: { order_id?: string } } | undefined)?.related_ids?.order_id;
  if (related) {
    const order = await db.payPalOrder.findUnique({ where: { paypalOrderId: related }, select: { contractId: true } });
    return order?.contractId ?? null;
  }
  return null;
}
