import { test, expect } from "@playwright/test";
import "dotenv/config";
import { Client } from "pg";
import { createHmac } from "node:crypto";

/**
 * End-to-end account flow: register, verify email (token read from the
 * database because email delivery may not be configured), create a workspace,
 * edit the policy, inspect the empty dashboard, sign out.
 */

// The Playwright runner compiles specs as CommonJS, so the ESM Prisma client is
// not used here; a plain pg client covers the few rows the test needs.
const sql = new Client({ connectionString: process.env.DATABASE_URL });
const email = `e2e-${Date.now()}@example.test`;
const password = "CorrectHorse42Battery";

function hashToken(token: string) {
  return createHmac("sha256", process.env.APP_SECRET!).update(token).digest("hex");
}

test.beforeAll(async () => {
  await sql.connect();
});

test.afterAll(async () => {
  await sql.query("DELETE FROM organizations WHERE slug LIKE 'e2e-studio%'");
  await sql.query("DELETE FROM users WHERE email = $1", [email]);
  await sql.end();
});

test("register, verify, onboard, configure policy, sign out", async ({ page }) => {
  await page.goto("/sign-up");
  await page.getByLabel("Your name").fill("E2E Owner");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password", { exact: false }).fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/verify-email/);
  await expect(page.getByRole("heading", { name: "Verify your email" })).toBeVisible();

  // Plant a known token so the stored hash matches, then follow the link.
  const user = (await sql.query("SELECT id FROM users WHERE email = $1", [email])).rows[0] as { id: string };
  const record = (await sql.query("SELECT id FROM email_verification_tokens WHERE user_id = $1 AND used_at IS NULL ORDER BY created_at DESC LIMIT 1", [user.id])).rows[0] as { id: string };
  const token = `e2e-token-${Date.now()}`;
  await sql.query("UPDATE email_verification_tokens SET token_hash = $1 WHERE id = $2", [hashToken(token), record.id]);
  await page.goto(`/verify-email?token=${token}`);
  await expect(page.getByRole("heading", { name: "Email verified" })).toBeVisible();
  await page.getByRole("button", { name: "Continue to your workspace" }).click();

  await expect(page).toHaveURL(/\/app\/onboarding/);
  await page.getByLabel("Workspace name").fill(`E2E Studio ${Date.now()}`);
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await expect(page.getByText("Get started")).toBeVisible();

  await page.goto("/app/settings");
  await page.getByLabel("Maximum transaction amount").fill("120");
  await page.getByRole("button", { name: "Save policy" }).click();
  await expect(page.getByText("Spending policy saved")).toBeVisible();
  const policy = (await sql.query("SELECT p.max_transaction_amount_cents FROM spending_policies p JOIN memberships m ON m.organization_id = p.organization_id WHERE m.user_id = $1", [user.id])).rows[0] as { max_transaction_amount_cents: number };
  expect(policy.max_transaction_amount_cents).toBe(12000);

  await page.goto("/app/contracts/new");
  await expect(page.getByRole("heading", { name: "Define a goal" })).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in/);
  await page.goto("/app");
  await expect(page).toHaveURL(/\/sign-in/);
});

test("rejects wrong credentials and weak passwords", async ({ page, request }) => {
  const res = await request.post("/api/auth/register", { data: { email: `weak-${Date.now()}@example.test`, name: "Weak", password: "short" }, headers: { origin: "http://localhost:3000" } });
  expect(res.status()).toBe(422);
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill("nobody@example.test");
  await page.getByLabel("Password").fill("DefinitelyWrong42x");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Incorrect email or password.")).toBeVisible();
});
