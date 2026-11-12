/**
 * Single source for the developer documentation page and the OpenAPI file.
 * Keep this aligned with the route handlers under src/app/api.
 */

export interface EndpointDoc {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  summary: string;
  auth: "session" | "session_or_api_key" | "public" | "paypal";
  role?: "VIEWER" | "MEMBER" | "ADMIN" | "OWNER" | "MEMBER or ADMIN";
  request?: string;
  response?: string;
  notes?: string;
}

export interface DocGroup {
  title: string;
  description: string;
  endpoints: EndpointDoc[];
}

export const API_GROUPS: DocGroup[] = [
  {
    title: "Authentication",
    description: "Session cookies for the web app. API keys (Authorization: Bearer pact_...) for integrations. State-changing requests from browsers must be same-origin.",
    endpoints: [
      { method: "POST", path: "/api/auth/register", summary: "Create an account and optionally a workspace", auth: "public", request: '{ "email", "name", "password", "organizationName?" }', response: '{ "user", "emailDelivery": "sent" | "not_configured" }' },
      { method: "POST", path: "/api/auth/login", summary: "Sign in", auth: "public", request: '{ "email", "password" }', response: '{ "user" }', notes: "Rate limited per IP and per email." },
      { method: "POST", path: "/api/auth/logout", summary: "Revoke the current session", auth: "session" },
      { method: "POST", path: "/api/auth/verify-email", summary: "Confirm an email verification token", auth: "public", request: '{ "token" }' },
      { method: "PUT", path: "/api/auth/verify-email", summary: "Resend the verification email", auth: "session" },
      { method: "POST", path: "/api/auth/password", summary: "Request a password reset link", auth: "public", request: '{ "email" }' },
      { method: "PUT", path: "/api/auth/password", summary: "Complete a password reset", auth: "public", request: '{ "token", "password" }' },
      { method: "GET", path: "/api/auth/me", summary: "Current user, workspace, and memberships", auth: "session" },
    ],
  },
  {
    title: "Workspaces",
    description: "Organizations own contracts, policies, and receipts. Data never crosses workspace boundaries.",
    endpoints: [
      { method: "POST", path: "/api/organizations", summary: "Create a workspace (caller becomes owner)", auth: "session", request: '{ "name" }' },
      { method: "POST", path: "/api/organizations/switch", summary: "Set the active workspace for the session", auth: "session", request: '{ "organizationId" }' },
      { method: "GET", path: "/api/organizations/current/policy", summary: "Read the spending policy", auth: "session_or_api_key", role: "VIEWER" },
      { method: "PATCH", path: "/api/organizations/current/policy", summary: "Update spending policy fields", auth: "session_or_api_key", role: "ADMIN", request: '{ "maxTransactionAmountCents?", "monthlyBudgetCents?", "requireHumanApprovalForCapture?", ... }' },
      { method: "GET", path: "/api/organizations/current/members", summary: "List members and pending invitations", auth: "session_or_api_key", role: "VIEWER" },
      { method: "POST", path: "/api/organizations/current/members", summary: "Invite a member", auth: "session", role: "ADMIN", request: '{ "email", "role" }' },
      { method: "GET", path: "/api/organizations/current/api-keys", summary: "List API keys", auth: "session", role: "ADMIN" },
      { method: "POST", path: "/api/organizations/current/api-keys", summary: "Create an API key (secret returned once)", auth: "session", role: "ADMIN", request: '{ "name", "scopes": ["read" | "write"] }' },
      { method: "DELETE", path: "/api/organizations/current/api-keys", summary: "Revoke an API key", auth: "session", role: "ADMIN", request: '{ "id" }' },
    ],
  },
  {
    title: "Contracts",
    description: "A contract moves through DRAFT, AWAITING_APPROVAL, NEGOTIATING, AWAITING_PAYMENT_AUTHORIZATION, AUTHORIZED, IN_PROGRESS, UNDER_VERIFICATION, CORRECTION_REQUIRED or AWAITING_HUMAN_REVIEW, ELIGIBLE_FOR_CAPTURE, CAPTURE_PENDING, CAPTURED. Payment and verification states are tracked separately.",
    endpoints: [
      { method: "GET", path: "/api/contracts", summary: "List contracts (optional ?status=)", auth: "session_or_api_key", role: "VIEWER" },
      { method: "POST", path: "/api/contracts", summary: "Create a contract from a natural-language objective", auth: "session_or_api_key", role: "MEMBER", request: '{ "objective", "budgetCents", "currency", "category": "LANDING_PAGE" | "JSON_DATASET", "deadline?" }', response: '{ "contract": { ..., "versions": [ { "content", "contentHash", "criteria" } ] } }', notes: "Requires GEMINI_API_KEY. Returns 503 gemini_not_configured otherwise." },
      { method: "GET", path: "/api/contracts/{id}", summary: "Full contract with versions, runs, messages, verification, payments, receipt", auth: "session_or_api_key", role: "VIEWER" },
      { method: "PUT", path: "/api/contracts/{id}", summary: "Save an edited version (unapproved contracts only)", auth: "session_or_api_key", role: "MEMBER", request: "ContractContent" },
      { method: "POST", path: "/api/contracts/{id}/actions", summary: "Lifecycle action", auth: "session_or_api_key", role: "MEMBER or ADMIN", request: '{ "action": "approve" | "cancel" | "retry_negotiation" | "create_payment_order" | "capture" | "void" | "reconcile" | "rerun_verification" | "retry_work", "reason?" }', notes: "approve, create_payment_order, capture, and void need ADMIN. Every action is checked by the policy engine; a denial returns 409 with the failing rules." },
      { method: "GET", path: "/api/contracts/{id}/stream", summary: "Server-Sent Events: activity and state for one contract", auth: "session_or_api_key", role: "VIEWER", notes: "Events: ready, activity, contract. Pass ?since=<eventId> to resume." },
    ],
  },
  {
    title: "Payments",
    description: "PayPal Orders v2 with intent AUTHORIZE and Payments v2 capture and void. All financial calls carry PayPal-Request-Id and are recorded as financial operations.",
    endpoints: [
      { method: "GET", path: "/api/payments", summary: "Orders, authorizations, captures, and recent webhook events", auth: "session_or_api_key", role: "VIEWER" },
      { method: "GET", path: "/api/payments/paypal/return", summary: "PayPal return URL after payer approval (authorizes the order server-side)", auth: "session", notes: "Query: contract, token (PayPal order ID). Redirects to the contract page." },
      { method: "POST", path: "/api/webhooks/paypal", summary: "PayPal webhook receiver", auth: "paypal", notes: "Signature verified via /v1/notifications/verify-webhook-signature. Deduplicated by event id. Unverified events are stored as REJECTED and ignored." },
    ],
  },
  {
    title: "Approvals, agents, receipts, evidence",
    description: "Human decisions, the agent directory, signed receipts, and evidence retrieval.",
    endpoints: [
      { method: "GET", path: "/api/approvals", summary: "List approval requests (?status=PENDING|APPROVED|REJECTED|all)", auth: "session_or_api_key", role: "VIEWER" },
      { method: "POST", path: "/api/approvals", summary: "Decide an approval request", auth: "session_or_api_key", role: "ADMIN", request: '{ "approvalId", "decision": "APPROVED" | "REJECTED", "note?" }', notes: "Approving a capture-related request re-runs the policy engine; it does not capture by itself." },
      { method: "GET", path: "/api/agents", summary: "Agent directory with capabilities and passports", auth: "session_or_api_key", role: "VIEWER" },
      { method: "GET", path: "/api/agents/{slug}", summary: "Agent detail, Trust Passport, and this workspace's history with it", auth: "session_or_api_key", role: "VIEWER" },
      { method: "GET", path: "/api/receipts", summary: "List receipts", auth: "session_or_api_key", role: "VIEWER" },
      { method: "GET", path: "/api/receipts/{number}", summary: "Signed receipt (?format=json|download|pdf)", auth: "session_or_api_key", role: "VIEWER" },
      { method: "POST", path: "/api/receipts/verify", summary: "Verify any receipt's signature, hash, evidence, and payment record", auth: "public", request: '{ "payload", "signature", "signingKeyId" }', response: '{ "verification": { "valid", "checks": { "structure", "hash", "signature", "evidence", "paymentRecord" }, "meaning" } }' },
      { method: "GET", path: "/api/receipts/verify", summary: "Published signing keys", auth: "public" },
      { method: "GET", path: "/api/evidence/{id}", summary: "Download an evidence file after re-checking its hash", auth: "session_or_api_key", role: "VIEWER" },
      { method: "GET", path: "/api/dashboard", summary: "Workspace aggregates", auth: "session_or_api_key", role: "VIEWER" },
      { method: "GET", path: "/api/activity", summary: "Audit events (?stream=1 for SSE)", auth: "session_or_api_key", role: "VIEWER" },
      { method: "GET", path: "/api/integrations/status", summary: "Which integrations are configured (no secrets)", auth: "session" },
      { method: "GET", path: "/api/health", summary: "Liveness, database, queue depth, worker last seen", auth: "public" },
    ],
  },
];

export const ERROR_FORMAT = `{
  "error": {
    "code": "policy_denied",
    "message": "Denied: Latest verification run must have passed.",
    "details": { "outcome": "DENY", "rules": [ { "id": "verification.passed", "passed": false, "severity": "deny", "detail": "Run 1 is FAILED." } ] }
  }
}`;

export const ERROR_CODES: [string, string][] = [
  ["bad_request", "Malformed JSON or missing parameters (400)."],
  ["unauthorized", "No valid session or API key (401)."],
  ["email_unverified", "The account's email is not verified (403)."],
  ["forbidden", "Role or workspace does not permit the action (403)."],
  ["not_found", "Resource missing or outside your workspace (404)."],
  ["conflict", "The resource is not in a state that allows the action (409)."],
  ["policy_denied", "The policy engine denied the action; details list failing rules (409)."],
  ["human_approval_required", "The policy engine needs a human decision first (409)."],
  ["duplicate_capture", "A capture already exists for the contract (409)."],
  ["validation_failed", "Zod validation errors with paths (422)."],
  ["rate_limited", "Too many requests in the window (429)."],
  ["paypal_error", "PayPal rejected the request; details include debug_id and issues (502)."],
  ["paypal_uncertain", "PayPal did not respond; reconciliation is scheduled (502)."],
  ["gemini_not_configured", "GEMINI_API_KEY is missing on the server (503)."],
  ["paypal_not_configured", "PayPal credentials are missing on the server (503)."],
];

export const WEBHOOK_EVENTS = ["CHECKOUT.ORDER.APPROVED", "CHECKOUT.ORDER.COMPLETED", "PAYMENT.AUTHORIZATION.CREATED", "PAYMENT.AUTHORIZATION.VOIDED", "PAYMENT.CAPTURE.COMPLETED", "PAYMENT.CAPTURE.PENDING", "PAYMENT.CAPTURE.DENIED", "PAYMENT.CAPTURE.REFUNDED", "PAYMENT.CAPTURE.REVERSED"];
