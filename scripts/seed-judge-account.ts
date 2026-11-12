import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { hashPassword } from "../src/lib/security/password";
import { seedPlatformAgents } from "../prisma/seed";

/**
 * Creates or updates the judge demonstration account and workspace.
 * Credentials come from JUDGE_EMAIL and JUDGE_PASSWORD in the environment and
 * are never written to the repository. The workspace is marked JUDGE_DEMO so
 * the UI labels everything inside it.
 *
 * Usage: JUDGE_EMAIL=... JUDGE_PASSWORD=... npm run judge:seed
 */
async function main() {
  const email = process.env.JUDGE_EMAIL?.trim().toLowerCase();
  const password = process.env.JUDGE_PASSWORD;
  const orgName = process.env.JUDGE_ORG_NAME ?? "PACT Judge Demo";
  if (!email || !password) {
    console.error("Set JUDGE_EMAIL and JUDGE_PASSWORD in the environment before running this script.");
    process.exit(1);
  }
  if (password.length < 12) {
    console.error("JUDGE_PASSWORD must be at least 12 characters.");
    process.exit(1);
  }
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });
  await seedPlatformAgents(prisma);

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.upsert({
    where: { email },
    create: { email, name: "Hackathon Judge", passwordHash, emailVerifiedAt: new Date() },
    update: { passwordHash, emailVerifiedAt: new Date() },
  });

  const slug = "judge-demo";
  const organization = await prisma.organization.upsert({
    where: { slug },
    create: {
      name: orgName,
      slug,
      kind: "JUDGE_DEMO",
      memberships: { create: { userId: user.id, role: "ADMIN" } },
      spendingPolicy: {
        create: {
          currency: "USD",
          maxTransactionAmountCents: 10000,
          monthlyBudgetCents: 50000,
          perAgentLimitCents: 25000,
          coldStartAgentLimitCents: 7500,
          requireHumanApprovalForCapture: false,
          subjectiveCriteriaRequireHuman: true,
          maxNegotiationRounds: 4,
          maxCorrectionAttempts: 3,
        },
      },
    },
    update: { name: orgName, kind: "JUDGE_DEMO" },
  });
  await prisma.membership.upsert({
    where: { userId_organizationId: { userId: user.id, organizationId: organization.id } },
    create: { userId: user.id, organizationId: organization.id, role: "ADMIN" },
    update: { role: "ADMIN" },
  });
  await prisma.auditEvent.create({
    data: { organizationId: organization.id, actorType: "SYSTEM", actorLabel: "Judge seed", action: "judge.workspace_prepared", title: "Judge demonstration workspace prepared", description: "This workspace is labelled as a demonstration. PayPal transactions made here are real sandbox transactions.", severity: "NOTICE" },
  });
  console.log(`Judge account ready: ${email} (workspace ${organization.slug}, role ADMIN)`);
  if (!process.env.JUDGE_ACCESS_CODE) console.log("Set JUDGE_ACCESS_CODE on the deployment so judges can enter at /judge without a password.");
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
