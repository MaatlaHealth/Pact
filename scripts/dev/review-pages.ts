/** Captures review screenshots of the public site and exercises the judge access flow. */
import { chromium } from "playwright";
import fs from "node:fs/promises";
const base = process.env.APP_URL ?? "http://localhost:3000";
const out = process.argv[2] ?? ".pact-local/review";
async function main() {
  await fs.mkdir(out, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  for (const [name, viewport] of [["desktop", { width: 1440, height: 900 }], ["mobile", { width: 390, height: 844 }]] as const) {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    for (const path of ["/", "/judge", "/sign-in", "/trust"]) {
      await page.goto(`${base}${path}`, { waitUntil: "networkidle" });
      await page.screenshot({ path: `${out}/${name}${path.replace(/\//g, "_") || "_home"}.png`, fullPage: true });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
      console.log(name, path, "overflow:", overflow, "errors:", errors.length);
    }
    await ctx.close();
  }
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${base}/judge`);
  await page.getByLabel("Access code").fill("local-judge-code-2026");
  await page.getByRole("button", { name: "Open the demonstration workspace" }).click();
  await page.waitForURL(/\/app$/, { timeout: 15000 });
  const badge = await page.getByText("Judge demo workspace").count();
  const role = await page.getByText("Your role: admin").count();
  console.log("judge flow landed on /app; demo badge:", badge, "role admin:", role);
  await page.screenshot({ path: `${out}/judge-workspace.png` });
  await page.goto(`${base}/app/settings`);
  const roleSelects = await page.locator("select[aria-label^='Role for']").count();
  console.log("judge can change member roles (should be 0):", roleSelects);
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
