# Video script (2:45)

Record the real running application at a desktop resolution with the browser at 100 percent zoom. Narration is spoken over screen capture; no music unless it is licensed. Each segment lists the on-screen action and the narration. Keep the cursor calm; let the interface do the explaining.

## 0:00 to 0:20. The owner delegates a task

**Screen:** Signed in as the judge account. Overview page, then Contracts, then New contract. The landing page objective is prefilled; budget USD 60; the "Defective first draft" scenario is selected. Click Generate contract.

**Narration:** "This is PACT Protocol. A business owner describes what they need, a landing page with a hero, features, pricing, and a working contact form, and sets a budget of sixty dollars. From here, AI agents do the work. But in PACT, agents never control the money."

## 0:20 to 0:40. Contract and negotiation

**Screen:** The generated contract: criteria list with objective and subjective badges, methods, parameters. Click Approve. Switch to the Agents tab as the Buyer Agent discovers Atlas Web Worker and messages appear in real time.

**Narration:** "Gemini turns the objective into a contract. Every objective criterion maps to a real verification tool. Approval freezes the contract's hash. Now the Buyer Agent finds a worker and negotiates a fixed price. Each message is a real model call, recorded with a correlation ID, and the policy engine refuses any acceptance above budget."

## 0:40 to 1:00. PayPal authorization

**Screen:** Contract reaches Awaiting payment authorization. Click Authorize with PayPal. PayPal sandbox checkout; log in as the sandbox payer; approve. Return to the contract; Payment tab shows order ID, authorization ID, held amount, expiry.

**Narration:** "The owner authorizes a PayPal order with intent authorize. Funds are held, not captured. PACT records the order, the payer's approval, and the authorization as three separate states, because creating an order is not the same as holding money."

## 1:00 to 1:25. The worker builds

**Screen:** Agents tab: the worker's tool calls scroll by (write_file, self_check, submit_deliverable). Click Open deliverable; the generated landing page renders in a new tab. Back to the contract: Under verification.

**Narration:** "The Worker Agent writes real files through tools, runs a self-check, and submits. The deliverable is hashed and served from a sandboxed preview. In this demonstration scenario the first draft leaves the contact form unwired, so we can watch what happens next."

## 1:25 to 1:50. Verification catches it

**Screen:** Verification tab: attempt 1 with per-criterion results. Expand Contact form submission: FAILED, "No submission reached the capture endpoint". Screenshot gallery. The policy panel on the right: "Blocked: capture payment" with the failing rules listed.

**Narration:** "The Verifier Agent runs every criterion with real tools. It fills the form in a browser and checks whether a submission reached PACT's capture endpoint. None did. The run fails, and the policy engine, a set of deterministic rules with no model in the loop, denies capture. The money stays held."

## 1:50 to 2:15. Correction and re-verification

**Screen:** Agents tab: correction request message; the worker's second run revises index.html. Verification tab: attempt 2 appears alongside attempt 1; all criteria pass; Lighthouse score shown.

**Narration:** "The worker receives the evidence-backed correction request, fixes the actual file, and resubmits. Verification runs again as a separate attempt. Earlier failures are never overwritten. This time every required criterion passes, including a real Lighthouse run."

## 2:15 to 2:35. Settlement

**Screen:** Policy panel: "Allowed: capture payment, 23 rules evaluated". If an approval is pending, click Approve. Payment tab: capture ID, status COMPLETED. Timeline shows the PayPal capture event.

**Narration:** "Now the policy engine allows capture. PACT captures the authorization once, under an idempotency key, and PayPal confirms it. Every rule the engine evaluated is stored with the decision."

## 2:35 to 2:45. Receipt and passport

**Screen:** Receipt page with signature and PayPal references; paste into Verify a receipt: all checks green. Agent page: Atlas Web Worker's Trust Passport with the new verified task.

**Narration:** "A signed Proof of Work Receipt records why the money moved, and the worker's Trust Passport updates from that receipt alone. PACT Protocol. Autonomous work. Verified outcomes. Accountable payments."

## Notes

- Total runtime target: 2 minutes 45 seconds. The narration above is about 400 words at a natural pace.
- Pre-run the flow once so the sandbox payer login is cached and the worker is warm; record a fresh contract for the video.
- If the first attempt happens to pass in Best effort mode, the Defective first draft scenario guarantees the failure path shown in the script, and the interface labels the scenario.
- Do not add fabricated terminal output or screenshots. Everything shown must be the running application.
