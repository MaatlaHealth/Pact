import { describe, it, expect } from "vitest";
import { PayPalClient, createAuthorizeOrder, getOrder, approvalLink } from "@/lib/paypal";
import { generateStructured, userText } from "@/lib/gemini/client";
import { z } from "zod";

/**
 * Live integration tests. They run only when credentials are present and
 * are reported as skipped (blocked) otherwise. They never claim success
 * without a real round trip.
 */

const paypalReady = Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
const geminiReady = Boolean(process.env.GEMINI_API_KEY);

describe.skipIf(!paypalReady)("PayPal sandbox (live)", () => {
  it("authenticates, creates an AUTHORIZE order, and reads it back", async () => {
    const client = new PayPalClient();
    const requestId = `pact-test-${Date.now()}`;
    const order = await createAuthorizeOrder(client, { requestId, amountCents: 1500, currency: "USD", referenceId: "integration-test", customId: "integration-test", description: "PACT integration test order", returnUrl: "https://example.com/return", cancelUrl: "https://example.com/cancel" });
    expect(order.id).toBeTruthy();
    expect(order.intent).toBe("AUTHORIZE");
    expect(["CREATED", "PAYER_ACTION_REQUIRED"]).toContain(order.status);
    expect(approvalLink(order)).toMatch(/paypal\.com/);
    const fetched = await getOrder(client, order.id);
    expect(fetched.id).toBe(order.id);
    // Idempotency: same request id returns the same order.
    const again = await createAuthorizeOrder(client, { requestId, amountCents: 1500, currency: "USD", referenceId: "integration-test", customId: "integration-test", description: "PACT integration test order", returnUrl: "https://example.com/return", cancelUrl: "https://example.com/cancel" });
    expect(again.id).toBe(order.id);
  });
});

describe.skipIf(!geminiReady)("Gemini (live)", () => {
  it("returns schema-valid structured output", async () => {
    const schema = z.object({ decision: z.enum(["ACCEPT", "DECLINE"]), priceCents: z.number().int(), reason: z.string() });
    const result = await generateStructured({
      model: process.env.GEMINI_MODEL_WORKER ?? "gemini-3.8-flash",
      systemInstruction: "You are a worker agent quoting a fixed price for a small static website. Reply with JSON only.",
      contents: [userText("Task: a one-page landing site with four sections and a contact form. Quote a price in US cents between 2000 and 6000.")],
      schema,
      jsonSchema: { type: "object", properties: { decision: { type: "string", enum: ["ACCEPT", "DECLINE"] }, priceCents: { type: "integer" }, reason: { type: "string" } }, required: ["decision", "priceCents", "reason"] },
    });
    expect(["ACCEPT", "DECLINE"]).toContain(result.value.decision);
    expect(result.usage.inputTokens).toBeGreaterThan(0);
  });
});

describe("live credential status", () => {
  it("reports which live integrations were exercised", () => {
    // This test exists so the run output states clearly what was and was not tested live.
    console.log(`PayPal sandbox live test: ${paypalReady ? "ran" : "blocked (no credentials)"}`);
    console.log(`Gemini live test: ${geminiReady ? "ran" : "blocked (no credentials)"}`);
    expect(true).toBe(true);
  });
});
