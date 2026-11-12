import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

/**
 * Seeds the three platform agents. These are the only records the platform
 * needs to operate. No users, contracts, or payments are created here.
 */

const PROMPT_VERSION = "2026-11-12.1";
const MODEL = process.env.GEMINI_MODEL_WORKER ?? "gemini-3.8-flash";

interface SeedCapability {
  category: "LANDING_PAGE" | "JSON_DATASET";
  description: string;
  maxBudgetCents?: number;
}

interface SeedAgent {
  slug: string;
  name: string;
  role: "BUYER" | "WORKER" | "VERIFIER";
  description: string;
  capabilities: SeedCapability[];
}

export async function seedPlatformAgents(prisma: PrismaClient) {
  const agents: SeedAgent[] = [
    {
      slug: "pact-buyer",
      name: "PACT Buyer Agent",
      role: "BUYER",
      description: "Interprets approved contracts, discovers workers, negotiates fixed prices within the spending policy, and requests verification. Cannot authorize or capture payments.",
      capabilities: [],
    },
    {
      slug: "atlas-web-worker",
      name: "Atlas Web Worker",
      role: "WORKER",
      description: "Builds self-contained static landing pages: semantic HTML, responsive CSS, accessible forms, no external dependencies. Revises work in response to verification reports.",
      capabilities: [{ category: "LANDING_PAGE", description: "Responsive single-page marketing sites with contact forms", maxBudgetCents: 15000 }],
    },
    {
      slug: "ledger-data-worker",
      name: "Ledger Data Worker",
      role: "WORKER",
      description: "Generates schema-valid JSON datasets with unique keys and realistic values for seeding, testing, and demos.",
      capabilities: [{ category: "JSON_DATASET", description: "Schema-constrained JSON datasets up to 500 rows", maxBudgetCents: 8000 }],
    },
    {
      slug: "pact-verifier",
      name: "PACT Verifier",
      role: "VERIFIER",
      description: "Runs independent tool-based checks (HTTP, Playwright, Lighthouse, JSON Schema) against submitted deliverables and reports evidence-backed outcomes. Never trusts worker claims.",
      capabilities: [
        { category: "LANDING_PAGE", description: "Browser and Lighthouse verification of static sites" },
        { category: "JSON_DATASET", description: "Schema, uniqueness, and row-count verification" },
      ],
    },
  ];

  for (const a of agents) {
    const agent = await prisma.agent.upsert({
      where: { slug: a.slug },
      create: { slug: a.slug, name: a.name, role: a.role, description: a.description, model: MODEL, promptVersion: PROMPT_VERSION, isPlatformAgent: true },
      update: { name: a.name, description: a.description, model: MODEL, promptVersion: PROMPT_VERSION, isPlatformAgent: true },
    });
    for (const c of a.capabilities) {
      await prisma.agentCapability.upsert({
        where: { agentId_category: { agentId: agent.id, category: c.category } },
        create: { agentId: agent.id, category: c.category, description: c.description, maxBudgetCents: c.maxBudgetCents ?? null },
        update: { description: c.description, maxBudgetCents: c.maxBudgetCents ?? null },
      });
    }
    if (a.role === "WORKER") {
      await prisma.trustPassport.upsert({ where: { agentId: agent.id }, create: { agentId: agent.id }, update: {} });
    }
  }
  return agents.map((a) => a.slug);
}

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });
  const slugs = await seedPlatformAgents(prisma);
  console.log(`Seeded platform agents: ${slugs.join(", ")}`);
  await prisma.$disconnect();
}

const isDirect = process.argv[1]?.replace(/\\/g, "/").endsWith("prisma/seed.ts");
if (isDirect) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
