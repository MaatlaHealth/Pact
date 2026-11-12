import "dotenv/config";
import { chromium } from "playwright";
import { lighthouseMobilePerformance } from "../../src/lib/verification/checks/lighthouse";

/** Runs the Lighthouse check against a URL. Usage: npx tsx scripts/dev/lighthouse-probe.ts http://localhost:3000/ */
async function main() {
  const url = process.argv[2] ?? "http://localhost:3000/";
  const browser = await chromium.launch({ headless: true });
  const started = Date.now();
  const result = await lighthouseMobilePerformance({
    contractId: "probe", deliverableId: "probe", verificationRunId: `probe-${Date.now()}`, method: "LIGHTHOUSE_MOBILE_PERFORMANCE", criterionKey: "probe", parameters: { minScore: 90 },
    previewUrl: url, previewOrigin: new URL(url).origin, files: [], formCaptureToken: "x", browser, lighthouseEnabled: true, chromiumPath: chromium.executablePath(),
    log: () => undefined, newContext: (o) => browser.newContext({ viewport: o?.viewport ?? { width: 1280, height: 900 } }),
  });
  console.log(JSON.stringify({ ms: Date.now() - started, passed: result.passed, score: result.score, details: { ...result.details, failingAudits: undefined } }, null, 2));
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
