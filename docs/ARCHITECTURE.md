# Architecture

## Overview

PACT is a Next.js 16 application with a separate worker process, both talking to one PostgreSQL database through Prisma 7 with the `pg` driver adapter. There is no message broker: background jobs live in a `jobs` table and are claimed with `SELECT ... FOR UPDATE SKIP LOCKED`. Real-time updates are Server-Sent Events that stream the audit log.

```
                    +---------------------------+
   Browser  <--->   |  Next.js 16 web process   |
   (PACT Control)   |  - server components      |
                    |  - route handlers /api    |
                    |  - SSE /api/activity      |
                    +-------------+-------------+
                                  |
                           PostgreSQL (Prisma)
                                  |
                    +-------------+-------------+
                    |  Worker process           |
                    |  - job loop               |
                    |  - agents (Gemini)        |
                    |  - verification (Chromium,|
                    |    Lighthouse, Ajv)       |
                    |  - PayPal reconciliation  |
                    |  - receipts, passports    |
                    +---------------------------+
                                  |
         PayPal REST, Gemini API, Resend, S3-compatible storage
```

## Module map

| Area | Path | Notes |
| --- | --- | --- |
| Environment | `src/lib/env.ts` | Zod-validated env; `integrationStatuses()` for honest config states |
| Database | `src/lib/db.ts`, `prisma/` | Lazy Prisma client; migrations include append-only triggers |
| Auth | `src/lib/auth/*`, `src/lib/security/*` | scrypt, HMAC token hashes, sessions, guards, API keys, CSRF, rate limits, SSRF |
| Organizations | `src/lib/orgs/service.ts` | Workspaces, memberships, invitations |
| Contracts | `src/lib/contracts/*` | Zod schema, canonical hashing, versions, approval, transitions, loaders |
| Agents | `src/lib/agents/*` | Runtime (runs, messages, tool executions), prompts, generator, negotiation, worker, verifier |
| Gemini | `src/lib/gemini/client.ts` | Structured output, retries, timeouts, token accounting |
| Verification | `src/lib/verification/*` | Check registry and implementations |
| Deliverables | `src/lib/deliverables/service.ts` | Validation, hashing, storage, preview URLs |
| Policy | `src/lib/policy/*` | Pure engine, DB snapshot loader, state machines |
| Payments | `src/lib/payments/service.ts`, `src/lib/paypal/*` | Lifecycle orchestration and typed PayPal client |
| Receipts | `src/lib/receipts/*` | Ed25519 signing, payload, verification, PDF |
| Passports | `src/lib/passport/service.ts` | Reputation recomputation |
| Jobs | `src/lib/jobs/*`, `src/worker/index.ts` | Queue, handlers, worker loop, maintenance |
| Events | `src/lib/events/stream.ts` | SSE source over the audit log |
| API | `src/app/api/**` | Route handlers (see docs/API.md) |
| UI | `src/app/(marketing)`, `src/app/(auth)`, `src/app/app`, `src/components` | Marketing, auth, application |
| Preview | `src/app/preview/[token]/[...path]/route.ts` | Sandboxed static serving |

## Data model

Core entities and their relationships (see `prisma/schema.prisma` for the full schema):

- `User`, `Session`, `EmailVerificationToken`, `PasswordResetToken`
- `Organization` with `Membership`, `Invitation`, `ApiKey`, `SpendingPolicy`, `IntegrationSetting`
- `Agent` with `AgentCapability`, `TrustPassport`; `AgentRun` with `AgentMessage`, `AgentToolExecution`
- `Contract` with `ContractVersion` and `AcceptanceCriterion`; `approvedVersionId` and `approvedHash` freeze the approved content
- `Deliverable` (manifest with per-file hashes and a root hash)
- `VerificationRun` with `VerificationResult` and append-only `EvidenceRecord`; `FormCapture` for form submissions
- `PolicyDecision` (append-only), `ApprovalRequest`
- `PayPalOrder`, `PayPalAuthorization`, `PayPalCapture`, `PaymentEvent` (append-only), `FinancialOperation` (unique per contract and operation), `WebhookEvent` (unique by event id)
- `Receipt`, `SigningKey`
- `AuditEvent`, `Job`, `RateLimitBucket`

Money is stored in integer minor units with an ISO currency code. Contract status, payment state, and verification state are separate columns with separate state machines.

## Contract lifecycle

```
DRAFT -> AWAITING_APPROVAL -> NEGOTIATING -> AWAITING_PAYMENT_AUTHORIZATION -> AUTHORIZED
  -> IN_PROGRESS -> UNDER_VERIFICATION -> { CORRECTION_REQUIRED -> IN_PROGRESS ... }
  -> { AWAITING_HUMAN_REVIEW } -> ELIGIBLE_FOR_CAPTURE -> CAPTURE_PENDING -> CAPTURED
Terminal: VOIDED, EXPIRED, FAILED, CANCELLED. DISPUTED from CAPTURED or AWAITING_HUMAN_REVIEW.
```

Payment: `NONE -> ORDER_CREATED -> AWAITING_PAYER_APPROVAL -> PAYER_APPROVED -> AUTHORIZED -> CAPTURE_PENDING -> CAPTURED`, with `CAPTURE_UNCERTAIN`, `VOID_PENDING -> VOIDED`, `EXPIRED`, `DENIED`, `FAILED`.

Verification: `NOT_STARTED -> QUEUED -> RUNNING -> PASSED | FAILED | NEEDS_HUMAN_REVIEW | ERROR`, and back to `QUEUED` for another attempt.

All transitions go through `transitionContract`, which locks the row, validates each domain's transition (self-transitions are rejected), updates, and writes the audit event and optional payment event in the same transaction.

## Agent execution

1. **Contract generation** (`contract-generator.ts`): one structured call producing a flat draft, mapped onto the strict `ContractContent` schema.
2. **Negotiation** (`negotiation.ts`): buyer discovery through a recorded tool call, worker selection, then alternating structured calls bounded by `maxNegotiationRounds`. Acceptance requires `decide(ACCEPT_NEGOTIATED_TERMS)` to return ALLOW.
3. **Worker execution** (`worker.ts`): bounded tool loop. Files are validated on every write and on submit; the deliverable is stored with hashes and a preview token; a verification run is created and queued.
4. **Verification** (`verifier.ts`): every criterion runs through `CHECKS`; results and evidence are persisted as they complete; the deterministic outcome drives the transition; the model writes the narrative and rubric scores; capture is attempted automatically on PASSED.

## Payment orchestration

Each PayPal write follows the same pattern: a transaction that runs the policy engine and creates or increments the `FinancialOperation` row, the PayPal call with that row's idempotency key as `PayPal-Request-Id`, and a second transaction that persists the result and transitions the state. Network failures without a response mark the operation UNCERTAIN and schedule reconciliation, which reads the order from PayPal and brings local records in line. Webhooks go through the same reconciliation.

## Security boundaries

- Browser: receives configuration booleans and sanitized records only.
- Web process: holds secrets, validates every request, runs the policy engine.
- Worker process: runs agents and browsers. Its Chromium is route-filtered to the deliverable's own origin paths.
- Deliverable preview: served with a sandboxing CSP, path-validated, under an unguessable token.
- Database: append-only triggers; unique constraints for idempotency; row locks for transitions.

## Deployment shape

One Docker image, two processes (`web` and `worker`), one PostgreSQL, one object store. `render.yaml` encodes this for Render. The worker needs more memory than the web process because of Chromium and Lighthouse.
