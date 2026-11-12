import { handler, ok } from "@/lib/api/respond";
import { requirePrincipal } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

export const GET = handler(async (request) => {
  const principal = await requirePrincipal(request, "VIEWER");
  const orders = await db.payPalOrder.findMany({
    where: { organizationId: principal.organization.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { contract: { select: { id: true, title: true, status: true, paymentState: true } }, authorizations: { orderBy: { createdAt: "desc" }, include: { captures: { select: { paypalCaptureId: true, status: true, amountCents: true, currency: true, createdAt: true } } }, omit: { rawResponse: true } } },
    omit: { createResponse: true, latestResponse: true },
  });
  const webhooks = await db.webhookEvent.findMany({ orderBy: { receivedAt: "desc" }, take: 25, select: { id: true, eventId: true, eventType: true, resourceType: true, resourceId: true, signatureVerified: true, verificationStatus: true, processingStatus: true, receivedAt: true, processedAt: true, error: true } });
  return ok({ environment: env().PAYPAL_ENVIRONMENT, orders, webhooks });
});
