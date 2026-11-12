import type { ContractStatus, PaymentState, Prisma, VerificationState, ActorType, AuditSeverity } from "@/generated/prisma/client";
import { assertContractTransition, assertPaymentTransition, assertVerificationTransition, CONTRACT_STATUS_LABELS, PAYMENT_STATE_LABELS } from "@/lib/policy/state-machine";
import { recordAudit } from "@/lib/audit";

type Tx = Prisma.TransactionClient;

export interface TransitionInput {
  status?: ContractStatus;
  paymentState?: PaymentState;
  verificationState?: VerificationState;
  data?: Prisma.ContractUpdateInput;
  actor: { type: ActorType; id?: string | null; label?: string | null };
  reason: string;
  severity?: AuditSeverity;
  metadata?: Prisma.InputJsonValue;
  paymentEvent?: { source: "API" | "WEBHOOK" | "SYSTEM" | "USER"; kind: string; orderId?: string | null; payload?: Prisma.InputJsonValue };
}

/**
 * Applies validated state changes to a contract and records the audit trail
 * in the same transaction. Rows are locked with SELECT ... FOR UPDATE so two
 * concurrent transitions cannot both succeed from the same prior state.
 */
export async function transitionContract(tx: Tx, contractId: string, input: TransitionInput) {
  const locked = await tx.$queryRaw<{ id: string; status: ContractStatus; payment_state: PaymentState; verification_state: VerificationState; organization_id: string }[]>`
    SELECT id, status, payment_state, verification_state, organization_id FROM contracts WHERE id = ${contractId} FOR UPDATE
  `;
  const current = locked[0];
  if (!current) throw new Error(`Contract ${contractId} not found.`);

  // Self-transitions are rejected: a second concurrent caller that waited on the
  // row lock sees the state its rival already produced and fails here.
  if (input.status) assertContractTransition(current.status, input.status);
  if (input.paymentState) assertPaymentTransition(current.payment_state, input.paymentState);
  if (input.verificationState) assertVerificationTransition(current.verification_state, input.verificationState);

  const updated = await tx.contract.update({
    where: { id: contractId },
    data: {
      ...(input.status ? { status: input.status } : {}),
      ...(input.paymentState ? { paymentState: input.paymentState } : {}),
      ...(input.verificationState ? { verificationState: input.verificationState } : {}),
      ...(input.data ?? {}),
    },
  });

  const parts: string[] = [];
  if (input.status && input.status !== current.status) parts.push(`${CONTRACT_STATUS_LABELS[current.status]} to ${CONTRACT_STATUS_LABELS[input.status]}`);
  if (input.paymentState && input.paymentState !== current.payment_state) parts.push(`payment ${PAYMENT_STATE_LABELS[current.payment_state]} to ${PAYMENT_STATE_LABELS[input.paymentState]}`);
  if (input.verificationState && input.verificationState !== current.verification_state) parts.push(`verification ${current.verification_state} to ${input.verificationState}`);

  await recordAudit(
    {
      organizationId: current.organization_id,
      contractId,
      actorType: input.actor.type,
      actorId: input.actor.id,
      actorLabel: input.actor.label,
      action: "contract.transition",
      entityType: "contract",
      entityId: contractId,
      title: parts.length ? `Contract moved: ${parts.join("; ")}` : "Contract updated",
      description: input.reason,
      severity: input.severity ?? "INFO",
      metadata: {
        from: { status: current.status, paymentState: current.payment_state, verificationState: current.verification_state },
        to: { status: updated.status, paymentState: updated.paymentState, verificationState: updated.verificationState },
        ...(input.metadata && typeof input.metadata === "object" ? (input.metadata as Record<string, unknown>) : {}),
      },
    },
    tx,
  );

  if (input.paymentEvent) {
    await tx.paymentEvent.create({
      data: {
        contractId,
        orderId: input.paymentEvent.orderId ?? null,
        source: input.paymentEvent.source,
        kind: input.paymentEvent.kind,
        fromState: current.payment_state,
        toState: updated.paymentState,
        payload: input.paymentEvent.payload,
      },
    });
  }

  return updated;
}
