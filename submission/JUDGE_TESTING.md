# Judge testing

This is the content for the Devpost "testing instructions" field. The repository's JUDGE_ACCESS.md has the full walkthrough; this is the short version with placeholders for the private credentials.

## Access

- Application: <deployment URL>
- Judge login: <JUDGE_EMAIL> / <JUDGE_PASSWORD> (admin of the "PACT Judge Demo" workspace; labelled as a demo in the interface)
- PayPal sandbox payer: <sandbox personal account email> / <password>
- Source code: https://github.com/MaatlaHealth/Pact
- API docs: <deployment URL>/developers; health: <deployment URL>/api/health

## Scenario A: defective draft, blocked payment, correction, capture (10 minutes)

1. Sign in. Go to Contracts, then New contract.
2. Keep the prefilled landing page objective, budget USD 60, and the "Defective first draft" scenario. Click Generate contract.
3. Review the criteria and click Approve contract and start negotiation.
4. Watch the Agents tab until the status becomes Awaiting payment authorization.
5. Click Authorize with PayPal. Approve as the sandbox payer. You return to the contract with an authorization recorded.
6. Wait for the worker to submit and the verifier to run (two to four minutes with Lighthouse). Attempt 1 fails on the contact form check; the policy panel shows the denied capture.
7. The worker corrects and resubmits automatically. Attempt 2 passes.
8. If an approval appears (subjective criteria), approve it. The capture completes and the Receipt tab links to the signed receipt.
9. Open the receipt, download the JSON, and verify it at /receipts/verify.

## Scenario B: best effort

Same as A with the "Best effort" scenario. The first attempt passes or fails on the worker's own merits.

## Scenario C: JSON dataset

Choose the JSON dataset category. The Ledger Data Worker produces dataset.json; verification runs schema, uniqueness, and row-count checks.

## Things to inspect

- Audit history: every event, including policy decisions with all rules.
- Payments: order, authorization, capture identifiers and webhook events.
- Settings: spending policy, members, API keys, integration status.
- Reject an approval or void an authorization to see the alternative paths.

## What to expect if something is missing

The application never shows fake data. If an integration is not configured on the deployment, the page says so and names the variable.
