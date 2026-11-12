import { db } from "@/lib/db";
import { safeFetch, UnsafeUrlError } from "@/lib/security/url-safety";
import type { CheckContext, CheckResult, EvidenceDraft } from "@/lib/verification/types";
import { jsonEvidence, fileByPath } from "@/lib/verification/types";

/**
 * Site checks executed against the deliverable as served by the preview
 * route. Every check records evidence produced by the tool itself; nothing
 * is taken from worker claims.
 */

/** Browser-side section detector, kept as plain source text (see requiredSections). */
const SECTION_DETECTOR = `function (names) {
  var norm = function (s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); };
  return names.map(function (name) {
    var n = norm(name);
    var candidates = Array.prototype.slice.call(document.querySelectorAll("section, header, footer, main, div, article, form, nav"));
    var match = candidates.find(function (el) {
      var id = norm(el.id);
      var cls = norm(typeof el.className === "string" ? el.className : "");
      var data = norm(el.getAttribute("data-section"));
      var aria = norm(el.getAttribute("aria-label"));
      var heading = el.querySelector("h1, h2, h3");
      var headingText = norm(heading ? heading.textContent : "");
      var tag = el.tagName.toLowerCase();
      return id.indexOf(n) !== -1 || data === n || aria.indexOf(n) !== -1 || cls.split(" ").indexOf(n) !== -1 || headingText.indexOf(n) !== -1 || (n === "hero" && tag === "header" && el.querySelector("h1") !== null) || (n === "contact" && tag === "form");
    });
    var rect = match ? match.getBoundingClientRect() : null;
    return { name: name, found: Boolean(match), tag: match ? match.tagName.toLowerCase() : null, id: match ? match.id : null, visible: Boolean(rect && rect.width > 0 && rect.height > 0), textLength: match && match.textContent ? match.textContent.trim().length : 0 };
  });
}`;

const previewPolicy = (ctx: CheckContext) => ({ allowHosts: [new URL(ctx.previewOrigin).hostname], allowHttp: true });

export async function httpAvailability(ctx: CheckContext): Promise<CheckResult> {
  const expected = Number(ctx.parameters.expectedStatus ?? 200);
  const started = Date.now();
  const response = await safeFetch(ctx.previewUrl, { method: "GET", timeoutMs: 15000, policy: previewPolicy(ctx) });
  const body = await response.text();
  const durationMs = Date.now() - started;
  const contentType = response.headers.get("content-type") ?? "";
  const passed = response.status === expected && contentType.includes("text/html") && body.length > 0;
  return {
    passed,
    details: { status: response.status, expected, contentType, bytes: body.length, durationMs },
    evidence: [jsonEvidence("HTTP_TRACE", `GET ${ctx.previewUrl}`, { url: ctx.previewUrl, status: response.status, headers: Object.fromEntries(response.headers.entries()), bytes: body.length, durationMs, bodyPreview: body.slice(0, 2000) })],
  };
}

export async function requiredSections(ctx: CheckContext): Promise<CheckResult> {
  const sections = (ctx.parameters.sections as string[] | undefined) ?? [];
  const context = await ctx.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    const page = await context.newPage();
    await page.goto(ctx.previewUrl, { waitUntil: "load", timeout: 30000 });
    // Serialized as source text on purpose: code nested inside page.evaluate must
    // not be transformed by esbuild helpers (tsx injects __name for named inner
    // functions, which do not exist in the browser).
    const found = (await page.evaluate(`(${SECTION_DETECTOR})(${JSON.stringify(sections)})`)) as { name: string; found: boolean; tag: string | null; id: string | null; visible: boolean; textLength: number }[];
    const screenshot = await page.screenshot({ fullPage: true, type: "png" });
    const missing = found.filter((f) => !f.found || !f.visible || f.textLength < 10);
    return {
      passed: missing.length === 0,
      details: { sections: found, missing: missing.map((m) => m.name) },
      evidence: [
        { kind: "SCREENSHOT", label: "Full page at 1280px", mimeType: "image/png", bytes: screenshot, metadata: { viewport: "1280x900" } },
        jsonEvidence("TEST_OUTPUT", "Section detection", found),
      ],
    };
  } finally {
    await context.close();
  }
}

export async function navigationLinks(ctx: CheckContext): Promise<CheckResult> {
  const minLinks = Number(ctx.parameters.minLinks ?? 3);
  const context = await ctx.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    const page = await context.newPage();
    await page.goto(ctx.previewUrl, { waitUntil: "load", timeout: 30000 });
    const links = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll("nav a[href], header a[href]"));
      return anchors.map((a) => {
        const href = a.getAttribute("href") ?? "";
        const target = href.startsWith("#") && href.length > 1 ? document.getElementById(href.slice(1)) ?? document.querySelector(`[name="${href.slice(1)}"]`) : null;
        return { text: (a.textContent ?? "").trim().slice(0, 60), href, isAnchor: href.startsWith("#"), targetExists: href.startsWith("#") ? Boolean(target) : null };
      });
    });
    const working: { href: string; ok: boolean; reason?: string }[] = [];
    for (const link of links.slice(0, 25)) {
      if (link.isAnchor) {
        if (link.href === "#" || link.href === "") {
          working.push({ href: link.href, ok: false, reason: "empty anchor" });
          continue;
        }
        if (!link.targetExists) {
          working.push({ href: link.href, ok: false, reason: "target id missing" });
          continue;
        }
        const before = await page.evaluate(() => window.scrollY);
        await page.click(`nav a[href="${link.href}"], header a[href="${link.href}"]`, { timeout: 5000 }).catch(() => undefined);
        await page.waitForTimeout(400);
        const after = await page.evaluate(() => ({ scrollY: window.scrollY, hash: location.hash, viewport: window.innerHeight }));
        const targetTop = await page.evaluate((id: string) => document.getElementById(id)?.getBoundingClientRect().top ?? null, link.href.slice(1));
        const inView = targetTop !== null && targetTop >= -10 && targetTop < after.viewport;
        const ok = after.hash === link.href && (after.scrollY !== before || inView);
        working.push({ href: link.href, ok, reason: ok ? undefined : after.hash !== link.href ? "click did not update the URL fragment" : "target not brought into view" });
      } else {
        const resolved = new URL(link.href, ctx.previewUrl).toString();
        const internal = resolved.startsWith(ctx.previewOrigin);
        if (!internal) {
          working.push({ href: link.href, ok: true, reason: "external, checked by broken-link test" });
          continue;
        }
        const response = await safeFetch(resolved, { method: "GET", timeoutMs: 10000, policy: previewPolicy(ctx) }).catch(() => null);
        working.push({ href: link.href, ok: Boolean(response && response.status < 400), reason: response ? `status ${response.status}` : "fetch failed" });
      }
    }
    const okCount = working.filter((w) => w.ok).length;
    return {
      passed: links.length >= minLinks && working.every((w) => w.ok),
      details: { navLinks: links.length, minLinks, working: okCount, failures: working.filter((w) => !w.ok) },
      evidence: [jsonEvidence("TEST_OUTPUT", "Navigation link checks", { links, working })],
    };
  } finally {
    await context.close();
  }
}

export async function responsiveViewports(ctx: CheckContext): Promise<CheckResult> {
  const widths = (ctx.parameters.widths as number[] | undefined) ?? [375, 768, 1280];
  const results: { width: number; scrollWidth: number; clientWidth: number; overflow: boolean; fontTooSmall: number }[] = [];
  const evidence: EvidenceDraft[] = [];
  for (const width of widths) {
    const context = await ctx.newContext({ viewport: { width, height: 900 }, isMobile: width < 768 });
    try {
      const page = await context.newPage();
      await page.goto(ctx.previewUrl, { waitUntil: "load", timeout: 30000 });
      await page.waitForTimeout(300);
      const metrics = await page.evaluate(() => {
        const scrollWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
        const clientWidth = document.documentElement.clientWidth;
        const small = Array.from(document.querySelectorAll("p, a, li, span, label, button")).filter((el) => {
          const size = parseFloat(getComputedStyle(el).fontSize);
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && size < 11;
        }).length;
        return { scrollWidth, clientWidth, fontTooSmall: small };
      });
      const overflow = metrics.scrollWidth > metrics.clientWidth + 2;
      results.push({ width, ...metrics, overflow });
      const shot = await page.screenshot({ fullPage: true, type: "png" });
      evidence.push({ kind: "SCREENSHOT", label: `Full page at ${width}px`, mimeType: "image/png", bytes: shot, metadata: { viewport: `${width}x900`, overflow } });
    } finally {
      await context.close();
    }
  }
  const failing = results.filter((r) => r.overflow || r.fontTooSmall > 0);
  return {
    passed: failing.length === 0,
    details: { viewports: results, failing: failing.map((f) => f.width) },
    evidence: [...evidence, jsonEvidence("TEST_OUTPUT", "Viewport measurements", results)],
  };
}

export async function contactFormSubmission(ctx: CheckContext): Promise<CheckResult> {
  const requiredFields = (ctx.parameters.requiredFields as string[] | undefined) ?? ["name", "email", "message"];
  const marker = `pact-verify-${ctx.verificationRunId.slice(0, 8)}-${Date.now()}`;
  const values: Record<string, string> = {
    name: `PACT Verifier ${marker}`,
    email: `verifier+${marker.replace(/[^a-z0-9]/gi, "")}@pact.invalid`,
    message: `Automated verification submission ${marker}. This message confirms the form posts to the capture endpoint.`,
  };
  const context = await ctx.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    const page = await context.newPage();
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    await page.goto(ctx.previewUrl, { waitUntil: "load", timeout: 30000 });
    const form = page.locator("form").first();
    const formCount = await page.locator("form").count();
    if (formCount === 0) {
      return { passed: false, details: { reason: "No form element found." }, evidence: [jsonEvidence("TEST_OUTPUT", "Contact form", { formCount: 0 })] };
    }
    const action = await form.getAttribute("action");
    const method = ((await form.getAttribute("method")) ?? "get").toLowerCase();
    const expectedAction = `/api/form-capture/${ctx.formCaptureToken}`;
    const filled: Record<string, boolean> = {};
    for (const field of requiredFields) {
      const locator = form.locator(`[name="${field}"], #${field}, [name="${field}s"]`).first();
      const exists = (await locator.count()) > 0;
      filled[field] = exists;
      if (exists) await locator.fill(values[field] ?? marker, { timeout: 5000 }).catch(() => undefined);
    }
    const missing = requiredFields.filter((f) => !filled[f]);
    if (missing.length) {
      return { passed: false, details: { reason: `Missing form fields: ${missing.join(", ")}`, action, method, filled }, evidence: [jsonEvidence("TEST_OUTPUT", "Contact form", { action, method, filled, missing })] };
    }
    const before = await db.formCapture.count({ where: { token: ctx.formCaptureToken } });
    const submit = form.locator('button[type="submit"], input[type="submit"], button:not([type])').first();
    const responsePromise = page.waitForResponse((r) => r.url().includes("/api/form-capture/"), { timeout: 15000 }).catch(() => null);
    if ((await submit.count()) > 0) await submit.click({ timeout: 5000 });
    else await form.evaluate((f: HTMLFormElement) => f.requestSubmit());
    const response = await responsePromise;
    await page.waitForTimeout(800);
    const captures = await db.formCapture.findMany({ where: { token: ctx.formCaptureToken, receivedAt: { gte: new Date(Date.now() - 60_000) } }, orderBy: { receivedAt: "desc" }, take: 3 });
    const matching = captures.find((c) => JSON.stringify(c.payload).includes(marker));
    const confirmationVisible = await page.evaluate(() => /thank|received|sent|success/i.test(document.body.innerText));
    const screenshot = await page.screenshot({ fullPage: false, type: "png" });
    const passed = Boolean(matching) && (method === "post" || Boolean(response));
    return {
      passed,
      details: {
        action,
        expectedAction,
        method,
        responseStatus: response?.status() ?? null,
        capturedBefore: before,
        capturedSubmissionId: matching?.id ?? null,
        confirmationVisible,
        consoleErrors: consoleErrors.slice(0, 5),
        reason: passed ? undefined : matching ? "Submission captured but form method or response was unexpected." : "No submission reached the capture endpoint.",
      },
      evidence: [
        jsonEvidence("FORM_SUBMISSION", "Captured form submission", { submitted: values, captured: matching ? { id: matching.id, payload: matching.payload, receivedAt: matching.receivedAt } : null, action, method, responseStatus: response?.status() ?? null }),
        { kind: "SCREENSHOT", label: "After form submission", mimeType: "image/png", bytes: screenshot },
      ],
    };
  } finally {
    await context.close();
  }
}

export async function consoleErrors(ctx: CheckContext): Promise<CheckResult> {
  const maxErrors = Number(ctx.parameters.maxErrors ?? 0);
  const context = await ctx.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    const page = await context.newPage();
    const entries: { type: string; text: string }[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error" || msg.type() === "warning") entries.push({ type: msg.type(), text: msg.text().slice(0, 500) });
    });
    page.on("pageerror", (error) => entries.push({ type: "pageerror", text: String(error).slice(0, 500) }));
    page.on("requestfailed", (request) => entries.push({ type: "requestfailed", text: `${request.url()} ${request.failure()?.errorText ?? ""}`.slice(0, 500) }));
    await page.goto(ctx.previewUrl, { waitUntil: "networkidle", timeout: 30000 }).catch(() => undefined);
    await page.waitForTimeout(500);
    const errors = entries.filter((e) => e.type !== "warning");
    return { passed: errors.length <= maxErrors, details: { errors: errors.length, maxErrors, entries: entries.slice(0, 50) }, evidence: [jsonEvidence("CONSOLE_LOG", "Browser console", entries)] };
  } finally {
    await context.close();
  }
}

export async function brokenLinks(ctx: CheckContext): Promise<CheckResult> {
  const maxBroken = Number(ctx.parameters.maxBroken ?? 0);
  const context = await ctx.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    const page = await context.newPage();
    await page.goto(ctx.previewUrl, { waitUntil: "load", timeout: 30000 });
    const hrefs = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll("a[href]")).map((a) => a.getAttribute("href") ?? "");
      const assets = Array.from(document.querySelectorAll("img[src], link[href][rel=stylesheet], script[src]")).map((el) => el.getAttribute("src") ?? el.getAttribute("href") ?? "");
      const ids = Array.from(document.querySelectorAll("[id]")).map((el) => el.id);
      return { anchors, assets, ids };
    });
    const results: { href: string; kind: string; ok: boolean; status?: number; reason?: string }[] = [];
    const seen = new Set<string>();
    for (const href of [...hrefs.anchors, ...hrefs.assets]) {
      if (!href || seen.has(href)) continue;
      seen.add(href);
      if (href.startsWith("#")) {
        results.push({ href, kind: "anchor", ok: href === "#" ? false : hrefs.ids.includes(href.slice(1)), reason: href === "#" ? "empty fragment" : undefined });
        continue;
      }
      if (/^(mailto|tel|javascript|data):/.test(href)) {
        results.push({ href, kind: "scheme", ok: !href.startsWith("javascript:") });
        continue;
      }
      let resolved: string;
      try {
        resolved = new URL(href, ctx.previewUrl).toString();
      } catch {
        results.push({ href, kind: "malformed", ok: false });
        continue;
      }
      if (resolved.startsWith(ctx.previewOrigin)) {
        const relative = resolved.slice(ctx.previewUrl.lastIndexOf("/") + 1).split(/[?#]/)[0];
        const exists = Boolean(fileByPath(ctx.files, decodeURIComponent(relative)));
        results.push({ href, kind: "internal", ok: exists, reason: exists ? undefined : "file not in deliverable" });
        continue;
      }
      if (results.filter((r) => r.kind === "external").length >= 20) {
        results.push({ href, kind: "external", ok: true, reason: "not checked (limit reached)" });
        continue;
      }
      try {
        const response = await safeFetch(resolved, { method: "HEAD", timeoutMs: 8000 });
        const ok = response.status < 400 || response.status === 405;
        results.push({ href, kind: "external", ok, status: response.status });
      } catch (error) {
        results.push({ href, kind: "external", ok: false, reason: error instanceof UnsafeUrlError ? `blocked: ${error.message}` : "unreachable" });
      }
    }
    const broken = results.filter((r) => !r.ok);
    return { passed: broken.length <= maxBroken, details: { checked: results.length, broken: broken.length, maxBroken, brokenLinks: broken }, evidence: [jsonEvidence("LINK_REPORT", "Link check", results)] };
  } finally {
    await context.close();
  }
}

export async function htmlValidity(ctx: CheckContext): Promise<CheckResult> {
  const index = fileByPath(ctx.files, "index.html");
  const html = index?.bytes.toString("utf8") ?? "";
  const context = await ctx.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    const page = await context.newPage();
    await page.goto(ctx.previewUrl, { waitUntil: "load", timeout: 30000 });
    const dom = await page.evaluate(() => {
      const ids = Array.from(document.querySelectorAll("[id]")).map((el) => el.id);
      const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
      const h1s = document.querySelectorAll("h1").length;
      return {
        hasDoctype: Boolean(document.doctype),
        lang: document.documentElement.getAttribute("lang"),
        title: document.title,
        viewport: document.querySelector('meta[name="viewport"]')?.getAttribute("content") ?? null,
        charset: Boolean(document.querySelector("meta[charset]")),
        duplicateIds: Array.from(new Set(duplicates)),
        h1Count: h1s,
      };
    });
    const problems: string[] = [];
    if (!dom.hasDoctype) problems.push("Missing <!doctype html>.");
    if (!dom.lang) problems.push("Missing lang attribute on <html>.");
    if (!dom.title) problems.push("Missing <title>.");
    if (!dom.viewport) problems.push("Missing viewport meta tag.");
    if (!dom.charset) problems.push("Missing charset meta tag.");
    if (dom.duplicateIds.length) problems.push(`Duplicate ids: ${dom.duplicateIds.join(", ")}.`);
    if (dom.h1Count !== 1) problems.push(`Expected exactly one <h1>, found ${dom.h1Count}.`);
    if (/<script[^>]+src=["']https?:\/\//i.test(html)) problems.push("External scripts are not allowed in the deliverable.");
    return { passed: problems.length === 0, details: { ...dom, problems }, evidence: [jsonEvidence("TEST_OUTPUT", "HTML structure", { ...dom, problems })] };
  } finally {
    await context.close();
  }
}

/** Structural accessibility checks that do not need Lighthouse. */
export async function accessibilityStructure(ctx: CheckContext): Promise<{ problems: string[]; stats: Record<string, number> }> {
  const context = await ctx.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    const page = await context.newPage();
    await page.goto(ctx.previewUrl, { waitUntil: "load", timeout: 30000 });
    return await page.evaluate(() => {
      const problems: string[] = [];
      const imgs = Array.from(document.querySelectorAll("img"));
      const missingAlt = imgs.filter((i) => !i.hasAttribute("alt")).length;
      if (missingAlt) problems.push(`${missingAlt} images lack alt attributes.`);
      const inputs = Array.from(document.querySelectorAll("input:not([type=hidden]):not([type=submit]), textarea, select"));
      const unlabeled = inputs.filter((el) => {
        const id = el.getAttribute("id");
        const hasLabel = id ? Boolean(document.querySelector(`label[for="${id}"]`)) : false;
        return !hasLabel && !el.getAttribute("aria-label") && !el.getAttribute("aria-labelledby") && !el.closest("label");
      }).length;
      if (unlabeled) problems.push(`${unlabeled} form controls lack labels.`);
      const buttons = Array.from(document.querySelectorAll("button, a[href]")).filter((el) => !(el.textContent ?? "").trim() && !el.getAttribute("aria-label") && !el.querySelector("img[alt]")).length;
      if (buttons) problems.push(`${buttons} buttons or links have no accessible name.`);
      const headings = Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6")).map((h) => Number(h.tagName[1]));
      let skips = 0;
      for (let i = 1; i < headings.length; i += 1) if (headings[i] - headings[i - 1] > 1) skips += 1;
      if (skips) problems.push(`${skips} heading level skips.`);
      if (!document.documentElement.getAttribute("lang")) problems.push("Missing lang attribute.");
      const landmarks = document.querySelectorAll("main, nav, header, footer").length;
      if (landmarks < 2) problems.push("Fewer than two landmark regions.");
      return { problems, stats: { images: imgs.length, missingAlt, formControls: inputs.length, unlabeled, unnamedControls: buttons, headingSkips: skips, landmarks } };
    });
  } finally {
    await context.close();
  }
}
