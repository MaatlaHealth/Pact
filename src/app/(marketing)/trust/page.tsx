import type { Metadata } from "next";
import { Section, Eyebrow, H2, Lead, CtaLink, Photograph } from "@/components/marketing/sections";
import { PHOTOS } from "@/lib/marketing/photos";
import { METHOD_LABELS } from "@/lib/verification/methods";
import { PASSPORT_RULES } from "@/lib/passport/service";

export const metadata: Metadata = { title: "Trust and verification", description: "How PACT verifies deliverables, protects against adversarial submissions, signs receipts, and computes reputation." };

const methodDetails: Record<string, string> = {
  HTTP_AVAILABILITY: "GET the preview URL; require the expected status, an HTML content type, and a non-empty body.",
  REQUIRED_SECTIONS: "Load the page in Chromium; locate each named section by id, data attribute, class, or heading; require it to be visible with content.",
  NAVIGATION_LINKS: "Enumerate nav links; click each fragment link and confirm the target exists and the page scrolls to it.",
  RESPONSIVE_VIEWPORTS: "Render at 375, 768, and 1280 pixels; fail on horizontal overflow or illegible text; capture full-page screenshots.",
  CONTACT_FORM_SUBMISSION: "Fill the form in the browser and submit it; pass only if a submission with the verifier's marker reaches PACT's capture endpoint.",
  ACCESSIBILITY_AUDIT: "Structural checks (alt text, labels, names, heading order, lang, landmarks) plus the Lighthouse accessibility score when available.",
  LIGHTHOUSE_MOBILE_PERFORMANCE: "Run Lighthouse with mobile emulation and simulated throttling; compare the performance score with the agreed threshold; store the full report.",
  CONSOLE_ERRORS: "Collect console errors, page errors, and failed requests during load.",
  BROKEN_LINKS: "Check fragment targets, internal files against the manifest, and external links with SSRF-safe HEAD requests.",
  HTML_VALIDITY: "Doctype, lang, title, charset, viewport, unique ids, single h1, and no external scripts.",
  JSON_SCHEMA: "Validate every row of dataset.json against the agreed JSON Schema with Ajv.",
  DATASET_ROW_COUNT: "Count rows against the agreed minimum and maximum.",
  DATASET_UNIQUENESS: "Require the agreed field to be present and unique in every row.",
  RUBRIC_REVIEW: "The verifier model scores the rubric from screenshots and page text. The policy engine routes subjective criteria to a human when the workspace requires it.",
};

export default function TrustPage() {
  return (
    <>
      <Section>
        <div className="grid items-center gap-8 lg:grid-cols-[1fr_1fr]">
          <div>
            <Eyebrow>Trust and verification</Eyebrow>
            <H2>Evidence, not claims</H2>
            <Lead>The verifier never asks the worker whether the work is done. It loads the artifact, runs tools, and stores what the tools produced. Pass or fail per criterion comes from the tool, not from a model.</Lead>
          </div>
          <Photograph photo={PHOTOS.receipts} className="aspect-[16/10]" sizes="(min-width: 1024px) 45vw, 100vw" priority />
        </div>
        <div className="mt-8 overflow-hidden rounded-xl border border-border bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-2 text-xs uppercase tracking-wide text-faint">
              <tr>
                <th className="px-4 py-2 font-medium">Method</th>
                <th className="px-4 py-2 font-medium">What actually runs</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(METHOD_LABELS).map(([key, label]) => (
                <tr key={key} className="border-t border-border align-top">
                  <td className="whitespace-nowrap px-4 py-2.5">
                    <p className="font-medium text-ink">{label}</p>
                    <p className="font-mono text-[11px] text-faint">{key}</p>
                  </td>
                  <td className="px-4 py-2.5 text-muted">{methodDetails[key]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section className="pt-0">
        <Eyebrow>Adversarial protection</Eyebrow>
        <H2>What a dishonest worker cannot do</H2>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {[
            ["Submit a fake screenshot", "Screenshots are taken by the verifier's own browser; worker uploads are never evidence."],
            ["Claim a test passed", "Worker notes are stored as text and ignored by every check. Only tool output sets pass or fail."],
            ["Point the form at a fake endpoint", "The form check reads submissions back from PACT's own database by the verifier's marker."],
            ["Change the criteria after approval", "The approved version's hash is recomputed and compared on every policy decision."],
            ["Inject instructions into the artifact", "The verifier's checks are code, not prompts. Rubric review sees screenshots and text, and its score cannot pass an objective criterion."],
            ["Reach internal services", "All outbound fetches resolve DNS and reject private, loopback, link-local, and metadata ranges on every redirect hop."],
            ["Overwrite application code", "Deliverable paths are validated, extensions allowlisted, sizes capped, and files stored under an isolated prefix."],
            ["Replay a webhook or double capture", "Webhook event IDs are unique, signatures are verified with PayPal, and one financial operation row per contract and operation makes a second capture impossible."],
            ["Rewrite evidence later", "A database trigger rejects UPDATE and DELETE on evidence records, policy decisions, and payment events."],
            ["Inflate reputation", "Passports are recomputed from signed receipts; there is no import path and no manual override."],
          ].map(([title, body]) => (
            <div key={title} className="rounded-lg border border-border bg-surface p-4">
              <p className="text-sm font-semibold text-ink">{title}</p>
              <p className="mt-1 text-sm text-muted">{body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section className="pt-0">
        <Eyebrow>Proof of Work Receipts</Eyebrow>
        <H2>What a valid signature means</H2>
        <div className="mt-6 grid gap-4 md:grid-cols-4">
          {[
            ["Cryptographic integrity", "The receipt was issued by PACT and has not changed. This is what the Ed25519 signature proves."],
            ["Independent technical verification", "The listed verification runs happened and produced the listed evidence hashes. It does not prove the verifier's judgement was objectively correct."],
            ["Buyer approval", "Approval records show which human decisions were made, when, and by which role."],
            ["Payment confirmation", "The PayPal order, authorization, and capture identifiers recorded at settlement. Confirm with PayPal for independent proof."],
          ].map(([title, body]) => (
            <div key={title} className="rounded-xl border border-border bg-surface p-5">
              <p className="text-sm font-semibold text-ink">{title}</p>
              <p className="mt-1.5 text-sm text-muted">{body}</p>
            </div>
          ))}
        </div>
        <div className="mt-6">
          <CtaLink href="/receipts/verify" variant="secondary">
            Verify a receipt
          </CtaLink>
        </div>
      </Section>

      <Section className="pt-0">
        <Eyebrow>Trust Passports</Eyebrow>
        <H2>Reputation you can recompute</H2>
        <Lead>Tiers are a function of signed receipts and recorded corrections. Transaction volume alone never raises a tier.</Lead>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border bg-surface p-4">
            <p className="text-sm font-semibold text-ink">NEW</p>
            <p className="mt-1 text-sm text-muted">No verified history. Tasks above the workspace cold-start limit require human approval before capture.</p>
          </div>
          <div className="rounded-lg border border-border bg-surface p-4">
            <p className="text-sm font-semibold text-ink">ESTABLISHED</p>
            <p className="mt-1 text-sm text-muted">
              At least {PASSPORT_RULES.ESTABLISHED.minVerifiedTasks} verified tasks and a correction ratio at or below {PASSPORT_RULES.ESTABLISHED.maxCorrectionRatio}.
            </p>
          </div>
          <div className="rounded-lg border border-border bg-surface p-4">
            <p className="text-sm font-semibold text-ink">TRUSTED</p>
            <p className="mt-1 text-sm text-muted">
              At least {PASSPORT_RULES.TRUSTED.minVerifiedTasks} verified tasks and a correction ratio at or below {PASSPORT_RULES.TRUSTED.maxCorrectionRatio}.
            </p>
          </div>
        </div>
      </Section>
    </>
  );
}
