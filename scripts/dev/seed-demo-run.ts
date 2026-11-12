import "dotenv/config";
/**
 * Seeds a demonstration workspace in the LOCAL database and runs the real
 * verification engine against a hand-written deliverable, so the product can
 * be screenshotted with genuine verification evidence on a machine that has
 * no Gemini or PayPal credentials.
 *
 * Phase 1: workspace, approved contract, defective deliverable, verification
 *          attempt 1 (fails on the form check), capture decision (DENY).
 * Phase 2: corrected deliverable, verification attempt 2 (passes).
 *
 * The web server must be running at APP_URL so the verifier can load the
 * preview. Usage: npx tsx scripts/dev/seed-demo-run.ts 1 | 2
 */
import { db } from "../../src/lib/db";
import { hashPassword } from "../../src/lib/security/password";
import { seedPlatformAgents } from "../../prisma/seed";
import { saveVersion } from "../../src/lib/contracts/service";
import { transitionContract } from "../../src/lib/contracts/transitions";
import { storeDeliverable, formCaptureUrlFor } from "../../src/lib/deliverables/service";
import { runVerifierAgent } from "../../src/lib/agents/verifier";
import { decide } from "../../src/lib/policy/snapshot";
import { generateToken } from "../../src/lib/security/tokens";
import { purgeOrganization } from "../../src/lib/orgs/service";
import { harborSite, DEMO_EMAIL, DEMO_PASSWORD, DEMO_ORG_SLUG } from "./demo-site";
import type { ContractContent } from "../../src/lib/contracts/schema";

const ORG_SLUG = DEMO_ORG_SLUG;

const content: ContractContent = {
  title: "Harbor Analytics landing page",
  category: "LANDING_PAGE",
  taskDescription: "Create a responsive landing page for Harbor Analytics with a hero section, a features section, pricing, and a working contact form. It must pass accessibility checks and reach a mobile Lighthouse performance score of at least 85.",
  deliverables: ["index.html with hero, features, pricing, and contact sections", "styles.css", "script.js"],
  budgetCents: 6000,
  currency: "USD",
  deadline: null,
  criteria: [
    { key: "available", description: "The page responds with HTTP 200 and an HTML document.", kind: "OBJECTIVE", method: "HTTP_AVAILABILITY", parameters: { expectedStatus: 200 }, required: true },
    { key: "sections", description: "Hero, features, pricing, and contact sections are present and visible.", kind: "OBJECTIVE", method: "REQUIRED_SECTIONS", parameters: { sections: ["hero", "features", "pricing", "contact"] }, required: true },
    { key: "navigation", description: "Navigation links resolve to sections on the page.", kind: "OBJECTIVE", method: "NAVIGATION_LINKS", parameters: { minLinks: 3 }, required: true },
    { key: "responsive", description: "No horizontal overflow or illegible text at 375, 768, and 1280 pixels.", kind: "OBJECTIVE", method: "RESPONSIVE_VIEWPORTS", parameters: { widths: [375, 768, 1280] }, required: true },
    { key: "contact_form", description: "The contact form submits name, email, and message to the capture endpoint.", kind: "OBJECTIVE", method: "CONTACT_FORM_SUBMISSION", parameters: { requiredFields: ["name", "email", "message"] }, required: true },
    { key: "accessibility", description: "Accessibility score of at least 85 with no structural problems.", kind: "OBJECTIVE", method: "ACCESSIBILITY_AUDIT", parameters: { minScore: 85 }, required: true },
    { key: "performance", description: "Mobile Lighthouse performance score of at least 85.", kind: "OBJECTIVE", method: "LIGHTHOUSE_MOBILE_PERFORMANCE", parameters: { minScore: 85 }, required: true },
    { key: "console_clean", description: "No console errors during load.", kind: "OBJECTIVE", method: "CONSOLE_ERRORS", parameters: { maxErrors: 0 }, required: true },
    { key: "links", description: "No broken links.", kind: "OBJECTIVE", method: "BROKEN_LINKS", parameters: { maxBroken: 0 }, required: true },
    { key: "html", description: "Valid document structure: doctype, lang, title, charset, viewport, unique ids, one h1.", kind: "OBJECTIVE", method: "HTML_VALIDITY", parameters: {}, required: true },
  ],
  evidenceRequirements: ["Screenshots at three viewports", "Lighthouse report", "Form submission record", "Console and link reports"],
  paymentRules: { authorizationIntent: "AUTHORIZE", captureCondition: "All required objective criteria pass independent verification.", requiresHumanApprovalForCapture: false },
  approvalRequirements: [],
  disputeProcedure: "The owner may dispute within seven days of capture with evidence; unresolved disputes block further captures to the worker.",
};

const SYSTEM = { type: "SYSTEM" as const, label: "Demo seed (no Gemini or PayPal on this machine)" };

async function phase1() {
  await seedPlatformAgents(db);
  const worker = await db.agent.findUniqueOrThrow({ where: { slug: "atlas-web-worker" } });
  const verifier = await db.agent.findUniqueOrThrow({ where: { slug: "pact-verifier" } });
  const buyer = await db.agent.findUniqueOrThrow({ where: { slug: "pact-buyer" } });

  const user = await db.user.upsert({
    where: { email: DEMO_EMAIL },
    create: { email: DEMO_EMAIL, name: "Harbor Owner", passwordHash: await hashPassword(DEMO_PASSWORD), emailVerifiedAt: new Date() },
    update: {},
  });
  const existingOrg = await db.organization.findUnique({ where: { slug: ORG_SLUG } });
  if (existingOrg) await purgeOrganization(existingOrg.id);
  const org = await db.organization.create({ data: { name: "Harbor Analytics", slug: ORG_SLUG, memberships: { create: { userId: user.id, role: "OWNER" } }, spendingPolicy: { create: { maxTransactionAmountCents: 10000, monthlyBudgetCents: 50000 } } } });

  const contract = await db.contract.create({ data: { organizationId: org.id, createdById: user.id, title: content.title, objective: content.taskDescription, category: "LANDING_PAGE", currency: "USD", budgetCents: 6000 } });
  const actorUser = { type: "USER" as const, id: user.id, label: user.name };
  const version = await saveVersion(contract.id, content, "USER", user.id);
  await db.$transaction(async (tx) => {
    await transitionContract(tx, contract.id, { status: "AWAITING_APPROVAL", actor: actorUser, reason: "Contract written by the owner for a verification demonstration (contract generation needs Gemini, which is not configured on this machine)." });
    await tx.contract.update({ where: { id: contract.id }, data: { approvedVersionId: version.id, approvedHash: version.contentHash, buyerAgentId: buyer.id } });
    await tx.contractVersion.update({ where: { id: version.id }, data: { approvedAt: new Date(), approvedById: user.id } });
    await transitionContract(tx, contract.id, { status: "NEGOTIATING", actor: actorUser, reason: `Owner approved contract v${version.version} (hash ${version.contentHash.slice(0, 23)}).`, severity: "NOTICE" });
    await tx.contract.update({ where: { id: contract.id }, data: { workerAgentId: worker.id, verifierAgentId: verifier.id, agreedAmountCents: 5500 } });
    await transitionContract(tx, contract.id, { status: "AWAITING_PAYMENT_AUTHORIZATION", actor: SYSTEM, reason: "Worker assigned at USD 55.00 by the demo seed. Agent negotiation needs Gemini, which is not configured on this machine." });
    await transitionContract(tx, contract.id, { status: "AUTHORIZED", actor: SYSTEM, reason: "Status advanced by the demo seed. No PayPal order exists: PayPal is not configured on this machine, so the payment state stays NONE.", severity: "WARNING" });
    await transitionContract(tx, contract.id, { status: "IN_PROGRESS", actor: SYSTEM, reason: "Deliverable authored by hand for the demonstration (worker execution needs Gemini)." });
  });

  const previewToken = generateToken(18);
  const deliverable = await storeDeliverable({ contractId: contract.id, workerAgentId: worker.id, runId: null, kind: "STATIC_SITE", files: harborSite(formCaptureUrlFor(previewToken), true), workerNotes: "Hand-written test deliverable. The contact form is left unwired (action \"#\") so the verifier's form check has a real defect to catch." });
  await db.deliverable.update({ where: { id: deliverable.id }, data: { previewToken } });
  await db.$transaction(async (tx) => {
    await transitionContract(tx, contract.id, { status: "UNDER_VERIFICATION", verificationState: "QUEUED", actor: { type: "AGENT", id: worker.id, label: worker.name }, reason: `Deliverable #1 submitted (${deliverable.rootHash}). Verification attempt 1 queued.`, severity: "NOTICE" });
  });
  const run = await db.verificationRun.create({ data: { contractId: contract.id, deliverableId: deliverable.id, verifierAgentId: verifier.id, attempt: 1 } });
  console.log("Running verification attempt 1 against", process.env.APP_URL);
  await runVerifierAgent(run.id);
  await db.job.deleteMany({ where: { contractId: contract.id } });
  const decision = await db.$transaction((tx) => decide(tx, contract.id, "CAPTURE_PAYMENT", { actorLabel: "Demo seed" }));
  const result = await db.verificationRun.findUniqueOrThrow({ where: { id: run.id }, include: { results: true } });
  console.log(JSON.stringify({ contractId: contract.id, attempt: 1, status: result.status, results: result.results.map((r) => [r.criterionKey, r.passed]), captureDecision: decision.outcome, failingRules: decision.rules.filter((r) => !r.passed).map((r) => r.id) }, null, 2));
}

async function phase2() {
  const org = await db.organization.findUniqueOrThrow({ where: { slug: ORG_SLUG } });
  const contract = await db.contract.findFirstOrThrow({ where: { organizationId: org.id }, include: { workerAgent: true, verifierAgent: true } });
  const worker = contract.workerAgent!;
  await db.$transaction(async (tx) => {
    await transitionContract(tx, contract.id, { status: "IN_PROGRESS", actor: { type: "AGENT", id: worker.id, label: worker.name }, reason: "Correction started from the verification report: wire the contact form to the capture endpoint with method post." });
  });
  const previewToken = generateToken(18);
  const deliverable = await storeDeliverable({ contractId: contract.id, workerAgentId: worker.id, runId: null, kind: "STATIC_SITE", files: harborSite(formCaptureUrlFor(previewToken), false), workerNotes: "Corrected deliverable: the form now posts to the capture endpoint. Everything else unchanged." });
  await db.deliverable.update({ where: { id: deliverable.id }, data: { previewToken } });
  await db.$transaction(async (tx) => {
    await transitionContract(tx, contract.id, { status: "UNDER_VERIFICATION", verificationState: "QUEUED", actor: { type: "AGENT", id: worker.id, label: worker.name }, reason: `Deliverable #2 submitted (${deliverable.rootHash}). Verification attempt 2 queued.`, severity: "NOTICE" });
  });
  const run = await db.verificationRun.create({ data: { contractId: contract.id, deliverableId: deliverable.id, verifierAgentId: contract.verifierAgent!.id, attempt: 2 } });
  console.log("Running verification attempt 2");
  await runVerifierAgent(run.id);
  await db.job.deleteMany({ where: { contractId: contract.id } });
  const result = await db.verificationRun.findUniqueOrThrow({ where: { id: run.id }, include: { results: true } });
  const fresh = await db.contract.findUniqueOrThrow({ where: { id: contract.id } });
  console.log(JSON.stringify({ contractId: contract.id, attempt: 2, status: result.status, contractStatus: fresh.status, results: result.results.map((r) => [r.criterionKey, r.passed, r.score]) }, null, 2));
}

// Only run when executed directly, never when imported.
const phase = process.argv[2];
const direct = (process.argv[1] ?? "").split("\\").join("/").endsWith("scripts/dev/seed-demo-run.ts");
if (!direct) throw new Error("seed-demo-run.ts is a command, not a module.");
(phase === "2" ? phase2() : phase1())
  .then(() => db.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await db.$disconnect();
    process.exit(1);
  });
