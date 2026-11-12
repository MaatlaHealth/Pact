import type { PayPalClient } from "@/lib/paypal/client";

export interface WebhookTransmissionHeaders {
  authAlgo: string | null;
  certUrl: string | null;
  transmissionId: string | null;
  transmissionSig: string | null;
  transmissionTime: string | null;
}

export function readTransmissionHeaders(headers: Headers): WebhookTransmissionHeaders {
  return {
    authAlgo: headers.get("paypal-auth-algo"),
    certUrl: headers.get("paypal-cert-url"),
    transmissionId: headers.get("paypal-transmission-id"),
    transmissionSig: headers.get("paypal-transmission-sig"),
    transmissionTime: headers.get("paypal-transmission-time"),
  };
}

export type WebhookVerification = { status: "SUCCESS" } | { status: "FAILURE"; reason: string };

/**
 * Verifies a webhook signature through PayPal's verification endpoint. The
 * raw event body must be passed exactly as received.
 */
export async function verifyWebhookSignature(
  client: PayPalClient,
  webhookId: string,
  headers: WebhookTransmissionHeaders,
  rawEvent: unknown,
): Promise<WebhookVerification> {
  if (!headers.authAlgo || !headers.certUrl || !headers.transmissionId || !headers.transmissionSig || !headers.transmissionTime) {
    return { status: "FAILURE", reason: "Missing PayPal transmission headers." };
  }
  if (!/^https:\/\/(api|api-m)\.(sandbox\.)?paypal\.com\//.test(headers.certUrl)) {
    return { status: "FAILURE", reason: "Certificate URL is not a PayPal host." };
  }
  const { data } = await client.request<{ verification_status?: string }>({
    method: "POST",
    path: "/v1/notifications/verify-webhook-signature",
    body: {
      auth_algo: headers.authAlgo,
      cert_url: headers.certUrl,
      transmission_id: headers.transmissionId,
      transmission_sig: headers.transmissionSig,
      transmission_time: headers.transmissionTime,
      webhook_id: webhookId,
      webhook_event: rawEvent,
    },
  });
  if (data?.verification_status === "SUCCESS") return { status: "SUCCESS" };
  return { status: "FAILURE", reason: `PayPal reported ${data?.verification_status ?? "no status"}.` };
}

export const HANDLED_WEBHOOK_EVENTS = [
  "CHECKOUT.ORDER.APPROVED",
  "CHECKOUT.ORDER.COMPLETED",
  "PAYMENT.AUTHORIZATION.CREATED",
  "PAYMENT.AUTHORIZATION.VOIDED",
  "PAYMENT.CAPTURE.COMPLETED",
  "PAYMENT.CAPTURE.PENDING",
  "PAYMENT.CAPTURE.DENIED",
  "PAYMENT.CAPTURE.REFUNDED",
  "PAYMENT.CAPTURE.REVERSED",
] as const;
