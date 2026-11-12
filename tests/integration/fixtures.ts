import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/security/password";
import { generateToken, hashToken } from "@/lib/security/tokens";
import { seedPlatformAgents } from "../../prisma/seed";
import type { Principal } from "@/lib/auth/guards";
import { saveVersion } from "@/lib/contracts/service";
import type { ContractContent } from "@/lib/contracts/schema";
import { purgeOrganization } from "@/lib/orgs/service";

export async function ensureAgents() {
  await seedPlatformAgents(db);
  const [buyer, worker, verifier] = await Promise.all([
    db.agent.findUniqueOrThrow({ where: { slug: "pact-buyer" } }),
    db.agent.findUniqueOrThrow({ where: { slug: "atlas-web-worker" } }),
    db.agent.findUniqueOrThrow({ where: { slug: "pact-verifier" } }),
  ]);
  return { buyer, worker, verifier };
}

export async function createOrgWithOwner(label = "test") {
  const suffix = randomUUID().slice(0, 8);
  const user = await db.user.create({ data: { email: `${label}-${suffix}@example.test`, name: `${label} owner`, passwordHash: await hashPassword("CorrectHorse42Battery"), emailVerifiedAt: new Date() } });
  const organization = await db.organization.create({ data: { name: `${label} ${suffix}`, slug: `${label}-${suffix}`, memberships: { create: { userId: user.id, role: "OWNER" } }, spendingPolicy: { create: {} } } });
  const raw = `pact_${generateToken(24)}`;
  await db.apiKey.create({ data: { organizationId: organization.id, name: "test", prefix: raw.slice(0, 12), keyHash: hashToken(raw), scopes: ["read", "write"], createdById: user.id } });
  const principal: Principal = { kind: "user", userId: user.id, userName: user.name, organization: { id: organization.id, name: organization.name, slug: organization.slug, kind: "STANDARD", role: "OWNER" }, scopes: ["read", "write"] };
  return { user, organization, apiKey: raw, principal };
}

export async function cleanupOrg(organizationId: string) {
  const members = await db.membership.findMany({ where: { organizationId } });
  await purgeOrganization(organizationId);
  for (const m of members) await db.user.delete({ where: { id: m.userId } }).catch(() => undefined);
}

export const sampleContent: ContractContent = {
  title: "Harbor Analytics landing page",
  category: "LANDING_PAGE",
  taskDescription: "Build a responsive landing page with hero, features, pricing, and a working contact form.",
  deliverables: ["index.html", "styles.css"],
  budgetCents: 6000,
  currency: "USD",
  deadline: null,
  criteria: [
    { key: "available", description: "The page responds with HTTP 200 and HTML.", kind: "OBJECTIVE", method: "HTTP_AVAILABILITY", parameters: { expectedStatus: 200 }, required: true },
    { key: "sections", description: "Hero, features, pricing, and contact sections exist.", kind: "OBJECTIVE", method: "REQUIRED_SECTIONS", parameters: { sections: ["hero", "features", "pricing", "contact"] }, required: true },
    { key: "form", description: "The contact form posts to the capture endpoint.", kind: "OBJECTIVE", method: "CONTACT_FORM_SUBMISSION", parameters: { requiredFields: ["name", "email", "message"] }, required: true },
  ],
  evidenceRequirements: ["Screenshots", "HTTP trace"],
  paymentRules: { authorizationIntent: "AUTHORIZE", captureCondition: "All required objective criteria pass verification.", requiresHumanApprovalForCapture: false },
  approvalRequirements: [],
  disputeProcedure: "The owner may dispute within seven days with evidence.",
};

export async function createContractWithVersion(principal: Principal, overrides: Partial<ContractContent> = {}) {
  const content = { ...sampleContent, ...overrides };
  const contract = await db.contract.create({ data: { organizationId: principal.organization.id, createdById: principal.userId!, title: content.title, objective: content.taskDescription, category: content.category, currency: content.currency, budgetCents: content.budgetCents, status: "AWAITING_APPROVAL" } });
  const version = await saveVersion(contract.id, content, "AI", null);
  return { contract, version, content };
}
