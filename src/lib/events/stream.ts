import { db } from "@/lib/db";

/**
 * Server-Sent Events source for the live activity view. Polls the audit log
 * for the organization (optionally one contract) and pushes new rows. Polling
 * the database keeps this correct across multiple web instances and the
 * separate worker process without a message broker.
 */

export interface ActivityEventPayload {
  id: string;
  createdAt: string;
  actorType: string;
  actorLabel: string | null;
  action: string;
  title: string;
  description: string | null;
  severity: string;
  contractId: string | null;
  metadata: unknown;
}

export async function fetchEventsSince(organizationId: string, contractId: string | null, sinceId: string | null, limit = 100): Promise<ActivityEventPayload[]> {
  const rows = await db.auditEvent.findMany({
    where: { organizationId, ...(contractId ? { contractId } : {}), ...(sinceId ? { id: { gt: sinceId } } : {}) },
    orderBy: { id: "asc" },
    take: limit,
  });
  return rows.map((r) => ({ id: r.id, createdAt: r.createdAt.toISOString(), actorType: r.actorType, actorLabel: r.actorLabel, action: r.action, title: r.title, description: r.description, severity: r.severity, contractId: r.contractId, metadata: r.metadata }));
}

export function activityStream(organizationId: string, contractId: string | null, initialSinceId: string | null, signal: AbortSignal): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let sinceId = initialSinceId;
  let timer: NodeJS.Timeout | undefined;
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, data: unknown) => controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      send("ready", { organizationId, contractId });
      const tick = async () => {
        if (signal.aborted) return;
        try {
          const events = await fetchEventsSince(organizationId, contractId, sinceId);
          for (const e of events) {
            send("activity", e);
            sinceId = e.id;
          }
          if (contractId) {
            const contract = await db.contract.findUnique({ where: { id: contractId }, select: { status: true, paymentState: true, verificationState: true, updatedAt: true } });
            if (contract) send("contract", contract);
          }
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          // Transient database errors are retried on the next tick.
        }
        timer = setTimeout(tick, 1500);
      };
      void tick();
      signal.addEventListener("abort", () => {
        if (timer) clearTimeout(timer);
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
    cancel() {
      if (timer) clearTimeout(timer);
    },
  });
}
