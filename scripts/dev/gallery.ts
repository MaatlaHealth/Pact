import "dotenv/config";
/**
 * Captures the Devpost image gallery: real screenshots of the running
 * application at a 3:2 viewport (1500x1000, rendered at 1.2x for 1800x1200).
 * Signs in as the local demo owner created by seed-demo-run.ts for the
 * application pages. Output: submission/gallery/raw/*.png, captioned by
 * scripts/dev/gallery-captions.py.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { chromium, type Page } from "playwright";
import { db } from "../../src/lib/db";
import { DEMO_EMAIL, DEMO_PASSWORD, DEMO_ORG_SLUG } from "./demo-site";

const base = process.env.APP_URL ?? "http://localhost:3000";
const out = path.join(process.cwd(), "submission", "gallery", "raw");

async function settle(page: Page) {
  // Live views keep a stream open, so "networkidle" never fires; wait for paint instead.
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(1500);
}

async function main() {
  await fs.mkdir(out, { recursive: true });
  const org = await db.organization.findUniqueOrThrow({ where: { slug: DEMO_ORG_SLUG } });
  const contract = await db.contract.findFirstOrThrow({ where: { organizationId: org.id } });
  await db.$disconnect();

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 1.2, colorScheme: "light" });
  const page = await context.newPage();
  const only = process.env.ONLY ? process.env.ONLY.split(",") : null;
  const shot = async (name: string, options: { fullPage?: boolean } = {}) => {
    if (only && !only.includes(name)) return;
    await page.screenshot({ path: path.join(out, `${name}.png`), type: "png", fullPage: options.fullPage ?? false });
    console.log("saved", name);
  };

  // Public pages
  await page.goto(`${base}/`);
  await settle(page);
  await shot("01-home");
  await page.goto(`${base}/judge`);
  await settle(page);
  await shot("02-judge");
  await page.goto(`${base}/developers`);
  await settle(page);
  await shot("13-developers");
  await page.goto(`${base}/trust`);
  await settle(page);
  await page.evaluate(() => window.scrollTo(0, 560));
  await page.waitForTimeout(300);
  await shot("12-verification-methods");

  // Application pages
  await page.goto(`${base}/sign-in`);
  await page.getByLabel("Email").fill(DEMO_EMAIL);
  await page.getByLabel("Password").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/app/);
  await settle(page);
  await shot("03-overview");

  await page.goto(`${base}/app/contracts/${contract.id}`);
  await page.waitForSelector("text=Live timeline");
  await settle(page);
  await shot("04-contract");

  await page.getByRole("button", { name: /^Verification/ }).click();
  await page.getByRole("button", { name: /Attempt 1/ }).click();
  await page.waitForTimeout(500);
  await page.getByText("Contact form submission").first().scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -260));
  await page.waitForTimeout(300);
  await shot("05-verification-failed");

  await page.getByRole("button", { name: /Attempt 2/ }).click();
  await page.waitForTimeout(500);
  await page.getByText("Lighthouse mobile performance").first().scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -420));
  await page.waitForTimeout(300);
  await shot("06-verification-passed");

  await page.getByText("Screenshots taken by the verifier").first().scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -80));
  await page.waitForTimeout(300);
  await shot("07-evidence");

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole("button", { name: /^Agents/ }).click();
  await page.waitForTimeout(500);
  const runButton = page.getByRole("button", { name: /PACT Verifier.*Verification/ }).first();
  await runButton.click();
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const heading = Array.from(document.querySelectorAll("h2")).find((h) => h.textContent?.includes("Agent runs and tool executions"));
    heading?.closest("div.rounded-xl")?.scrollIntoView({ block: "start" });
    window.scrollBy(0, -24);
  });
  await page.waitForTimeout(400);
  await shot("08-agent-runs");

  await page.goto(`${base}/app/agents`);
  await settle(page);
  await shot("09-agents");
  await page.goto(`${base}/app/agents/atlas-web-worker`);
  await settle(page);
  await shot("10-passport");
  await page.goto(`${base}/app/audit`);
  await settle(page);
  await shot("11-audit");
  await page.goto(`${base}/app/settings`);
  await settle(page);
  await shot("14-policy");

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
