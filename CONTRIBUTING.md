# Contributing

Thanks for looking at PACT Protocol. This document explains how to set up a development environment and what a good change looks like.

## Setup

Follow the local installation steps in the README. In short: `npm install`, `npm run browsers:install`, copy `.env.example` to `.env`, run `npm run db:local` in one terminal, then `npm run db:migrate`, `npm run db:seed`, `npm run dev`, and `npm run worker`.

## Project layout

```
prisma/              schema, migrations, seed
src/app              Next.js routes: (marketing), (auth), app, api, preview
src/components       UI components (ui primitives, app shell, contract workspace)
src/lib              domain code
  agents/            runtime, prompts, contract generator, negotiation, worker, verifier
  auth/              sessions, guards, services
  contracts/         schema, canonical hashing, versions, transitions, loaders
  payments/          PayPal lifecycle service
  paypal/            typed PayPal REST client
  policy/            engine (pure), snapshot loader, state machines
  verification/      checks and method registry
  receipts/          signing, service, PDF
  passport/          reputation computation
  jobs/              queue and handlers
  security/          passwords, tokens, rate limit, SSRF, CSRF
src/worker           background worker entry point
tests/unit           vitest, no database
tests/integration    vitest against PostgreSQL, Playwright, Lighthouse
tests/e2e            Playwright end-to-end
docs/                architecture, API, PayPal, deployment
submission/          hackathon materials
```

## Rules that matter

- The policy engine (`src/lib/policy/engine.ts`) must stay pure. No database, network, or model access. Add a rule, add a unit test.
- Every state change goes through `transitionContract`. Do not update `status`, `paymentState`, or `verificationState` directly.
- Every PayPal write carries a request ID and a `FinancialOperation` row.
- Verification pass or fail comes from tool output. If you add a method, add it to `CHECKS`, to the contract schema's category mapping, to `METHOD_LABELS`, and to the trust page.
- No fake data anywhere. Empty states explain what will appear and how to make it happen.
- Interface text and documentation use plain English and no em dashes.

## Checks before a pull request

```bash
npm run typecheck
npm run lint
npm run test
npm run test:integration
npm run build
```

Integration tests need `TEST_DATABASE_URL`. If you change `prisma/schema.prisma`, create a migration with `npm run db:migrate:dev` and commit it.

## Commits

Small, focused commits with a message that says what changed and why. Reference the area (`policy:`, `paypal:`, `verifier:`, `ui:`) when it helps.
