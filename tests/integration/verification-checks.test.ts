import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import { chromium, type Browser } from "playwright";
import { requiredSections, htmlValidity, consoleErrors, responsiveViewports, navigationLinks, brokenLinks, httpAvailability } from "@/lib/verification/checks/site";
import { lighthouseMobilePerformance } from "@/lib/verification/checks/lighthouse";
import type { CheckContext, DeliverableFile } from "@/lib/verification/types";
import { hashBytes } from "@/lib/contracts/canonical";

/**
 * These tests run the actual verification tools (Chromium through Playwright,
 * and Lighthouse) against pages served by a local HTTP server. They prove the
 * checks measure real pages and that a real defect produces a real failure.
 */

const goodHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Harbor Analytics</title><link rel="stylesheet" href="styles.css"></head>
<body><header><nav aria-label="Primary"><a href="#hero">Home</a><a href="#features">Features</a><a href="#pricing">Pricing</a><a href="#contact">Contact</a></nav></header>
<main>
<section id="hero"><h1>Harbor Analytics</h1><p>Dashboards for small teams that need answers before lunch. Clear, fast, honest.</p></section>
<section id="features"><h2>Features</h2><p>Live dashboards, scheduled reports, and alerting that respects your attention.</p></section>
<section id="pricing"><h2>Pricing</h2><p>Starter is free for one workspace. Team is 29 per month with unlimited dashboards.</p></section>
<section id="contact"><h2>Contact</h2><form action="/api/form-capture/x" method="post"><label for="name">Name</label><input id="name" name="name"><label for="email">Email</label><input id="email" name="email" type="email"><label for="message">Message</label><textarea id="message" name="message"></textarea><button type="submit">Send</button></form></section>
</main><footer><p>Harbor Analytics</p></footer></body></html>`;

const defectiveHtml = goodHtml.replace('<section id="pricing"><h2>Pricing</h2><p>Starter is free for one workspace. Team is 29 per month with unlimited dashboards.</p></section>', "").replace('<a href="#pricing">Pricing</a>', '<a href="#">Pricing</a>');

const css = "body{font-family:system-ui;margin:0;max-width:100%}section{padding:24px}nav a{margin-right:12px}img{max-width:100%}";

let server: http.Server;
let origin: string;
let browser: Browser;

function serve(files: Record<string, string>) {
  return (req: http.IncomingMessage, res: http.ServerResponse) => {
    const path = (req.url ?? "/").split("?")[0];
    const match = Object.entries(files).find(([k]) => path.endsWith(`/${k}`));
    if (!match) {
      res.statusCode = 404;
      res.end("not found");
      return;
    }
    res.setHeader("content-type", match[0].endsWith(".css") ? "text/css" : "text/html; charset=utf-8");
    res.end(match[1]);
  };
}

const files: Record<string, string> = { "good/index.html": goodHtml, "good/styles.css": css, "bad/index.html": defectiveHtml, "bad/styles.css": css };

beforeAll(async () => {
  server = http.createServer(serve(files));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ headless: true });
});

afterAll(async () => {
  await browser?.close();
  server?.close();
});

function context(variant: "good" | "bad", method: CheckContext["method"], parameters: Record<string, unknown> = {}): CheckContext {
  const deliverableFiles: DeliverableFile[] = [
    { path: "index.html", bytes: Buffer.from(files[`${variant}/index.html`]), contentType: "text/html", hash: hashBytes(Buffer.from(files[`${variant}/index.html`])) },
    { path: "styles.css", bytes: Buffer.from(css), contentType: "text/css", hash: hashBytes(Buffer.from(css)) },
  ];
  return {
    contractId: "test",
    deliverableId: "test",
    verificationRunId: `run-${variant}`,
    method,
    criterionKey: method.toLowerCase(),
    parameters,
    previewUrl: `${origin}/preview/${variant}/index.html`,
    previewOrigin: origin,
    files: deliverableFiles,
    formCaptureToken: "x",
    browser,
    lighthouseEnabled: process.env.LIGHTHOUSE_ENABLED !== "false",
    chromiumPath: chromium.executablePath(),
    log: () => undefined,
    newContext: (options) => browser.newContext({ viewport: options?.viewport ?? { width: 1280, height: 900 }, isMobile: options?.isMobile ?? false }),
  };
}

describe("verification checks against real pages", () => {
  it("passes a well-formed page", async () => {
    const [availability, sections, validity, errors, viewports, nav, links] = await Promise.all([
      httpAvailability(context("good", "HTTP_AVAILABILITY")),
      requiredSections(context("good", "REQUIRED_SECTIONS", { sections: ["hero", "features", "pricing", "contact"] })),
      htmlValidity(context("good", "HTML_VALIDITY")),
      consoleErrors(context("good", "CONSOLE_ERRORS", { maxErrors: 0 })),
      responsiveViewports(context("good", "RESPONSIVE_VIEWPORTS", { widths: [375, 768, 1280] })),
      navigationLinks(context("good", "NAVIGATION_LINKS", { minLinks: 3 })),
      brokenLinks(context("good", "BROKEN_LINKS", { maxBroken: 0 })),
    ]);
    expect(availability.passed).toBe(true);
    expect(sections.passed).toBe(true);
    expect(sections.evidence.some((e) => e.kind === "SCREENSHOT" && e.bytes.length > 1000)).toBe(true);
    expect(validity.passed).toBe(true);
    expect(errors.passed).toBe(true);
    expect(viewports.passed).toBe(true);
    expect(viewports.evidence.filter((e) => e.kind === "SCREENSHOT")).toHaveLength(3);
    expect(nav.passed).toBe(true);
    expect(links.passed).toBe(true);
  }, 120_000);

  it("fails a page with a real defect and names the missing section", async () => {
    const sections = await requiredSections(context("bad", "REQUIRED_SECTIONS", { sections: ["hero", "features", "pricing", "contact"] }));
    expect(sections.passed).toBe(false);
    expect(sections.details.missing).toEqual(["pricing"]);
    const nav = await navigationLinks(context("bad", "NAVIGATION_LINKS", { minLinks: 3 }));
    expect(nav.passed).toBe(false);
    const links = await brokenLinks(context("bad", "BROKEN_LINKS", { maxBroken: 0 }));
    expect(links.passed).toBe(false);
  }, 120_000);

  it("runs Lighthouse for real and stores the full report", async () => {
    const result = await lighthouseMobilePerformance(context("good", "LIGHTHOUSE_MOBILE_PERFORMANCE", { minScore: 50 }));
    if (process.env.LIGHTHOUSE_ENABLED === "false") {
      expect(result.passed).toBeNull();
      expect(result.details.status).toBe("not_run");
      return;
    }
    expect(result.details.reason, String(result.details.reason)).toBeUndefined();
    expect(typeof result.score).toBe("number");
    expect(result.score).toBeGreaterThan(0);
    const report = result.evidence.find((e) => e.kind === "LIGHTHOUSE_REPORT");
    expect(report).toBeDefined();
    const parsed = JSON.parse(report!.bytes.toString("utf8"));
    expect(parsed.lighthouseVersion).toBeDefined();
    expect(parsed.categories.performance.score).toBeGreaterThan(0);
  }, 240_000);
});
