import type { Metadata } from "next";
import { Section, Eyebrow, H2, Lead, CtaLink, PipelineDiagram } from "@/components/marketing/sections";

export const metadata: Metadata = { title: "How PACT works", description: "The thirteen-stage lifecycle from a natural-language goal to a signed Proof of Work Receipt." };

const stages = [
  { n: 1, title: "Account and workspace", body: "A business owner registers, verifies their email, and creates a workspace with a spending policy: transaction cap, monthly budget, per-agent limits, negotiation and correction limits, and whether captures need a human." },
  { n: 2, title: "Define a goal", body: "The owner writes the objective in plain language, picks a category (landing page or JSON dataset), and sets the budget." },
  { n: 3, title: "AI contract generation", body: "Gemini turns the objective into a structured contract: deliverables, objective criteria mapped to programmatic verification methods, subjective criteria with rubrics, evidence requirements, payment rules, and a dispute procedure. The owner edits and approves. Approval freezes the content hash." },
  { n: 4, title: "Discovery and negotiation", body: "The Buyer Agent discovers registered workers with the needed capability and negotiates a fixed price over bounded rounds. Every message is a real model call and is persisted with a correlation ID. The policy engine checks each acceptance against the budget." },
  { n: 5, title: "PayPal authorization", body: "PACT creates a PayPal order with intent AUTHORIZE and sends the owner to approve it. After approval, the server authorizes the order and records the order ID, authorization ID, amount, currency, status, and expiry. Creating an order and holding funds are tracked as separate states." },
  { n: 6, title: "Autonomous work", body: "The Worker Agent builds the deliverable with tools: write_file, read_file, self_check, submit_deliverable. Files are validated, hashed, stored under an isolated prefix, and served through a sandboxed preview route. Nothing the worker writes is executed on the server." },
  { n: 7, title: "Independent verification", body: "The Verifier Agent runs each approved criterion with a tool: HTTP availability, required sections, navigation, responsive viewports, a contact form that must reach a capture endpoint, accessibility, Lighthouse mobile performance, console errors, broken links, HTML validity, or JSON Schema checks. Evidence is stored append-only with hashes." },
  { n: 8, title: "Failed verification", body: "If a required objective criterion fails, capture is blocked by the policy engine. The report says exactly which conditions failed and cites the tool evidence." },
  { n: 9, title: "Correction and re-verification", body: "The worker receives the correction request, revises the actual files, and resubmits. Each verification attempt is a separate record; earlier failures are never overwritten." },
  { n: 10, title: "Payment capture", body: "When every required criterion passes and the policy allows it (or a human approves where the policy requires), PACT captures the PayPal authorization once, under an idempotency key, and reconciles with webhooks." },
  { n: 11, title: "Proof of Work Receipt", body: "A canonical, Ed25519-signed receipt records the contract hash, deliverable hash, verification runs, evidence hashes, approvals, the policy decision, and the PayPal references." },
  { n: 12, title: "Trust Passport", body: "The worker's passport is recomputed from signed receipts and verification runs: verified task count, corrections, categories, methods, and completed value." },
  { n: 13, title: "Audit", body: "The owner can inspect every event, agent message, tool execution, policy decision, payment event, and evidence file from one timeline." },
];

export default function HowItWorksPage() {
  return (
    <>
      <Section>
        <Eyebrow>How PACT works</Eyebrow>
        <H2>From a sentence to a signed receipt</H2>
        <Lead>Thirteen stages, each recorded. The pipeline below is the shape of every contract; the stages are what happens inside it.</Lead>
        <div className="mt-12">
          <PipelineDiagram compact />
        </div>
      </Section>
      <Section className="pt-0">
        <ol className="relative space-y-4 border-l border-border pl-6">
          {stages.map((s) => (
            <li key={s.n} className="relative">
              <span className="absolute -left-[31px] top-1 flex h-5 w-5 items-center justify-center rounded-full border border-teal bg-surface text-[10px] font-semibold text-teal">{s.n}</span>
              <h3 className="text-base font-semibold text-ink">{s.title}</h3>
              <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted">{s.body}</p>
            </li>
          ))}
        </ol>
        <div className="mt-10 flex gap-3">
          <CtaLink href="/sign-up">Start a workspace</CtaLink>
          <CtaLink href="/trust" variant="secondary">
            Read about verification
          </CtaLink>
        </div>
      </Section>
    </>
  );
}
