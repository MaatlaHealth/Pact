# Final checklist

Status as of the handover. "Done" means verified by running it. "Blocked" means it needs a credential or access the build did not have.

## Build and tests

- [x] `npm run typecheck` passes
- [x] `npm run lint` passes
- [x] `npm run test` (unit) passes: policy engine, state machines, contracts, PayPal client, security, receipts, Gemini parsing
- [x] `npm run test:integration` passes against PostgreSQL with real Playwright checks and a real Lighthouse run; live PayPal and Gemini tests skip without credentials
- [x] `npm run build` succeeds
- [ ] `npm run test:e2e` run against the built app (run after the final build)
- [ ] `npm audit` reviewed

## Application

- [x] Registration, email verification, sign-in, password reset, sessions, sign-out
- [x] Workspaces, roles, invitations, API keys, spending policy
- [x] Contract generation (needs GEMINI_API_KEY), editing, approval, hashing
- [x] Negotiation, worker execution, verification, correction (need GEMINI_API_KEY and the worker process)
- [x] PayPal order, authorization, capture, void, webhooks, reconciliation (need PayPal sandbox credentials)
- [x] Receipts (need RECEIPT_SIGNING_* variables), Trust Passports
- [x] Live timeline, approvals, payments, receipts, agents, audit, settings
- [x] Honest configuration states for every integration
- [x] Light and dark mode; responsive layouts

## Repository

- [x] README with reproducible instructions
- [x] LICENSE (MIT), CONTRIBUTING.md, SECURITY.md, JUDGE_ACCESS.md
- [x] .env.example; no secrets committed
- [x] Dockerfile, docker-compose.yml, render.yaml
- [x] docs: ARCHITECTURE.md, API.md, openapi.yaml, PAYPAL.md, DEPLOYMENT.md, Postman collection
- [x] submission: PROJECT_DESCRIPTION.md, DEVPOST_ANSWERS.md, TOOLS_USED.md, VIDEO_SCRIPT.md, VIDEO_SHOT_LIST.md, JUDGE_TESTING.md, this file

## Blocked until credentials are provided

- [ ] Gemini: set GEMINI_API_KEY and run one contract end to end
- [ ] PayPal sandbox: set PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET; complete one authorization and capture; record order, authorization, capture IDs
- [ ] PayPal webhook: register the endpoint on the public URL and set PAYPAL_WEBHOOK_ID
- [ ] Email: set RESEND_API_KEY and a verified sender
- [ ] Storage: S3-compatible bucket for production
- [ ] Signing key: run `npm run keys:generate` and set the variables on the deployment
- [ ] Deployment: create the Render blueprint, set variables, deploy, smoke test
- [ ] Judge account: `npm run judge:seed` on the deployment; provide credentials privately
- [ ] Video: record per VIDEO_SCRIPT.md and VIDEO_SHOT_LIST.md; upload to YouTube; add the link to DEVPOST_ANSWERS.md

## Devpost form

- [ ] Project name, tagline, description from DEVPOST_ANSWERS.md
- [ ] Repository link and live URL
- [ ] Video link
- [ ] Testing instructions with private credentials
- [ ] Built-with tags
