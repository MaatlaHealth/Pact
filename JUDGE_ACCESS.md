# Judge access

This file explains how to evaluate PACT Protocol without creating an account. It contains no secrets. The judge login and the PayPal sandbox payer credentials are supplied privately in the Devpost testing instructions.

## What you get

- A workspace labelled **Judge demo workspace** in the top bar. Everything created inside it is marked as demonstration data. PayPal transactions made from it are real sandbox transactions.
- The three platform agents (PACT Buyer Agent, Atlas Web Worker, Ledger Data Worker, PACT Verifier) already registered.
- A spending policy with a USD 100 transaction cap, a USD 500 monthly budget, four negotiation rounds, three correction attempts, and subjective criteria routed to a human.
- Admin role: you can approve contracts, authorize payments, decide approvals, capture, and void. You cannot change member roles.

## The ten-minute walkthrough

1. **Sign in** at `<deployment URL>/sign-in` with the judge email and password from the testing instructions.
2. **Overview** shows live numbers for the workspace. If the workspace is fresh, you will see the onboarding checklist and the integration status.
3. **New contract** (`Contracts` then `New contract`). The landing page template is prefilled: hero, features, pricing, a working contact form, accessibility, Lighthouse mobile performance of at least 90, budget USD 60. Keep the **Defective first draft** scenario selected. Click **Generate contract**. Gemini drafts the structured contract in 10 to 30 seconds.
4. **Review and approve.** Read the criteria. Objective ones say which tool checks them; subjective ones carry a rubric. Edit if you like (each edit is a new version with its own hash), then **Approve contract and start negotiation**. This freezes the hash.
5. **Agents tab.** Watch the Buyer Agent discover Atlas Web Worker and negotiate a price. Each message is a real model call. The policy engine blocks any acceptance above budget.
6. **Authorize with PayPal.** When the contract reaches *Awaiting payment authorization*, click the authorize button. You are sent to PayPal sandbox. Log in with the **sandbox personal (payer) account** from the testing instructions and approve. You return to the contract; the Payment tab now shows the order ID and the authorization ID with its expiry. Funds are held, not captured.
7. **Work.** The Worker Agent writes real files and submits. Open the deliverable from the action bar to see it. In the defective-draft scenario the contact form is deliberately left unwired in this first submission.
8. **Verification fails.** The Verifier Agent runs every criterion. The contact-form check submits the form from a real browser and finds no submission at the capture endpoint. The run is marked FAILED, the policy engine records DENY for capture, and the right-hand panel explains exactly which rules failed. Screenshots and tool output are under the Verification tab.
9. **Correction.** The worker receives the correction request, revises the actual file, and resubmits. Attempt 2 runs. Earlier attempts stay visible.
10. **Capture.** When attempt 2 passes, the policy engine evaluates capture. If the contract has subjective criteria, an approval request appears for you under **Approvals** (and inline on the contract). Approve it. PACT captures the authorization through PayPal; the Payment tab shows the capture ID.
11. **Receipt and passport.** The Receipt tab links to the signed Proof of Work Receipt (JSON and PDF). Paste the JSON into `/receipts/verify` to verify the signature, hash, evidence references, and payment record. The worker's Trust Passport under **Agents** reflects the new verified task.
12. **Audit history** lists every event, including each policy decision with its rules.

## Other things to try

- Create a contract with the **Best effort** scenario to see an unconstrained run.
- Create a **JSON dataset** contract to see the second task category (schema, uniqueness, and row-count verification).
- Reject an approval to see the contract return to correction.
- Void an authorization from a contract in progress to see the hold released at PayPal.
- Call the API with a key from **Settings**: `GET /api/contracts` and `GET /api/receipts`. The developer documentation is at `/developers`.

## If something is not configured

The app never substitutes fake data. If a required integration is missing on the deployment, the page says which variable to set. `GET /api/health` reports the database, queue depth, worker status, and which integrations are configured.

## Sandbox payer notes

- Use the sandbox personal account from the testing instructions. Do not use a real PayPal account.
- Sandbox balances are not real money. If an authorization fails with insufficient funds, the sandbox account needs a balance top-up in the PayPal developer dashboard.
- Approving an order holds funds; nothing is captured until verification passes and the policy engine allows it. Authorizations can be voided from the contract page.
