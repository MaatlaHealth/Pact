import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { paypalClient, paypalConfigured, verifyWebhookSignature, readTransmissionHeaders, type PayPalWebhookEvent } from "@/lib/paypal";
import { enqueue } from "@/lib/jobs/queue";

export const dynamic = "force-dynamic";

/**
 * PayPal webhook receiver. Every event is stored, signature-verified through
 * PayPal's verification API, deduplicated by event ID, and then processed by
 * the worker through reconciliation. Unverified events are stored as REJECTED
 * and never acted on.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  let event: PayPalWebhookEvent;
  try {
    event = JSON.parse(raw) as PayPalWebhookEvent;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  if (!event?.id || !event.event_type) return NextResponse.json({ error: "Missing event id or type." }, { status: 400 });

  const webhookId = env().PAYPAL_WEBHOOK_ID;
  let verified = false;
  let verificationStatus = "NOT_ATTEMPTED";
  if (!paypalConfigured() || !webhookId) {
    verificationStatus = "WEBHOOK_NOT_CONFIGURED";
  } else {
    try {
      const result = await verifyWebhookSignature(paypalClient(), webhookId, readTransmissionHeaders(request.headers), event);
      verified = result.status === "SUCCESS";
      verificationStatus = result.status === "SUCCESS" ? "SUCCESS" : `FAILURE: ${result.reason}`;
    } catch (error) {
      verificationStatus = `ERROR: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  const resourceId = typeof event.resource?.id === "string" ? event.resource.id : null;
  let stored;
  try {
    stored = await db.webhookEvent.create({
      data: {
        eventId: event.id,
        eventType: event.event_type,
        resourceType: event.resource_type ?? null,
        resourceId,
        signatureVerified: verified,
        verificationStatus,
        processingStatus: verified ? "RECEIVED" : "REJECTED",
        payload: JSON.parse(raw) as Prisma.InputJsonValue,
        error: verified ? null : verificationStatus,
      },
    });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      logger.info("Duplicate webhook event ignored", { eventId: event.id });
      await db.webhookEvent.updateMany({ where: { eventId: event.id, processingStatus: "PROCESSED" }, data: {} });
      return NextResponse.json({ received: true, duplicate: true });
    }
    throw error;
  }

  if (!verified) {
    logger.warn("Rejected unverified PayPal webhook", { eventId: event.id, verificationStatus });
    // 200 keeps PayPal from retrying a forged event; the record shows it was rejected.
    return NextResponse.json({ received: true, verified: false });
  }
  await enqueue("webhook.process", { webhookEventId: stored.id }, { dedupeKey: `webhook:${stored.id}` });
  return NextResponse.json({ received: true, verified: true });
}
