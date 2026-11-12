# Security

## Reporting a vulnerability

Email security@maatlahealthcare.com with a description, reproduction steps, and the commit you tested. Please do not open a public issue for vulnerabilities. We acknowledge reports within three working days.

## What is implemented

**Accounts and sessions**
- scrypt password hashing (N=2^17, r=8, p=1) with a minimum policy of 12 characters, mixed case, and a digit.
- Email ownership verified through a single-use, expiring token stored as a keyed hash.
- Session tokens are random, stored as HMAC hashes, HttpOnly, SameSite=Lax, Secure in production, sliding expiry of 14 days, revoked on password reset and sign-out.
- Role-based authorization (owner, admin, member, viewer) and organization-level isolation on every query. Foreign resources return 404.
- API keys are shown once, stored hashed, scoped to read or write, revocable.

**Requests**
- Origin check on every state-changing browser request; API-key requests are exempt because they carry no cookie.
- PostgreSQL-backed rate limits on registration, sign-in (per IP and per email), reset requests, contract creation, form capture, and receipt verification.
- Zod validation on every request body; consistent error shapes without stack traces.
- Security headers: frame deny, nosniff, strict referrer, permissions policy.

**Agents and deliverables**
- Model output is treated as untrusted: structured output is schema-validated, tool loops are bounded by iterations and a token ceiling, every tool call has a timeout.
- Deliverable paths are validated, extensions allowlisted, file count and sizes capped, and files stored under an isolated prefix. Nothing is executed on the server.
- The preview route serves deliverables with a sandboxing Content Security Policy; the verifier's browser blocks every request outside the deliverable and the form-capture endpoint.
- Outbound fetches resolve DNS and reject private, loopback, link-local, and cloud metadata ranges on each redirect hop.
- The verifier never accepts worker claims; pass or fail comes from tool output. Subjective scores cannot satisfy an objective criterion.

**Financial**
- Deterministic policy engine with every rule persisted; agents cannot call PayPal.
- One financial-operation row per contract and operation (unique constraint) and PayPal-Request-Id on every call: a second capture cannot reach PayPal.
- Explicit state machines with row locks; self-transitions are rejected so concurrent callers cannot both proceed.
- Webhook signatures verified through PayPal's API, events deduplicated by ID, unverified events stored as REJECTED and ignored.
- Uncertain outcomes (no response from PayPal) are recorded as CAPTURE_UNCERTAIN and reconciled, never retried blindly.
- Append-only database triggers on evidence records, policy decisions, and payment events.

**Secrets and logs**
- PayPal and Gemini credentials are server-side only; the client receives configuration booleans.
- Logs redact keys, tokens, and secrets. One-time verification and reset links are logged unredacted only when email delivery is not configured, which is a development convenience.
- Receipts contain pseudonymous identifiers and PayPal references, never email addresses or credentials.

## What has not been done

- No third-party penetration test or formal audit.
- No compliance certification of any kind (PCI DSS, SOC 2, ISO 27001). PACT never handles card data; PayPal does.
- Dependency scanning is limited to `npm audit`; no SCA pipeline is configured.
- Content Security Policy for the application itself (not the preview route) is not yet strict.
- No automated secret scanning in CI.

## Before real-money use

Switching `PAYPAL_ENVIRONMENT` to `live` is possible but should not happen before:

1. A legal review of the business model (PACT is not an escrow service and must not be described as one), terms of service, and refund and dispute procedures.
2. PayPal merchant onboarding, including any platform or marketplace agreements needed to pay third-party workers rather than the configured merchant account.
3. A security review of the deployment: secret storage, network boundaries for the worker, backup and restore of PostgreSQL and object storage.
4. Privacy review: data retention for audit logs, evidence files, and receipts; data subject requests.
5. Operational monitoring: alerting on DEAD jobs, CAPTURE_UNCERTAIN states, and webhook rejection rates.
6. Load testing of the verification worker and Lighthouse under expected volumes.
