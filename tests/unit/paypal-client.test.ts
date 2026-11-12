import { describe, it, expect, vi } from "vitest";
import { PayPalClient, PayPalApiError, PayPalUncertainError } from "@/lib/paypal/client";
import { createAuthorizeOrder, authorizeOrder, approvalLink } from "@/lib/paypal/orders";
import { captureAuthorization, authorizationWindow } from "@/lib/paypal/payments";
import { verifyWebhookSignature } from "@/lib/paypal/webhooks";
import { centsToPayPalValue, payPalValueToCents } from "@/lib/money";

function fakeFetch(handlers: Record<string, (init: RequestInit) => { status: number; body?: unknown }>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init: init ?? {} });
    const key = Object.keys(handlers).find((k) => url.includes(k));
    if (!key) return new Response(JSON.stringify({ name: "NOT_FOUND" }), { status: 404 });
    const result = handlers[key](init ?? {});
    return new Response(result.body === undefined ? null : JSON.stringify(result.body), { status: result.status, headers: { "content-type": "application/json" } });
  });
  return { impl: impl as unknown as typeof fetch, calls };
}

const token = { "/v1/oauth2/token": () => ({ status: 200, body: { access_token: "A21AAtest", expires_in: 3600 } }) };

describe("PayPal client", () => {
  it("obtains and caches an access token", async () => {
    const f = fakeFetch({ ...token, "/v2/checkout/orders/ORD1": () => ({ status: 200, body: { id: "ORD1", status: "APPROVED", intent: "AUTHORIZE", purchase_units: [] } }) });
    const client = new PayPalClient({ clientId: "id", clientSecret: "secret", environment: "sandbox", fetchImpl: f.impl });
    await client.request({ method: "GET", path: "/v2/checkout/orders/ORD1" });
    await client.request({ method: "GET", path: "/v2/checkout/orders/ORD1" });
    expect(f.calls.filter((c) => c.url.includes("oauth2")).length).toBe(1);
  });

  it("sends PayPal-Request-Id and intent AUTHORIZE on order creation", async () => {
    const f = fakeFetch({ ...token, "/v2/checkout/orders": (init) => ({ status: 201, body: { id: "ORD2", status: "PAYER_ACTION_REQUIRED", intent: "AUTHORIZE", purchase_units: [], links: [{ rel: "payer-action", href: "https://www.sandbox.paypal.com/checkoutnow?token=ORD2" }], echo: init.body } }) });
    const client = new PayPalClient({ clientId: "id", clientSecret: "secret", fetchImpl: f.impl });
    const order = await createAuthorizeOrder(client, { requestId: "pact-order-c1", amountCents: 5500, currency: "USD", referenceId: "c1", customId: "c1", description: "PACT contract", returnUrl: "https://app/return", cancelUrl: "https://app/cancel" });
    const call = f.calls.find((c) => c.url.endsWith("/v2/checkout/orders"))!;
    expect((call.init.headers as Record<string, string>)["PayPal-Request-Id"]).toBe("pact-order-c1");
    const body = JSON.parse(String(call.init.body));
    expect(body.intent).toBe("AUTHORIZE");
    expect(body.purchase_units[0].amount).toEqual({ currency_code: "USD", value: "55.00" });
    expect(approvalLink(order)).toContain("checkoutnow");
  });

  it("retries 5xx with the same request id and surfaces 4xx details", async () => {
    let attempts = 0;
    const f = fakeFetch({
      ...token,
      "/authorize": () => {
        attempts += 1;
        return attempts < 2 ? { status: 503, body: { name: "SERVICE_UNAVAILABLE" } } : { status: 201, body: { id: "ORD3", status: "COMPLETED", intent: "AUTHORIZE", purchase_units: [{ amount: { currency_code: "USD", value: "55.00" }, payments: { authorizations: [{ id: "AUTH1", status: "CREATED", amount: { currency_code: "USD", value: "55.00" } }] } }] } };
      },
      "/capture": () => ({ status: 422, body: { name: "UNPROCESSABLE_ENTITY", message: "The requested action could not be performed.", debug_id: "abc123", details: [{ issue: "AUTHORIZATION_ALREADY_CAPTURED", description: "Authorization has already been captured." }] } }),
    });
    const client = new PayPalClient({ clientId: "id", clientSecret: "secret", fetchImpl: f.impl });
    const order = await authorizeOrder(client, "ORD3", "pact-auth-c1");
    expect(attempts).toBe(2);
    expect(order.purchase_units[0].payments?.authorizations?.[0].id).toBe("AUTH1");
    const ids = f.calls.filter((c) => c.url.includes("/authorize")).map((c) => (c.init.headers as Record<string, string>)["PayPal-Request-Id"]);
    expect(new Set(ids).size).toBe(1);

    await expect(captureAuthorization(client, "AUTH1", { requestId: "pact-capture-c1", amountCents: 5500, currency: "USD" })).rejects.toMatchObject({ name: "PayPalApiError", status: 422, debugId: "abc123" });
    try {
      await captureAuthorization(client, "AUTH1", { requestId: "pact-capture-c1", amountCents: 5500, currency: "USD" });
    } catch (error) {
      expect((error as PayPalApiError).hasIssue("AUTHORIZATION_ALREADY_CAPTURED")).toBe(true);
    }
  });

  it("reports an uncertain outcome when the network fails on a write", async () => {
    const impl = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("oauth2")) return new Response(JSON.stringify({ access_token: "t", expires_in: 3600 }), { status: 200 });
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    const client = new PayPalClient({ clientId: "id", clientSecret: "secret", fetchImpl: impl });
    await expect(captureAuthorization(client, "AUTH1", { requestId: "pact-capture-x", amountCents: 100, currency: "USD" })).rejects.toBeInstanceOf(PayPalUncertainError);
  });

  it("verifies webhook signatures through PayPal and rejects non-PayPal cert hosts", async () => {
    const f = fakeFetch({ ...token, "/v1/notifications/verify-webhook-signature": () => ({ status: 200, body: { verification_status: "SUCCESS" } }) });
    const client = new PayPalClient({ clientId: "id", clientSecret: "secret", fetchImpl: f.impl });
    const headers = { authAlgo: "SHA256withRSA", certUrl: "https://api.sandbox.paypal.com/v1/notifications/certs/CERT-1", transmissionId: "t1", transmissionSig: "sig", transmissionTime: "2026-11-12T10:00:00Z" };
    expect(await verifyWebhookSignature(client, "WH1", headers, { id: "WH-1" })).toEqual({ status: "SUCCESS" });
    const bad = await verifyWebhookSignature(client, "WH1", { ...headers, certUrl: "https://evil.example.com/cert" }, { id: "WH-1" });
    expect(bad.status).toBe("FAILURE");
    const missing = await verifyWebhookSignature(client, "WH1", { ...headers, transmissionSig: null }, { id: "WH-1" });
    expect(missing.status).toBe("FAILURE");
  });
});

describe("money helpers", () => {
  it("round-trips cents and PayPal decimal strings", () => {
    expect(centsToPayPalValue(5500)).toBe("55.00");
    expect(centsToPayPalValue(5)).toBe("0.05");
    expect(payPalValueToCents("55.00")).toBe(5500);
    expect(payPalValueToCents("55.5")).toBe(5550);
    expect(() => payPalValueToCents("abc")).toThrow();
    expect(() => centsToPayPalValue(12.5)).toThrow();
  });

  it("computes the PayPal authorization window", () => {
    const { honorEnds, expires } = authorizationWindow(new Date("2026-11-01T00:00:00Z"));
    expect(honorEnds.toISOString()).toBe("2026-11-04T00:00:00.000Z");
    expect(expires.toISOString()).toBe("2026-11-30T00:00:00.000Z");
  });
});
