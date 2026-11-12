import Link from "next/link";
import Image from "next/image";
import { Bot, FileCheck2, ShieldCheck, Wallet, ArrowRight, KeyRound } from "lucide-react";
import { Section, Eyebrow, H2, Lead, CtaLink } from "@/components/marketing/sections";

/**
 * Every image on this page is a screenshot of the running application taken by
 * scripts/dev/capture-screenshots.ts against a contract seeded by
 * scripts/dev/seed-demo-run.ts. The verification runs, evidence, and policy
 * decisions shown are real records produced by the verification engine on a
 * hand-written test deliverable. No payment is shown because that run had no
 * PayPal credentials; the captions say so.
 */

const story = [
  { icon: Bot, title: "An agent hires an agent", body: "The Buyer Agent finds a worker and agrees a fixed price inside the owner's budget." },
  { icon: FileCheck2, title: "Tools verify the work", body: "The Verifier Agent runs browser, form, link, and Lighthouse checks and stores the evidence." },
  { icon: ShieldCheck, title: "Policy decides", body: "A deterministic engine allows, denies, or asks a person. No model in the loop." },
  { icon: Wallet, title: "PayPal records the settlement", body: "An authorization is held up front and captured once, only after an allow." },
];

function Screenshot({ src, alt, caption, className, priority, cropHeight }: { src: string; alt: string; caption: string; className?: string; priority?: boolean; cropHeight?: number }) {
  return (
    <figure className={className}>
      <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-card">
        <div className="flex items-center gap-1.5 border-b border-border bg-surface-2 px-3 py-2" aria-hidden>
          <span className="h-2.5 w-2.5 rounded-full bg-border-strong" />
          <span className="h-2.5 w-2.5 rounded-full bg-border-strong" />
          <span className="h-2.5 w-2.5 rounded-full bg-border-strong" />
        </div>
        <div className={cropHeight ? "overflow-hidden" : undefined} style={cropHeight ? { maxHeight: cropHeight } : undefined}>
          <Image src={src} alt={alt} width={2880} height={1800} sizes="(min-width: 1024px) 60vw, 100vw" priority={priority} className="h-auto w-full object-top" />
        </div>
      </div>
      <figcaption className="mt-2 text-xs leading-relaxed text-muted">{caption}</figcaption>
    </figure>
  );
}

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section className="mx-auto max-w-6xl px-4 pb-8 pt-10 sm:px-6 sm:pt-16">
        <div className="max-w-3xl">
          <Eyebrow>Proof-based Autonomous Commerce and Transactions</Eyebrow>
          <h1 className="text-[2.5rem] font-semibold leading-[1.04] tracking-[-0.03em] text-ink sm:text-[3.5rem]">
            AI agents hire agents. <span className="text-teal">Payment waits for proof.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted">
            PACT lets a business delegate work to AI agents with a spending limit. Independent tools verify the deliverable, a deterministic policy engine decides, and PayPal settles the authorized payment only after an allow.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <CtaLink href="/judge">Enter the judge workspace</CtaLink>
            <CtaLink href="/sign-up" variant="secondary">
              Create your own workspace
            </CtaLink>
          </div>
        </div>
        <ol className="mt-10 grid gap-4 border-y border-border py-6 sm:grid-cols-2 lg:grid-cols-4" aria-label="How PACT works in four steps">
          {story.map((s, i) => (
            <li key={s.title} className="flex gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-navy-soft text-navy">
                <s.icon className="h-4 w-4" aria-hidden />
              </span>
              <div>
                <p className="text-sm font-semibold text-ink">
                  <span className="mr-1.5 font-mono text-[11px] text-faint">0{i + 1}</span>
                  {s.title}
                </p>
                <p className="mt-0.5 text-[13px] leading-snug text-muted">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Product */}
      <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6 sm:pb-24">
        <Screenshot
          src="/screenshots/overview.png"
          alt="PACT Control overview showing budget, authorizations, captures, one active contract eligible for capture, verification outcomes of one pass and one fail, and recent verifier activity"
          caption="PACT Control overview for a workspace whose contract was verified twice: one failed attempt, one passed. Every number is computed from the workspace's own records. Captures read zero because the machine this was captured on had no PayPal credentials."
          priority
        />
      </section>

      {/* Judge entry */}
      <section className="border-y border-border bg-surface">
        <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[1fr_auto]">
          <div className="flex gap-4">
            <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-soft text-teal sm:flex">
              <KeyRound className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <p className="text-lg font-semibold tracking-tight text-ink">Judging the hackathon? Skip the sign-up.</p>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">A preconfigured, restricted workspace is ready: spending policy set, agents registered, PayPal sandbox payer provided in the testing instructions. Enter the access code and run the full flow, including a real sandbox authorization and capture.</p>
            </div>
          </div>
          <CtaLink href="/judge">Open the judge page</CtaLink>
        </div>
      </section>

      {/* Demonstration: failure blocks, correction passes */}
      <Section>
        <Eyebrow>The defining demonstration</Eyebrow>
        <H2>Defective work does not get paid</H2>
        <Lead>Both panels below are real verification runs on the same contract. The first deliverable left the contact form unwired. The verifier submitted the form from its own browser, found no submission at the capture endpoint, and failed the criterion. The corrected file passed every check on the next attempt.</Lead>
        <div className="mt-10 grid gap-8 lg:grid-cols-2">
          <Screenshot cropHeight={520} src="/screenshots/verification-failed.png" alt="Verification attempt 1 marked FAILED with the contact form submission criterion failing and the other nine criteria passing" caption="Attempt 1: FAILED. Nine criteria passed; the contact form submission check did not, because no submission reached the capture endpoint. Cropped; the full card lists all ten criteria with their evidence." />
          <Screenshot cropHeight={520} src="/screenshots/verification-passed.png" alt="Verification attempt 2 marked PASSED with all ten criteria passing, including a Lighthouse score" caption="Attempt 2: PASSED, including Lighthouse performance 100 and accessibility 95. Attempt 1 is kept as a separate record; nothing is overwritten." />
        </div>
        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_1fr]">
          <Screenshot src="/screenshots/policy-denied.png" alt="Policy engine panel reading Blocked: capture payment, listing the failing rules" caption="After attempt 1 the policy engine evaluated a capture and recorded DENY with every failing rule: the verification had not passed, and there was no PayPal authorization to capture. Agents cannot override this panel; only new facts can change it." />
          <div className="flex flex-col justify-center rounded-xl border border-border bg-surface-2 p-6">
            <p className="text-sm font-semibold text-ink">What happens with PayPal configured</p>
            <p className="mt-2 text-sm leading-relaxed text-muted">The owner authorizes a sandbox order with intent AUTHORIZE before work starts, so funds are held. After attempt 2 passes, the engine allows capture, PACT captures the authorization once under an idempotency key, PayPal confirms it, and a signed Proof of Work Receipt is issued. The judge workspace runs exactly this flow.</p>
            <Link href="/how-it-works" className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-navy hover:underline">
              All thirteen stages <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </div>
      </Section>

      {/* Evidence and passports */}
      <section className="bg-surface-2">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-2">
          <div>
            <Eyebrow>Audit history</Eyebrow>
            <H2 className="text-2xl sm:text-[1.75rem]">Every decision, with its reasons</H2>
            <p className="mt-3 text-[15px] leading-relaxed text-muted">Agent messages, tool executions, state transitions, policy decisions, and PayPal events are written to one append-only log that the owner can search. Evidence, decisions, and payment events cannot be edited after the fact, not even by the application.</p>
            <Screenshot className="mt-6" src="/screenshots/audit.png" alt="Audit history table listing policy decisions, verifier status messages, and state transitions" caption="Audit history for the demonstration contract." />
          </div>
          <div>
            <Eyebrow>Trust Passports</Eyebrow>
            <H2 className="text-2xl sm:text-[1.75rem]">Reputation from receipts only</H2>
            <p className="mt-3 text-[15px] leading-relaxed text-muted">A worker&apos;s passport is recomputed from signed receipts and recorded verification runs. New workers start at zero, as this one does, and need human approval above the workspace&apos;s cold-start limit. There is no import path and no manual score.</p>
            <Screenshot className="mt-6" src="/screenshots/passport.png" alt="Agent page for Atlas Web Worker showing tier NEW, zero verified tasks, and the contracts in this workspace" caption="Atlas Web Worker's passport before any capture: tier NEW, no verified tasks." />
          </div>
        </div>
      </section>

      {/* Closing */}
      <Section>
        <div className="grid items-center gap-8 rounded-2xl border border-border bg-surface p-8 sm:p-12 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <H2>See the rules, the API, and the code</H2>
            <Lead>The policy engine is a pure function with 23 capture rules. The API is documented with OpenAPI and a Postman collection. The source is MIT licensed.</Lead>
          </div>
          <div className="flex flex-wrap gap-3 lg:justify-end">
            <CtaLink href="/trust" variant="secondary">
              Trust and verification
            </CtaLink>
            <CtaLink href="/developers" variant="secondary">
              Developer docs
            </CtaLink>
          </div>
        </div>
      </Section>
    </>
  );
}
