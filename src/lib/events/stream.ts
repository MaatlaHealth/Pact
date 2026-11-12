import { db } from "@/lib/db";

/**
 * Server-Sent Events source for the live activity view. Polls the audit log
 * for the organization (optionally one contract) and pushes new rows. Polling
 * the database keeps this correct across multiple web instances and the
 * separate worker process without a message broker.
 *
 * Each stream closes itself after MAX_STREAM_MS so it fits inside serverless
 * execution limits (Netlify functions stop at 60 seconds). Every event carries
 * an `id`, so the browser's EventSource reconnects automatically and resumes
 * from `Last-Event-ID` without missing or duplicating rows.
 */

export const MAX_STREAM_MS = 45_000;
const POLL_MS = 1500;

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

/** Resume point: the browser's Last-Event-ID header wins over the query parameter. */
export function resumeIdFrom(request: Request): string | null {
  return request.headers.get("last-event-id") || new URL(request.url).searchParams.get("since") || null;
}

export function activityStream(organizationId: string, contractId: string | null, initialSinceId: string | null, signal: AbortSignal): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let sinceId = initialSinceId;
  let timer: NodeJS.Timeout | undefined;
  let closed = false;
  const startedAt = Date.now();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const close = () => {
        if (closed) return;
        closed = true;
        if (timer) clearTimeout(timer);
        try {
          controller.close();
        } catch {
          // already closed
        }
      };
      const send = (event: string, data: unknown, id?: string) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`${id ? `id: ${id}\n` : ""}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      controller.enqueue(encoder.encode("retry: 1500\n\n"));
      send("ready", { organizationId, contractId, maxStreamMs: MAX_STREAM_MS });
      const tick = async () => {
        if (signal.aborted || closed) return;
        try {
          const events = await fetchEventsSince(organizationId, contractId, sinceId);
          for (const e of events) {
            send("activity", e, e.id);
            sinceId = e.id;
          }
          if (contractId) {
            const contract = await db.contract.findUnique({ where: { id: contractId }, select: { status: true, paymentState: true, verificationState: true, updatedAt: true } });
            if (contract) send("contract", contract);
          }
          if (!closed) controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          // Transient database errors are retried on the next tick.
        }
        if (Date.now() - startedAt >= MAX_STREAM_MS) {
          close();
          return;
        }
        timer = setTimeout(tick, POLL_MS);
      };
      void tick();
      signal.addEventListener("abort", close);
    },
    cancel() {
      closed = true;
      if (timer) clearTimeout(timer);
    },
  });
}

export const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};
