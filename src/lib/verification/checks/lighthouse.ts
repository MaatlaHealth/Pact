import type { CheckContext, CheckResult } from "@/lib/verification/types";
import { jsonEvidence } from "@/lib/verification/types";
import { accessibilityStructure } from "@/lib/verification/checks/site";

interface LighthouseSummary {
  performance: number | null;
  accessibility: number | null;
  metrics: Record<string, number | null>;
  failingAudits: { id: string; title: string; score: number | null; displayValue?: string }[];
  fetchTime?: string;
  lighthouseVersion?: string;
  runtimeError?: string;
}

const cache = new Map<string, Promise<{ summary: LighthouseSummary; report: string } | { error: string }>>();

/**
 * Runs Lighthouse once per verification run (mobile emulation, performance
 * and accessibility categories) and caches the result for both criteria.
 */
export async function runLighthouse(ctx: CheckContext): Promise<{ summary: LighthouseSummary; report: string } | { error: string }> {
  const key = `${ctx.verificationRunId}:${ctx.previewUrl}`;
  if (!cache.has(key)) {
    cache.set(key, executeLighthouse(ctx));
  }
  return cache.get(key)!;
}

/**
 * Launches a dedicated Chromium through Playwright with a DevTools port that
 * Lighthouse can attach to. Playwright's launcher is used instead of
 * chrome-launcher because the latter's detached spawn fails on some Windows
 * hosts; the browser is the same bundled Chromium either way.
 */
async function launchChromeForLighthouse(executablePathOverride: string | null): Promise<{ port: number; kill: () => Promise<void> }> {
  const net = await import("node:net");
  const { chromium } = await import("playwright");
  const port = await new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as { port: number };
      server.close(() => resolve(address.port));
    });
  });
  // Only override the executable when explicitly configured; Playwright's default headless build is used otherwise.
  const browser = await chromium.launch({ headless: true, executablePath: executablePathOverride ?? undefined, args: [`--remote-debugging-port=${port}`, "--no-sandbox", "--disable-dev-shm-usage"] });
  return { port, kill: () => browser.close() };
}

async function executeLighthouse(ctx: CheckContext): Promise<{ summary: LighthouseSummary; report: string } | { error: string }> {
  if (!ctx.lighthouseEnabled) return { error: "Lighthouse is disabled on this worker (LIGHTHOUSE_ENABLED=false)." };
  let chrome: { port: number; kill: () => Promise<void> } | undefined;
  try {
    const { default: lighthouse } = await import("lighthouse");
    chrome = await launchChromeForLighthouse(process.env.PLAYWRIGHT_CHROMIUM_PATH || null);
    const result = await lighthouse(
      ctx.previewUrl,
      { port: chrome.port, output: "json", logLevel: "error", onlyCategories: ["performance", "accessibility"], formFactor: "mobile", screenEmulation: { mobile: true, width: 412, height: 823, deviceScaleFactor: 1.75, disabled: false }, throttlingMethod: "simulate" },
      undefined,
    );
    if (!result) return { error: "Lighthouse returned no result." };
    const lhr = result.lhr;
    const report = Array.isArray(result.report) ? result.report[0] : (result.report as string);
    const score = (cat: string) => {
      const s = lhr.categories[cat]?.score;
      return typeof s === "number" ? Math.round(s * 100) : null;
    };
    const metric = (id: string) => {
      const v = lhr.audits[id]?.numericValue;
      return typeof v === "number" ? Math.round(v) : null;
    };
    const failingAudits = Object.values(lhr.audits)
      .filter((a) => typeof a.score === "number" && a.score < 0.9 && a.scoreDisplayMode !== "informative" && a.scoreDisplayMode !== "notApplicable" && a.scoreDisplayMode !== "manual")
      .slice(0, 25)
      .map((a) => ({ id: a.id, title: a.title, score: a.score, displayValue: a.displayValue }));
    if (lhr.runtimeError?.message) return { error: `Lighthouse runtime error: ${lhr.runtimeError.message}` };
    return {
      summary: {
        performance: score("performance"),
        accessibility: score("accessibility"),
        metrics: {
          firstContentfulPaintMs: metric("first-contentful-paint"),
          largestContentfulPaintMs: metric("largest-contentful-paint"),
          totalBlockingTimeMs: metric("total-blocking-time"),
          speedIndexMs: metric("speed-index"),
          cumulativeLayoutShift: lhr.audits["cumulative-layout-shift"]?.numericValue ?? null,
        },
        failingAudits,
        fetchTime: lhr.fetchTime,
        lighthouseVersion: lhr.lighthouseVersion,
        runtimeError: lhr.runtimeError?.message,
      },
      report,
    };
  } catch (error) {
    return { error: `Lighthouse failed: ${error instanceof Error ? error.message : String(error)}` };
  } finally {
    if (chrome) await chrome.kill().catch(() => undefined);
  }
}

export async function lighthouseMobilePerformance(ctx: CheckContext): Promise<CheckResult> {
  const minScore = Number(ctx.parameters.minScore ?? 90);
  const result = await runLighthouse(ctx);
  if ("error" in result) {
    return { passed: null, score: null, details: { reason: result.error, minScore, status: "not_run" }, evidence: [jsonEvidence("TEST_OUTPUT", "Lighthouse not run", { reason: result.error })] };
  }
  const score = result.summary.performance;
  return {
    passed: score !== null && score >= minScore,
    score,
    details: { score, minScore, metrics: result.summary.metrics, failingAudits: result.summary.failingAudits.filter((a) => a.id !== "color-contrast"), lighthouseVersion: result.summary.lighthouseVersion, runtimeError: result.summary.runtimeError },
    evidence: [{ kind: "LIGHTHOUSE_REPORT", label: "Lighthouse mobile report (JSON)", mimeType: "application/json", bytes: Buffer.from(result.report), metadata: { performance: score, accessibility: result.summary.accessibility } }],
  };
}

export async function accessibilityAudit(ctx: CheckContext): Promise<CheckResult> {
  const minScore = Number(ctx.parameters.minScore ?? 90);
  const structure = await accessibilityStructure(ctx);
  const lh = await runLighthouse(ctx);
  const lighthouseScore = "error" in lh ? null : lh.summary.accessibility;
  const structuralScore = Math.max(0, 100 - structure.problems.length * 15);
  const score = lighthouseScore ?? structuralScore;
  const passed = score >= minScore && structure.problems.length === 0;
  return {
    passed,
    score,
    details: { score, minScore, lighthouseAccessibility: lighthouseScore, lighthouseAvailable: !("error" in lh), structuralProblems: structure.problems, stats: structure.stats, failingAudits: "error" in lh ? [] : lh.summary.failingAudits.filter((a) => !a.id.includes("paint") && !a.id.includes("blocking")) },
    evidence: [jsonEvidence("ACCESSIBILITY_REPORT", "Accessibility audit", { lighthouseAccessibility: lighthouseScore, structure })],
  };
}
