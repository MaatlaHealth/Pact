import "dotenv/config";
/**
 * Captures real screenshots of the running application for the public site.
 * Signs in as the demo workspace owner created by seed-demo-run.ts and saves
 * PNGs under public/screenshots. Run after phase 1 (`--phase 1`) and again
 * after phase 2 (`--phase 2`).
 */
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { db } from "../../src/lib/db";
import { DEMO_EMAIL, DEMO_PASSWORD, DEMO_ORG_SLUG } from "./demo-site";

const base = process.env.APP_URL ?? "http://localhost:3000";
const outDir = path.join(process.cwd(), "public", "screenshots");

async function main() {
  const phase = process.argv[2] ?? "1";
  await fs.mkdir(outDir, { recursive: true });
  const org = await db.organization.findUniqueOrThrow({ where: { slug: DEMO_ORG_SLUG } });
  const contract = await db.contract.findFirstOrThrow({ where: { organizationId: org.id } });
  await db.$disconnect();

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: "light" });
  const page = await context.newPage();
  await page.addInitScript(() => {
    try {
      localStorage.setItem("pact-theme", "light");
    } catch {
      // ignore
    }
  });
  await page.goto(`${base}/sign-in`);
  await page.getByLabel("Email").fill(DEMO_EMAIL);
  await page.getByLabel("Password").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/app/);

  const shot = async (name: string, fn: () => Promise<Buffer>) => {
    const buffer = await fn();
    await fs.writeFile(path.join(outDir, `${name}.png`), buffer);
    console.log("saved", name, buffer.length);
  };

  if (phase === "1") {
    await page.goto(`${base}/app/contracts/${contract.id}`);
    await page.waitForSelector("text=Live timeline");
    await page.waitForTimeout(1500);
    await shot("contract-blocked", () => page.screenshot({ type: "png", clip: { x: 0, y: 0, width: 1440, height: 900 } }));
    await shot("policy-denied", async () => {
      const panel = page.locator("text=Blocked: capture payment").locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]");
      return panel.screenshot({ type: "png" });
    });
    await page.getByRole("button", { name: /^Verification/ }).click();
    await page.waitForTimeout(800);
    await shot("verification-failed", async () => {
      const card = page.getByRole("button", { name: /Attempt 1/ }).locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]");
      return card.screenshot({ type: "png" });
    });
  } else if (phase === "3") {
    // Re-capture the failed attempt after attempt 2 exists: expand its card explicitly.
    await page.goto(`${base}/app/contracts/${contract.id}`);
    await page.waitForSelector("text=Live timeline");
    await page.getByRole("button", { name: /^Verification/ }).click();
    await page.getByRole("button", { name: /Attempt 1/ }).click();
    await page.waitForTimeout(800);
    await shot("verification-failed", async () => {
      const card = page.getByRole("button", { name: /Attempt 1/ }).locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]");
      return card.screenshot({ type: "png" });
    });
  } else {
    await page.goto(`${base}/app/contracts/${contract.id}`);
    await page.waitForSelector("text=Live timeline");
    await page.getByRole("button", { name: /^Verification/ }).click();
    await page.waitForTimeout(800);
    await shot("verification-passed", async () => {
      const card = page.getByRole("button", { name: /Attempt 2/ }).locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]");
      return card.screenshot({ type: "png" });
    });
    await page.getByRole("button", { name: /^Live timeline/ }).click();
    await page.waitForTimeout(800);
    await shot("contract-passed", () => page.screenshot({ type: "png", clip: { x: 0, y: 0, width: 1440, height: 900 } }));
    await page.goto(`${base}/app`);
    await page.waitForSelector("text=Overview");
    await page.waitForTimeout(800);
    await shot("overview", () => page.screenshot({ type: "png", clip: { x: 0, y: 0, width: 1440, height: 900 } }));
    await page.goto(`${base}/app/agents/atlas-web-worker`);
    await page.waitForSelector("text=Trust Passport");
    await shot("passport", () => page.screenshot({ type: "png", clip: { x: 0, y: 0, width: 1440, height: 900 } }));
    await page.goto(`${base}/app/audit`);
    await page.waitForSelector("text=Audit history");
    await shot("audit", () => page.screenshot({ type: "png", clip: { x: 0, y: 0, width: 1440, height: 900 } }));
  }
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
