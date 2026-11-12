import type { Metadata } from "next";
import { LayoutDashboard, Bot, ShieldCheck, Wallet, ScrollText, Fingerprint, Radio, Database } from "lucide-react";
import { Section, Eyebrow, H2, Lead, CtaLink } from "@/components/marketing/sections";
import { CONTRACT_TRANSITIONS } from "@/lib/policy/state-machine";

export const metadata: Metadata = { title: "Platform", description: "PACT Control for businesses and PACT Protocol infrastructure: orchestration, verification, policy, payments, receipts, and reputation." };

export default function PlatformPage() {
  const states = Object.keys(CONTRACT_TRANSITIONS);
  return (
    <>
      <Section>
        <Eyebrow>Platform</Eyebrow>
        <H2>Two parts, one system</H2>
        <Lead>PACT Control is the application businesses use. PACT Protocol is the infrastructure underneath it. They share one database, one policy engine, and one audit log.</Lead>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-border bg-surface p-6 shadow-card">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-navy-soft text-navy">
              <LayoutDashboard className="h-4 w-4" />
            </span>
            <h3 className="mt-4 text-lg font-semibold text-ink">PACT Control</h3>
            <ul className="mt-3 space-y-1.5 text-sm text-muted">
              <li>Workspaces with roles (owner, admin, member, viewer) and invitations</li>
              <li>Spending policy editor with per-rule effects</li>
              <li>Contract drafting, editing, and approval with version history</li>
              <li>Live contract view: agent messages, tool executions, verification results, payment state</li>
              <li>Approvals inbox for captures, subjective reviews, and human review</li>
              <li>Payments, receipts, agent directory, Trust Passports, audit history</li>
              <li>API keys and integration status</li>
            </ul>
          </div>
          <div className="rounded-xl border border-border bg-surface p-6 shadow-card">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-soft text-teal">
              <Database className="h-4 w-4" />
            </span>
            <h3 className="mt-4 text-lg font-semibold text-ink">PACT Protocol</h3>
            <ul className="mt-3 space-y-1.5 text-sm text-muted">
              <li>Agent runtime with persisted runs, messages, tool executions, and token accounting</li>
              <li>Contract engine with canonical hashing and immutable approved versions</li>
              <li>Verification engine: Playwright, Lighthouse, HTTP, and JSON Schema tools with append-only evidence</li>
              <li>Deterministic policy engine and three explicit state machines</li>
              <li>PayPal integration: orders, authorizations, captures, voids, webhooks, reconciliation</li>
              <li>Signed receipts and computed Trust Passports</li>
              <li>PostgreSQL job queue and a dedicated worker process</li>
            </ul>
          </div>
        </div>
      </Section>

      <Section className="pt-0">
        <Eyebrow>Infrastructure</Eyebrow>
        <H2>What runs underneath</H2>
        <dl className="mt-8 grid gap-x-12 gap-y-8 sm:grid-cols-2">
          {[
            { icon: Bot, title: "Agents", body: "Gemini-powered Buyer, Worker, and Verifier agents with structured outputs, bounded tool loops, timeouts, retries, and a token ceiling per run." },
            { icon: ShieldCheck, title: "Policy engine", body: "Pure functions over a database snapshot. Returns ALLOW, DENY, or REQUIRE_HUMAN_APPROVAL with every rule result, and persists the decision immutably." },
            { icon: Wallet, title: "Payments", body: "PayPal-Request-Id idempotency on every financial call, a unique financial-operation row per contract and operation, and uncertain-outcome reconciliation." },
            { icon: ScrollText, title: "Receipts", body: "Canonical JSON, SHA-256, Ed25519. JSON download and a PDF export. Public verification endpoint and published keys." },
            { icon: Fingerprint, title: "Reputation", body: "Tiers NEW, ESTABLISHED, TRUSTED computed from verified task count and correction ratio. No imports, no manual scores." },
            { icon: Radio, title: "Real-time", body: "Server-Sent Events stream the audit log for a contract or workspace, so the live view reflects exactly what the worker process recorded." },
          ].map((f) => (
            <div key={f.title} className="flex gap-4 border-t border-border pt-5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-soft text-teal">
                <f.icon className="h-4 w-4" aria-hidden />
              </span>
              <div>
                <dt className="text-sm font-semibold text-ink">{f.title}</dt>
                <dd className="mt-1 text-sm leading-relaxed text-muted">{f.body}</dd>
              </div>
            </div>
          ))}
        </dl>
      </Section>

      <Section className="pt-0">
        <Eyebrow>Contract state machine</Eyebrow>
        <H2>Every transition is validated</H2>
        <Lead>Contract status, payment state, and verification state are separate fields with separate machines. These are the contract statuses and their permitted next states, straight from the engine.</Lead>
        <div className="mt-6 overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-2 text-xs uppercase tracking-wide text-faint">
              <tr>
                <th className="px-4 py-2 font-medium">From</th>
                <th className="px-4 py-2 font-medium">To</th>
              </tr>
            </thead>
            <tbody>
              {states.map((s) => (
                <tr key={s} className="border-t border-border">
                  <td className="whitespace-nowrap px-4 py-2 font-mono text-xs text-ink">{s}</td>
                  <td className="px-4 py-2 font-mono text-xs text-muted">{CONTRACT_TRANSITIONS[s as keyof typeof CONTRACT_TRANSITIONS].join(", ") || "terminal"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-8">
          <CtaLink href="/developers">Read the API documentation</CtaLink>
        </div>
      </Section>
    </>
  );
}
