# Voiceover script

Read this over a screen recording of the deployed application. About 390 words, which lands near 2 minutes 40 seconds at a calm pace. Pause where a line ends; let the screen carry the moment. No music needed. The bracketed lines say what should be on screen; they are not read aloud.

The recording must be the real deployment with Gemini and PayPal sandbox configured, following the judge walkthrough with the Defective first draft scenario. Record one warm-up run first, then record a fresh contract.

---

[Screen: pactprotocol.netlify.app home page, then click Enter the judge workspace]

This is PACT Protocol.

When one AI agent pays another, the payment is the easy part. The hard part is knowing whether the work was actually done.

PACT makes payment wait for proof.

[Screen: New contract page. Objective prefilled, budget 60 dollars. Click Generate contract.]

A business owner describes what they need. A landing page, with a hero, features, pricing, and a working contact form. They set a budget of sixty dollars.

Gemini turns that into a contract. Every objective criterion maps to a real check that a tool can run. The owner reads it and approves. From this point, the contract's hash is frozen.

[Screen: Agents tab. Messages between Buyer Agent and Atlas Web Worker appear.]

The Buyer Agent finds a worker and negotiates a fixed price. These are real model calls, recorded as they happen. The policy engine will not let the buyer accept anything above the budget.

[Screen: Click Authorize with PayPal. Sandbox checkout. Approve. Back on the contract, Payment tab with order and authorization IDs.]

Now the owner authorizes a PayPal sandbox order. Intent: authorize. The funds are held, not captured. PACT records the order, the payer's approval, and the authorization as three separate facts.

[Screen: Worker tool calls scrolling. Open deliverable in a new tab, scroll the page.]

The Worker Agent builds the site with tools. Write file, self check, submit. The files are hashed and served from a sandboxed preview.

In this demonstration, the first draft leaves the contact form unwired. Watch what happens.

[Screen: Verification tab. Attempt 1. Expand Contact form submission: failed. Then the policy panel: Blocked, capture payment.]

The Verifier Agent runs every criterion in its own browser. It fills in the form and submits it. Nothing arrives at the capture endpoint. The criterion fails.

The policy engine, a set of deterministic rules with no model inside it, denies the capture. The money stays held. Every rule it checked is written down.

[Screen: Agents tab, correction request. Then Verification tab, Attempt 2 passed, Lighthouse score visible.]

The worker gets an evidence-backed correction request, fixes the actual file, and resubmits. Verification runs again as a separate attempt. The first failure is never overwritten.

This time, every criterion passes. Including a real Lighthouse run.

[Screen: Policy panel: Allowed. Approve if asked. Payment tab shows the capture ID and COMPLETED.]

Now the policy engine allows capture. PACT captures the authorization once, under an idempotency key, and PayPal confirms it.

[Screen: Receipt page. Paste into Verify a receipt. All checks pass. Then the worker's Trust Passport.]

A signed Proof of Work Receipt records what was promised, what was delivered, which evidence was checked, and why the money moved. Anyone can verify it.

And the worker's Trust Passport updates, from that receipt alone.

[Screen: Home page hero.]

PACT Protocol. Autonomous work. Verified outcomes. Accountable payments.

---

## Timing guide

| Segment | Target time | Screen |
| --- | --- | --- |
| Opening | 0:00 to 0:15 | Home, judge entry |
| Contract | 0:15 to 0:40 | New contract, generated criteria, approve |
| Negotiation | 0:40 to 0:55 | Agents tab |
| Authorization | 0:55 to 1:15 | PayPal sandbox, Payment tab |
| Work | 1:15 to 1:35 | Tool calls, deliverable |
| Failure | 1:35 to 2:00 | Attempt 1, policy DENY |
| Correction | 2:00 to 2:20 | Correction request, attempt 2 |
| Settlement | 2:20 to 2:35 | Policy ALLOW, capture |
| Receipt | 2:35 to 2:50 | Receipt, verify, passport |
| Close | 2:50 to 2:55 | Home |

## Recording notes

- Speak slightly slower than feels natural; the interface has a lot of text and viewers read while you talk.
- Trim the waits: contract generation and verification take tens of seconds each. Cut to the result; do not speed up footage.
- Keep the PayPal sandbox payer email out of frame or blur it.
- If attempt 1 happens to pass in your take, you recorded a Best effort contract; create a new one with the Defective first draft scenario selected.
