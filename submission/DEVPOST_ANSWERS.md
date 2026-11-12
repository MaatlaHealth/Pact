# Devpost answers

Copy these into the submission form. Replace the placeholders in angle brackets.

## Project name

PACT Protocol

## Tagline

Autonomous work. Verified outcomes. Accountable payments.

## Elevator pitch (short)

PACT lets AI agents hire other AI agents and get paid through PayPal only after an independent verifier proves the work was done and a deterministic policy engine allows the capture. Every contract, deliverable, check, decision, and payment is recorded in a signed receipt.

## Inspiration

Agents are starting to buy from agents, and the payment is the only part that works. We wanted the rest of the chain: what was promised, what was delivered, which evidence was checked, and why the money moved. PayPal's authorize-then-capture flow already has the right shape; we built the layer that decides when capture is allowed.

## What it does

A business describes a task and a budget. Gemini drafts a contract with objective criteria mapped to real verification tools. The owner approves it. A Buyer Agent negotiates a fixed price with a Worker Agent. The owner authorizes a PayPal sandbox order (funds held). The Worker Agent builds the deliverable with tools. A Verifier Agent runs browser checks, a form-submission check, Lighthouse, and structural checks, storing evidence. The policy engine blocks capture on failure and sends a correction request. After the corrected work passes, PayPal captures the authorization once and PACT issues an Ed25519-signed Proof of Work Receipt. The worker's Trust Passport updates from receipts only.

## How we built it

Next.js 16, TypeScript, Tailwind, PostgreSQL with Prisma 7, a PostgreSQL job queue with a dedicated worker, Playwright and Lighthouse for verification, Ajv for JSON datasets, PayPal REST (Orders v2, Payments v2, webhook verification), Gemini through `@google/genai` with structured output and function calling, Resend for email, S3-compatible storage, Ed25519 receipts, Docker and Render for deployment. Unit, integration (real browser, real Lighthouse, PostgreSQL), and end-to-end tests. See the README for the full architecture.

## Challenges we ran into

Keeping verification adversarially sound (the form check reads from our own database, the verifier's browser is route-filtered, evidence is append-only via database triggers); making payment state honest under failure (uncertain captures, concurrent callers, webhook replays, expiry); and running Chromium, Lighthouse, and model calls in one worker with hard timeouts and token ceilings. Also: refusing to fake anything, which meant building real configuration states for every integration.

## Accomplishments that we're proud of

A capture path that a model cannot talk its way through. A verification failure caused by a real defect in a real file, caught by a real browser, that blocks a real sandbox payment, followed by a real correction and a real capture. Receipts anyone can verify without an account.

## What we learned

Authorize-then-capture is the right primitive for agent work. Evidence has to be produced by the platform's tools, never accepted from the worker. Reputation is only meaningful if it is derived from signed settlement records.

## What's next for PACT Protocol

More task categories (API endpoints verified by contract tests, documents, data pipelines), third-party worker registration with PayPal platform payouts, dispute resolution, and a richer policy language.

## Built with

typescript, next.js, react, tailwindcss, postgresql, prisma, playwright, lighthouse, paypal-rest-api, google-gemini, resend, docker, render

## Try it out links

- Live application: <deployment URL>
- Source: https://github.com/MaatlaHealth/Pact
- Developer docs: <deployment URL>/developers

## Testing instructions for judges (private field)

See JUDGE_ACCESS.md in the repository for the walkthrough. Credentials:

- Judge entry: <deployment URL>/judge with access code <JUDGE_ACCESS_CODE>
- Judge login (alternative): <JUDGE_EMAIL> / <JUDGE_PASSWORD>
- PayPal sandbox payer: <sandbox personal account email> / <password>

Use the "Defective first draft" scenario on the New contract page to watch verification block the payment before the worker corrects the real file.

## Video

<YouTube URL once uploaded>
