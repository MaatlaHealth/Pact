import type { PayPalClient } from "@/lib/paypal/client";
import type { PayPalOrderResource } from "@/lib/paypal/types";
import { centsToPayPalValue } from "@/lib/money";

export interface CreateAuthorizeOrderInput {
  requestId: string;
  amountCents: number;
  currency: string;
  referenceId: string;
  customId: string;
  description: string;
  returnUrl: string;
  cancelUrl: string;
  brandName?: string;
  payeeEmail?: string;
}

/**
 * Creates an order with intent AUTHORIZE. The order is not a payment and not an
 * authorization. Funds are only reserved after the payer approves and
 * authorizeOrder succeeds.
 */
export async function createAuthorizeOrder(client: PayPalClient, input: CreateAuthorizeOrderInput): Promise<PayPalOrderResource> {
  const { data } = await client.request<PayPalOrderResource>({
    method: "POST",
    path: "/v2/checkout/orders",
    requestId: input.requestId,
    preferRepresentation: true,
    body: {
      intent: "AUTHORIZE",
      purchase_units: [
        {
          reference_id: input.referenceId,
          custom_id: input.customId,
          description: input.description.slice(0, 127),
          amount: { currency_code: input.currency, value: centsToPayPalValue(input.amountCents) },
          ...(input.payeeEmail ? { payee: { email_address: input.payeeEmail } } : {}),
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: input.brandName ?? "PACT Protocol",
            user_action: "PAY_NOW",
            shipping_preference: "NO_SHIPPING",
            landing_page: "LOGIN",
            return_url: input.returnUrl,
            cancel_url: input.cancelUrl,
          },
        },
      },
    },
  });
  return data;
}

export async function getOrder(client: PayPalClient, orderId: string): Promise<PayPalOrderResource> {
  const { data } = await client.request<PayPalOrderResource>({ method: "GET", path: `/v2/checkout/orders/${encodeURIComponent(orderId)}` });
  return data;
}

/**
 * Authorizes an approved order. This is the step that actually places a hold
 * on the payer's funds. Idempotent under the same request ID.
 */
export async function authorizeOrder(client: PayPalClient, orderId: string, requestId: string): Promise<PayPalOrderResource> {
  const { data } = await client.request<PayPalOrderResource>({
    method: "POST",
    path: `/v2/checkout/orders/${encodeURIComponent(orderId)}/authorize`,
    requestId,
    preferRepresentation: true,
    body: {},
  });
  return data;
}

export function approvalLink(order: PayPalOrderResource): string | undefined {
  return order.links?.find((l) => l.rel === "payer-action")?.href ?? order.links?.find((l) => l.rel === "approve")?.href;
}

export function firstAuthorization(order: PayPalOrderResource) {
  return order.purchase_units?.[0]?.payments?.authorizations?.[0];
}

export function firstCapture(order: PayPalOrderResource) {
  return order.purchase_units?.[0]?.payments?.captures?.[0];
}
