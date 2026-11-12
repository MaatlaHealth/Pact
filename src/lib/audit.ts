import { db } from "@/lib/db";
import type { ActorType, AuditSeverity, Prisma } from "@/generated/prisma/client";
import { logger } from "@/lib/logger";

export interface AuditInput {
  organizationId?: string | null;
  contractId?: string | null;
  actorType: ActorType;
  actorId?: string | null;
  actorLabel?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  title: string;
  description?: string;
  severity?: AuditSeverity;
  metadata?: Prisma.InputJsonValue;
  ipAddress?: string | null;
}

type Tx = Prisma.TransactionClient;

/**
 * Records an audit event. Pass a transaction client when the event must be
 * written atomically with the state change it describes.
 */
export async function recordAudit(input: AuditInput, tx?: Tx) {
  const client = tx ?? db;
  const event = await client.auditEvent.create({
    data: {
      organizationId: input.organizationId ?? null,
      contractId: input.contractId ?? null,
      actorType: input.actorType,
      actorId: input.actorId ?? null,
      actorLabel: input.actorLabel ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      title: input.title,
      description: input.description,
      severity: input.severity ?? "INFO",
      metadata: input.metadata,
      ipAddress: input.ipAddress ?? null,
    },
  });
  logger.info(`audit ${input.action}`, { contractId: input.contractId, organizationId: input.organizationId });
  return event;
}
