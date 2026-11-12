# Tools used

## AI models and providers in the product

**Google Gemini through the official `@google/genai` SDK.** Default model identifier `gemini-3.8-flash` (configurable per role with `GEMINI_MODEL_CONTRACTS`, `GEMINI_MODEL_BUYER`, `GEMINI_MODEL_WORKER`, `GEMINI_MODEL_VERIFIER`). Used for:

| Task | How |
| --- | --- |
| Contract generation | One structured-output call (`responseJsonSchema`) producing a draft that is mapped onto a strict Zod schema; one repair round if validation fails |
| Buyer Agent | Structured-output calls for worker selection and each negotiation turn; discovery through a recorded tool call |
| Worker Agent | Function calling in a bounded loop with `write_file`, `read_file`, `list_files`, `self_check`, `submit_deliverable` |
| Verifier Agent | Narrative report from tool results (structured output) and rubric scoring of subjective criteria from screenshots (multimodal input) |

Every call has a timeout, bounded retries for transient errors, schema validation, and token accounting persisted on the agent run. Each run has a token ceiling (`GEMINI_MAX_TOKENS_PER_RUN`).

## Decisions the model never makes

- Whether a criterion passed: tool output only.
- Whether a payment order is created, authorized, captured, or voided: the deterministic policy engine (`src/lib/policy/engine.ts`) and the state machines.
- Whether a contract's content changed after approval: SHA-256 over canonical JSON, recomputed on every decision.
- A worker's reputation: recomputed from signed receipts and verification runs.

## Verification tools

- Playwright 1.65 (Chromium) for section detection, navigation, responsive layout, form submission, console errors, broken links, HTML structure, screenshots.
- Lighthouse 13.6 for mobile performance and accessibility, attached to a Chromium launched through Playwright with a DevTools port.
- Ajv 8 with ajv-formats for JSON Schema validation of datasets.
- Node `crypto` for SHA-256 hashing and Ed25519 signatures.

## Payments

- PayPal REST: `/v1/oauth2/token`, Orders v2 (`create`, `get`, `authorize`), Payments v2 (`authorizations/{id}` get, capture, void; `captures/{id}` get), `/v1/notifications/verify-webhook-signature`. Sandbox by default.

## Platform

- Next.js 16 (App Router, route handlers, Server-Sent Events), React 19, TypeScript 5, Tailwind CSS 4, Lucide icons, Motion.
- PostgreSQL 17, Prisma 7 with the `pg` driver adapter, PostgreSQL-backed job queue (`SELECT ... FOR UPDATE SKIP LOCKED`) and rate limits.
- Resend for transactional email. S3-compatible object storage (AWS S3, Cloudflare R2, MinIO) with a local driver for development.
- Docker (Playwright base image), Render blueprint, Docker Compose for the local full stack.
- Vitest for unit and integration tests, Playwright Test for end-to-end tests, ESLint with the Next.js and React compiler rules.

## Sponsor tools

- PayPal: central to the product (see above).
- Postman: a collection is provided in `docs/postman/` for exploring the API. No other sponsor tools are used; we did not add dependencies for the sake of logos.

## AI development assistance

The codebase, tests, and documentation were written with Claude Code (Anthropic) under the direction of the team, and verified by running type checks, lint, unit tests, integration tests with a real browser and Lighthouse, a production build, and manual smoke tests of the running application. Where an integration could not be exercised without credentials (PayPal sandbox round trip, Gemini calls), the tests and the handover report say so rather than claiming success.
