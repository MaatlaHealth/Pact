import type { Metadata } from "next";
import Link from "next/link";
import { Section, Eyebrow, H2, Lead } from "@/components/marketing/sections";
import { API_GROUPS, ERROR_FORMAT, ERROR_CODES, WEBHOOK_EVENTS } from "@/lib/docs/api-reference";
import { Badge } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Developer documentation", description: "Authentication, endpoints, schemas, errors, webhooks, lifecycles, idempotency, and receipt verification for the PACT Protocol API." };

const methodTone: Record<string, "success" | "info" | "warning" | "danger" | "navy"> = { GET: "success", POST: "info", PUT: "warning", PATCH: "warning", DELETE: "danger" };

export default function DevelopersPage() {
  return (
    <>
      <Section>
        <Eyebrow>Developer documentation</Eyebrow>
        <H2>Integrate PACT</H2>
        <Lead>Everything the web app does goes through this API. The OpenAPI specification and a Postman collection live in the repository under docs/.</Lead>
        <div className="mt-6 flex flex-wrap gap-3 text-sm">
          <Link href="https://github.com/MaatlaHealth/Pact/blob/main/docs/openapi.yaml" className="rounded-lg border border-border bg-surface px-3 py-2 font-medium text-ink hover:border-border-strong">
            openapi.yaml
          </Link>
          <Link href="https://github.com/MaatlaHealth/Pact/blob/main/docs/postman/PACT.postman_collection.json" className="rounded-lg border border-border bg-surface px-3 py-2 font-medium text-ink hover:border-border-strong">
            Postman collection
          </Link>
          <Link href="https://github.com/MaatlaHealth/Pact/blob/main/docs/ARCHITECTURE.md" className="rounded-lg border border-border bg-surface px-3 py-2 font-medium text-ink hover:border-border-strong">
            Architecture
          </Link>
        </div>

        <div className="mt-10 grid gap-8 lg:grid-cols-[220px_1fr]">
          <nav aria-label="Documentation sections" className="hidden lg:block">
            <ul className="sticky top-24 space-y-1 text-sm">
              {["Authentication", "Idempotency", "Lifecycles", "Errors", "Webhooks", "Receipts", ...API_GROUPS.map((g) => g.title)].map((t) => (
                <li key={t}>
                  <a href={`#${t.toLowerCase().replace(/[^a-z]+/g, "-")}`} className="block rounded px-2 py-1 text-muted hover:bg-surface-2 hover:text-ink">
                    {t}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="min-w-0 space-y-12">
            <DocBlock id="authentication" title="Authentication">
              <p>Browser clients use the session cookie set by sign-in. Integrations use an API key created in Settings and sent as a bearer token. Keys with the <code>write</code> scope act as an admin of their workspace; <code>read</code> keys act as a viewer.</p>
              <Code>{`curl -H "Authorization: Bearer pact_xxxxxxxx" https://your-pact-host/api/contracts`}</Code>
              <p>Browser requests that change state are rejected unless the Origin header matches the application origin. API-key requests are exempt because they carry no cookie.</p>
            </DocBlock>

            <DocBlock id="idempotency" title="Idempotency">
              <p>Financial operations are idempotent by construction. Each contract has at most one row per operation (create order, authorize, capture, void) with a fixed idempotency key that is also sent to PayPal as <code>PayPal-Request-Id</code>. Calling <code>capture</code> twice returns the first capture or a <code>duplicate_capture</code> error; it never produces a second PayPal capture.</p>
              <p>Background jobs accept a <code>dedupeKey</code> so retried API calls do not enqueue duplicate agent runs.</p>
            </DocBlock>

            <DocBlock id="lifecycles" title="Lifecycles">
              <p><strong>Contract:</strong> create (DRAFT, then AWAITING_APPROVAL once generated), edit, approve (NEGOTIATING), agents agree (AWAITING_PAYMENT_AUTHORIZATION), create_payment_order and payer approval (AUTHORIZED), worker runs (IN_PROGRESS), submission (UNDER_VERIFICATION), outcome (CORRECTION_REQUIRED, AWAITING_HUMAN_REVIEW, or ELIGIBLE_FOR_CAPTURE), capture (CAPTURE_PENDING then CAPTURED). Terminal states: VOIDED, EXPIRED, FAILED, CANCELLED.</p>
              <p><strong>Verification:</strong> each submission creates a verification run with an attempt number. Runs are never overwritten; results and evidence are append-only.</p>
              <p><strong>Payment:</strong> NONE, ORDER_CREATED, AWAITING_PAYER_APPROVAL, PAYER_APPROVED, AUTHORIZED, CAPTURE_PENDING, CAPTURE_UNCERTAIN, CAPTURED, VOID_PENDING, VOIDED, EXPIRED, DENIED, FAILED. An order being created is never reported as funds being held.</p>
            </DocBlock>

            <DocBlock id="errors" title="Errors">
              <p>Errors are JSON with a stable <code>code</code>. Policy denials include every failing rule so a client can explain the outcome.</p>
              <Code>{ERROR_FORMAT}</Code>
              <dl className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
                {ERROR_CODES.map(([code, text]) => (
                  <div key={code} className="text-sm">
                    <dt className="font-mono text-xs text-ink">{code}</dt>
                    <dd className="text-muted">{text}</dd>
                  </div>
                ))}
              </dl>
            </DocBlock>

            <DocBlock id="webhooks" title="Webhooks">
              <p>Register <code>{"<APP_URL>"}/api/webhooks/paypal</code> in the PayPal developer dashboard for these events and set <code>PAYPAL_WEBHOOK_ID</code>:</p>
              <ul className="grid gap-1 font-mono text-xs text-ink sm:grid-cols-2">
                {WEBHOOK_EVENTS.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
              <p>Each event is stored with its verification status. Verified events are processed by reconciling the related contract against PayPal&apos;s current order state, so a lost or duplicated event cannot corrupt local state.</p>
            </DocBlock>

            <DocBlock id="receipts" title="Receipt verification">
              <p>A receipt is <code>{"{ payload, payloadHash, signature, signingKeyId, algorithm, publicKeyPem }"}</code>. The hash is SHA-256 over the canonical JSON of the payload (keys sorted, no whitespace). The signature is Ed25519 over the same bytes.</p>
              <Code>{`curl -X POST https://your-pact-host/api/receipts/verify \\
  -H "Content-Type: application/json" \\
  -d @POWR-20261112-ABCDEF1234.json`}</Code>
              <p>Offline: fetch the public key from <code>GET /api/receipts/verify</code>, canonicalize the payload, and verify with any Ed25519 implementation.</p>
            </DocBlock>

            {API_GROUPS.map((group) => (
              <DocBlock key={group.title} id={group.title.toLowerCase().replace(/[^a-z]+/g, "-")} title={group.title}>
                <p>{group.description}</p>
                <div className="divide-y divide-border rounded-xl border border-border bg-surface">
                  {group.endpoints.map((e) => (
                    <div key={`${e.method} ${e.path}`} className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={methodTone[e.method]}>{e.method}</Badge>
                        <code className="font-mono text-xs text-ink">{e.path}</code>
                        <span className="text-[11px] text-faint">{e.auth.replace(/_/g, " ")}{e.role ? `, ${e.role}` : ""}</span>
                      </div>
                      <p className="mt-1 text-sm text-ink-2">{e.summary}</p>
                      {e.request ? (
                        <p className="mt-1 font-mono text-[11px] text-muted">
                          Request: {e.request}
                        </p>
                      ) : null}
                      {e.response ? (
                        <p className="font-mono text-[11px] text-muted">
                          Response: {e.response}
                        </p>
                      ) : null}
                      {e.notes ? <p className="mt-1 text-xs text-faint">{e.notes}</p> : null}
                    </div>
                  ))}
                </div>
              </DocBlock>
            ))}
          </div>
        </div>
      </Section>
    </>
  );
}

function DocBlock({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <h3 className="text-lg font-semibold text-ink">{title}</h3>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted [&_code]:rounded [&_code]:bg-surface-2 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[12px] [&_code]:text-ink">{children}</div>
    </section>
  );
}

function Code({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg border border-border bg-surface-2 p-3 font-mono text-[12px] leading-relaxed text-ink">
      <code className="!bg-transparent !p-0">{children}</code>
    </pre>
  );
}
