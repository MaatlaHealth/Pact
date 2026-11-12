import type { PayPalClient } from "@/lib/paypal/client";
import type { PayPalAuthorizationResource, PayPalCaptureResource } from "@/lib/paypal/types";
import { centsToPayPalValue } from "@/lib/money";

export async function getAuthorization(client: PayPalClient, authorizationId: string): Promise<PayPalAuthorizationResource> {
  const { data } = await client.request<PayPalAuthorizationResource>({ method: "GET", path: `/v2/payments/authorizations/${encodeURIComponent(authorizationId)}` });
  return data;
}

export interface CaptureInput {
  requestId: string;
  amountCents: number;
  currency: string;
  invoiceId?: string;
  noteToPayer?: string;
}

/**
 * Captures an authorization. PACT always performs a single final capture for
 * the agreed amount. Partial and multiple captures are intentionally not
 * supported because the policy engine authorises exactly one settlement.
 */
export async function captureAuthorization(client: PayPalClient, authorizationId: string, input: CaptureInput): Promise<PayPalCaptureResource> {
  const { data } = await client.request<PayPalCaptureResource>({
    method: "POST",
    path: `/v2/payments/authorizations/${encodeURIComponent(authorizationId)}/capture`,
    requestId: input.requestId,
    preferRepresentation: true,
    body: {
      amount: { currency_code: input.currency, value: centsToPayPalValue(input.amountCents) },
      final_capture: true,
      ...(input.invoiceId ? { invoice_id: input.invoiceId } : {}),
      ...(input.noteToPayer ? { note_to_payer: input.noteToPayer.slice(0, 255) } : {}),
    },
  });
  return data;
}

export async function voidAuthorization(client: PayPalClient, authorizationId: string, requestId: string): Promise<PayPalAuthorizationResource | undefined> {
  const { data, status } = await client.request<PayPalAuthorizationResource | undefined>({
    method: "POST",
    path: `/v2/payments/authorizations/${encodeURIComponent(authorizationId)}/void`,
    requestId,
    preferRepresentation: true,
  });
  return status === 204 ? undefined : data;
}

export async function getCapture(client: PayPalClient, captureId: string): Promise<PayPalCaptureResource> {
  const { data } = await client.request<PayPalCaptureResource>({ method: "GET", path: `/v2/payments/captures/${encodeURIComponent(captureId)}` });
  return data;
}

/**
 * Authorization lifecycle facts from PayPal's documentation, encoded so the
 * policy engine can reason about them without consulting a model.
 * An authorization is valid for 29 days. Funds are guaranteed during the
 * 3-day honor period; after that a capture may still be attempted but may be
 * declined, and reauthorization is possible once per authorization between
 * day 4 and day 29.
 */
export const AUTHORIZATION_VALID_DAYS = 29;
export const AUTHORIZATION_HONOR_DAYS = 3;

export function authorizationWindow(createTime: Date) {
  const honorEnds = new Date(createTime.getTime() + AUTHORIZATION_HONOR_DAYS * 86_400_000);
  const expires = new Date(createTime.getTime() + AUTHORIZATION_VALID_DAYS * 86_400_000);
  return { honorEnds, expires };
}
