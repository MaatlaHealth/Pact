# PayPal integration

PACT uses the PayPal REST API directly (no SDK wrapper) through `src/lib/paypal/client.ts`. Sandbox is the default and live is an explicit opt-in.

## Endpoints used

| Purpose | Endpoint |
| --- | --- |
| OAuth token | `POST /v1/oauth2/token` (client credentials) |
| Create order | `POST /v2/checkout/orders` with `intent: AUTHORIZE` |
| Read order | `GET /v2/checkout/orders/{id}` |
| Authorize order | `POST /v2/checkout/orders/{id}/authorize` |
| Read authorization | `GET /v2/payments/authorizations/{id}` |
| Capture | `POST /v2/payments/authorizations/{id}/capture` with `final_capture: true` |
| Void | `POST /v2/payments/authorizations/{id}/void` |
| Read capture | `GET /v2/payments/captures/{id}` |
| Verify webhook | `POST /v1/notifications/verify-webhook-signature` |

## Order creation

The order uses the `payment_source.paypal.experience_context` flow with `user_action: PAY_NOW`, `shipping_preference: NO_SHIPPING`, and return and cancel URLs pointing at `<APP_URL>/api/payments/paypal/return?contract=<id>` and the contract page. The contract ID is sent as `custom_id` and `reference_id` so webhooks can be matched even when PayPal omits the order link. If `PAYPAL_PAYEE_EMAIL` is set, it is sent as the purchase unit payee and the policy engine requires the stored order to match it.

## Authorization lifecycle

From PayPal's documentation:

- An authorization is valid for 29 days.
- Funds are guaranteed during the 3-day honor period; after that a capture may still be attempted but can be declined.
- Reauthorization is possible once between day 4 and day 29. PACT does not reauthorize automatically; an expired authorization moves the contract to EXPIRED and a new contract is required.
- Partial captures and multiple captures depend on account configuration. PACT always performs exactly one final capture for the agreed amount, so those features are not used.

The worker's maintenance job marks authorizations past `expiration_time` as expired and reconciles contracts stuck in CAPTURE_PENDING, CAPTURE_UNCERTAIN, or VOID_PENDING.

## Idempotency and uncertainty

Every write carries `PayPal-Request-Id` equal to the `FinancialOperation.idempotencyKey` (`pact-order-<contract>`, `pact-auth-<contract>`, `pact-capture-<contract>`, `pact-void-<contract>`). PayPal returns the original result for a repeated request ID, and the database's unique constraint on `(contractId, operation)` prevents a second operation row from existing.

If the HTTP request fails without a response, the client throws `PayPalUncertainError`. The service records the operation as UNCERTAIN, moves the payment state to CAPTURE_UNCERTAIN (for captures), and schedules reconciliation. Reconciliation reads the order and resolves the state from PayPal's answer; it never issues another capture.

## Webhooks

`POST /api/webhooks/paypal` stores the event, verifies the signature with the registered webhook ID, deduplicates by event ID, and queues processing. Processing locates the contract (by `custom_id`, by order, authorization, or capture ID, or by the `up` link) and reconciles it. Events that fail verification are stored with `processingStatus = REJECTED` and are never acted on; the endpoint still returns 200 so PayPal does not retry a forged event.

Subscribe to: `CHECKOUT.ORDER.APPROVED`, `CHECKOUT.ORDER.COMPLETED`, `PAYMENT.AUTHORIZATION.CREATED`, `PAYMENT.AUTHORIZATION.VOIDED`, `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.PENDING`, `PAYMENT.CAPTURE.DENIED`, `PAYMENT.CAPTURE.REFUNDED`, `PAYMENT.CAPTURE.REVERSED`.

## Sandbox accounts

- The REST app's merchant account receives captures unless `PAYPAL_PAYEE_EMAIL` names another sandbox business account.
- The owner approves orders with a sandbox personal account. Balances can be adjusted in the developer dashboard.
- USD is the primary currency for the judge flow.

## Paying third-party workers

Captures settle to the configured merchant. Paying an independent third-party agent would require PayPal's platform or marketplace products (for example, Multiparty payments with partner onboarding) and the associated approvals. PACT does not simulate such payouts; the worker agents in this build are platform-registered and settlement goes to the platform merchant account.

## Errors

PayPal errors are surfaced with their `name`, `message`, `debug_id`, and `details[].issue`. The API returns them as `paypal_error` (502) with those fields so a client can act on issues such as `AUTHORIZATION_ALREADY_CAPTURED` or `INSTRUMENT_DECLINED`.
