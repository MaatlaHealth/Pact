# PACT Protocol

**Autonomous work. Verified outcomes. Accountable payments.**

## The problem

When software buys from software, the payment is the easy part. The hard part is knowing whether the thing that was paid for was actually delivered. An AI agent that completes a task will say it completed the task. It will produce a screenshot if asked. None of that is evidence, and none of it is tied to the money.

Businesses that want to delegate work to agents face three questions with no good answers today: what exactly was promised, who checked the result and how, and why was the payment released. Payment rails record that money moved. They do not record any of that.

## Who has this problem

Any business that wants to let an agent spend on its behalf: a founder who wants a landing page built overnight, an operations team that needs test data generated on a schedule, a marketplace that wants to route small jobs to specialised agents. On the other side, agent operators who want to be paid promptly for work that passed a fair, independent check, and who want a portable record of that history.

## The solution

PACT is a trust and payment coordination layer. A business states a goal and a budget. PACT turns the goal into a structured contract with objective acceptance criteria mapped to real verification tools and subjective criteria with a rubric. The owner approves it, which freezes its hash.

A Buyer Agent finds a Worker Agent and negotiates a fixed price within the budget. The owner authorizes a PayPal order with intent AUTHORIZE: funds are held, not charged. The Worker Agent builds the deliverable with tools and submits hashed files. An independent Verifier Agent runs every criterion against the artifact in a real browser: availability, required sections, navigation, responsive layout, a contact form that must reach a controlled capture endpoint, accessibility, Lighthouse, console errors, broken links, and HTML structure. Evidence is stored append-only.

A deterministic policy engine, with no model in the loop, decides whether capture is allowed. If verification failed, capture is denied and the worker receives an evidence-backed correction request. When the corrected deliverable passes and the policy allows it (or a human approves where the policy requires), PACT captures the PayPal authorization once, under an idempotency key, and issues an Ed25519-signed Proof of Work Receipt. The worker's Trust Passport is recomputed from receipts.

## What was actually built

A complete, deployable application:

- Next.js 16 web application with registration, email verification, password reset, sessions, workspaces with roles, invitations, API keys, and a spending policy editor.
- A contract engine with versioning, canonical hashing, and immutable approved versions.
- Three Gemini-powered agents with persisted runs, messages, tool executions, and token accounting. The worker builds real files through a bounded tool loop; corrections revise the actual previous submission.
- A verification engine using Playwright and Lighthouse against a sandboxed preview of the deliverable, plus Ajv for JSON datasets. Every result and every piece of evidence is stored with a hash.
- A pure policy engine with 23 capture rules and explicit state machines for contract, payment, and verification, all persisted and auditable.
- A PayPal integration on Orders v2 and Payments v2 with request IDs, unique financial-operation rows, webhook signature verification, deduplication, reconciliation, uncertain-outcome handling, and expiry maintenance.
- Signed receipts (JSON and PDF), a public verification endpoint and page, and computed Trust Passports with cold-start rules.
- A live contract view streamed over Server-Sent Events, an approvals inbox, payments, receipts, agent directory, audit history, and settings.
- A PostgreSQL job queue with a worker process, Docker and Render configuration, OpenAPI and Postman documentation, and unit, integration (real browser, real Lighthouse), and end-to-end tests.

## Why PayPal is central

PayPal's authorize-then-capture model is exactly the shape that agent commerce needs: commit funds when the work starts, release them only when evidence says the work is done. PACT uses that model directly rather than wrapping it. The order, authorization, and capture identifiers are first-class records, the policy engine reasons about the authorization window, webhooks and reconciliation keep local state honest, and the receipt carries the PayPal references so anyone can confirm settlement with PayPal.

## Why AI is central

Without a model, a business would have to write acceptance criteria by hand, find and brief a worker, and read verification output. Gemini turns a sentence into a contract, lets the buyer and worker negotiate, builds the deliverable, revises it from a failure report, and writes verification reports grounded in tool output. The product keeps the model where it is good (interpretation, generation, explanation) and keeps it out of where it is not (deciding whether money moves).

## What is innovative

The separation is the idea. Most "agent payments" demos let the agent call the payment API. PACT makes that impossible: agents can only propose, tools produce the evidence, a pure function decides, and a signed receipt records the whole chain. The second idea is that reputation is derived only from signed receipts and recorded verification runs, so it cannot be bought or imported.

## Technical challenges

- Making verification real and adversarially sound: the form check reads submissions back from the platform's own database rather than trusting the page; the verifier's browser is route-filtered so a deliverable cannot reach anything else; evidence is append-only at the database level.
- Keeping payment state honest under failure: uncertain captures, concurrent callers, webhook replays, and expired authorizations each have an explicit path, and the tests exercise them.
- Running Chromium and Lighthouse inside a worker that also runs model calls, with timeouts and token ceilings so a run cannot hang or overspend.
- Honest configuration: every missing integration surfaces as an instruction instead of a fake result, so the demo and the product are the same code.

## Impact

PACT gives businesses a way to delegate to agents with a spending limit and a guarantee that payment depends on evidence. It gives agent operators a fair, inspectable process and a reputation record they can carry. And it gives the ecosystem a pattern for putting PayPal at the center of agent commerce without handing agents the keys.
