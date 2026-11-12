import { z } from "zod";
import { chromium, type Browser } from "playwright";
import type { Prisma, VerificationMethod } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { storage } from "@/lib/storage";
import { hashBytes } from "@/lib/contracts/canonical";
import { generateStructured, geminiConfigured, userText } from "@/lib/gemini/client";
import { VERIFIER_INSTRUCTIONS } from "@/lib/agents/prompts";
import { startRun, finishRun, recordMessage, recordTool } from "@/lib/agents/runtime";
import { decide, PolicyDeniedError } from "@/lib/policy/snapshot";
import { transitionContract } from "@/lib/contracts/transitions";
import { loadDeliverableFiles, previewUrlFor } from "@/lib/deliverables/service";
import { CHECKS } from "@/lib/verification/checks";
import { METHOD_LABELS, METHOD_TIMEOUT_MS } from "@/lib/verification/methods";
import type { CheckContext, CheckResult, DeliverableFile } from "@/lib/verification/types";
import { enqueue } from "@/lib/jobs/queue";
import { notifyWorkspace } from "@/lib/notifications";
import { capturePayment } from "@/lib/payments/service";
import { paypalConfigured } from "@/lib/paypal";

/**
 * Verifier Agent. Tools execute every approved criterion; the model reads the
 * tool output to write the report, the correction request, and rubric scores
 * for subjective criteria. Pass or fail per criterion comes from the tool,
 * never from the model. If the model is unavailable the run still completes
 * with a deterministic summary.
 */

const reportSchema = z.object({
  summary: z.string(),
  failures: z.array(z.object({ key: z.string(), reason: z.string(), fix: z.string() })),
  correctionRequest: z.string(),
  recommendation: z.enum(["ACCEPT", "CORRECT", "HUMAN_REVIEW"]),
});
const reportJson = {
  type: "object",
  properties: {
    summary: { type: "string" },
    failures: { type: "array", items: { type: "object", properties: { key: { type: "string" }, reason: { type: "string" }, fix: { type: "string" } }, required: ["key", "reason", "fix"] } },
    correctionRequest: { type: "string" },
    recommendation: { type: "string", enum: ["ACCEPT", "CORRECT", "HUMAN_REVIEW"] },
  },
  required: ["summary", "failures", "correctionRequest", "recommendation"],
};

const rubricSchema = z.object({ items: z.array(z.object({ item: z.string(), score: z.number(), note: z.string() })), overall: z.number(), justification: z.string() });
const rubricJson = {
  type: "object",
  properties: {
    items: { type: "array", items: { type: "object", properties: { item: { type: "string" }, score: { type: "number" }, note: { type: "string" } }, required: ["item", "score", "note"] } },
    overall: { type: "number" },
    justification: { type: "string" },
  },
  required: ["items", "overall", "justification"],
};

async function launchBrowser(previewOrigin: string): Promise<{ browser: Browser; chromiumPath: string | null }> {
  const executablePath = env().PLAYWRIGHT_CHROMIUM_PATH || undefined;
  const browser = await chromium.launch({ headless: true, executablePath, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  let chromiumPath: string | null = executablePath ?? null;
  if (!chromiumPath) {
    try {
      chromiumPath = chromium.executablePath();
    } catch {
      chromiumPath = null;
    }
  }
  void previewOrigin;
  return { browser, chromiumPath };
}

export async function runVerifierAgent(verificationRunId: string): Promise<void> {
  const run = await db.verificationRun.findUniqueOrThrow({
    where: { id: verificationRunId },
    include: { contract: { include: { approvedVersion: { include: { criteria: { orderBy: { position: "asc" } } } }, workerAgent: true, organization: { include: { spendingPolicy: true } } } }, deliverable: true, verifierAgent: true },
  });
  if (run.status !== "QUEUED" && run.status !== "RUNNING") return;
  const { contract, deliverable } = run;
  if (!contract.approvedVersion) throw new Error("No approved contract version.");
  const criteria = contract.approvedVersion.criteria;
  const policy = contract.organization.spendingPolicy!;

  await db.$transaction(async (tx) => {
    const decision = await decide(tx, contract.id, "RUN_VERIFICATION");
    if (decision.outcome !== "ALLOW") throw new PolicyDeniedError(decision);
    await tx.verificationRun.update({ where: { id: run.id }, data: { status: "RUNNING", startedAt: new Date() } });
    await transitionContract(tx, contract.id, { verificationState: "RUNNING", actor: { type: "AGENT", id: run.verifierAgent.id, label: run.verifierAgent.name }, reason: `Verification attempt ${run.attempt} running against deliverable #${deliverable.submissionNumber} (root hash ${deliverable.rootHash}).` });
  });

  const handle = await startRun({ agentId: run.verifierAgent.id, contractId: contract.id, purpose: "VERIFICATION", model: env().GEMINI_MODEL_VERIFIER, correlationId: `verify-${run.id}` });
  await db.verificationRun.update({ where: { id: run.id }, data: { agentRunId: handle.run.id } });

  const previewUrl = previewUrlFor(deliverable.previewToken);
  const previewOrigin = new URL(previewUrl).origin;
  let browser: Browser | null = null;
  const resultsByKey = new Map<string, CheckResult & { criterionId: string; method: VerificationMethod }>();
  const screenshotsForRubric: Buffer[] = [];
  const pageText: string[] = [];

  try {
    const files: DeliverableFile[] = await recordTool(handle, "load_deliverable", { deliverableId: deliverable.id }, async () => loadDeliverableFiles(deliverable.id));
    await recordMessage(handle, { kind: "STATUS", content: `Loaded ${files.length} files. Root hash ${deliverable.rootHash} verified against the manifest. Running ${criteria.length} criteria.` });

    const needsBrowser = criteria.some((c) => c.method !== "JSON_SCHEMA" && c.method !== "DATASET_ROW_COUNT" && c.method !== "DATASET_UNIQUENESS");
    let chromiumPath: string | null = null;
    if (needsBrowser) {
      const launched = await launchBrowser(previewOrigin);
      browser = launched.browser;
      chromiumPath = launched.chromiumPath;
    }

    const ctxBase: Omit<CheckContext, "method" | "criterionKey" | "parameters"> = {
      contractId: contract.id,
      deliverableId: deliverable.id,
      verificationRunId: run.id,
      previewUrl,
      previewOrigin,
      files,
      formCaptureToken: deliverable.previewToken,
      browser,
      lighthouseEnabled: env().LIGHTHOUSE_ENABLED,
      chromiumPath,
      log: (message, meta) => logger.info(`verifier: ${message}`, { runId: run.id, ...meta }),
      newContext: async (options) => {
        if (!browser) throw new Error("Browser not available.");
        const context = await browser.newContext({ viewport: options?.viewport ?? { width: 1280, height: 900 }, isMobile: options?.isMobile ?? false, javaScriptEnabled: true, ignoreHTTPSErrors: false });
        // Network isolation: the page may only load its own files and post to the capture endpoint.
        await context.route("**/*", (route) => {
          const url = route.request().url();
          if (url.startsWith(previewOrigin + "/preview/") || url.startsWith(previewOrigin + "/api/form-capture/") || url.startsWith("data:")) return route.continue();
          return route.abort("blockedbyclient");
        });
        return context;
      },
    };

    for (const criterion of criteria) {
      if (criterion.method === "RUBRIC_REVIEW") continue;
      const check = CHECKS[criterion.method];
      const ctx: CheckContext = { ...ctxBase, method: criterion.method, criterionKey: criterion.key, parameters: (criterion.parameters as Record<string, unknown>) ?? {} };
      let result: CheckResult;
      try {
        result = await recordTool(handle, `check:${criterion.method}`, { key: criterion.key, parameters: ctx.parameters }, () => check(ctx), { timeoutMs: METHOD_TIMEOUT_MS[criterion.method] ?? 90_000 });
      } catch (error) {
        result = { passed: null, details: { error: error instanceof Error ? error.message : String(error), status: "tool_error" }, evidence: [] };
      }
      resultsByKey.set(criterion.key, { ...result, criterionId: criterion.id, method: criterion.method });
      for (const ev of result.evidence) {
        if (ev.kind === "SCREENSHOT" && screenshotsForRubric.length < 3) screenshotsForRubric.push(ev.bytes);
      }
      await persistResult(run.id, criterion.id, criterion.key, criterion.method, result);
      await recordMessage(handle, { kind: "STATUS", content: `${METHOD_LABELS[criterion.method]} (${criterion.key}): ${result.passed === true ? "passed" : result.passed === false ? "failed" : "not determined"}.`, structured: { key: criterion.key, passed: result.passed, score: result.score ?? null, details: result.details } });
    }

    if (browser && screenshotsForRubric.length === 0 && criteria.some((c) => c.method === "RUBRIC_REVIEW")) {
      const context = await ctxBase.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await context.newPage();
      await page.goto(previewUrl, { waitUntil: "load", timeout: 30000 }).catch(() => undefined);
      screenshotsForRubric.push(await page.screenshot({ fullPage: true, type: "png" }));
      pageText.push((await page.evaluate(() => document.body.innerText).catch(() => "")).slice(0, 6000));
      await context.close();
    }

    // Subjective criteria: rubric scoring by the model, routed to a human by policy when configured.
    for (const criterion of criteria.filter((c) => c.method === "RUBRIC_REVIEW")) {
      const params = (criterion.parameters as { rubric?: string[]; minScore?: number }) ?? {};
      let result: CheckResult;
      if (!geminiConfigured()) {
        result = { passed: null, details: { status: "needs_human_review", reason: "Gemini is not configured; subjective criteria require human review." }, evidence: [] };
      } else {
        try {
          const scored = await recordTool(handle, "rubric_review", { key: criterion.key, rubric: params.rubric }, async () => {
            const parts: ({ text: string } | { inlineData: { mimeType: string; data: string } })[] = [
              { text: `Criterion: ${criterion.description}\nRubric items:\n${(params.rubric ?? []).map((r, i) => `${i + 1}. ${r}`).join("\n")}\n\nScore each item 0 to 10 using only the screenshots and page text provided. Page text:\n${pageText.join("\n").slice(0, 6000) || "(not captured)"}` },
              ...screenshotsForRubric.slice(0, 3).map((b) => ({ inlineData: { mimeType: "image/png", data: b.toString("base64") } })),
            ];
            const out = await generateStructured({ model: env().GEMINI_MODEL_VERIFIER, systemInstruction: VERIFIER_INSTRUCTIONS, contents: [{ role: "user", parts }], schema: rubricSchema, jsonSchema: rubricJson, timeoutMs: 120_000 });
            handle.usage.inputTokens += out.usage.inputTokens;
            handle.usage.outputTokens += out.usage.outputTokens;
            return out.value;
          });
          const minScore = params.minScore ?? 7;
          result = { passed: scored.overall >= minScore, score: scored.overall, details: { ...scored, minScore, assessedBy: "verifier_model", note: "Subjective assessment. The policy engine decides whether a human must confirm it." }, evidence: [{ kind: "TEST_OUTPUT", label: `Rubric scoring for ${criterion.key}`, mimeType: "application/json", bytes: Buffer.from(JSON.stringify(scored, null, 2)) }] };
        } catch (error) {
          result = { passed: null, details: { status: "needs_human_review", reason: `Rubric scoring failed: ${error instanceof Error ? error.message : String(error)}` }, evidence: [] };
        }
      }
      resultsByKey.set(criterion.key, { ...result, criterionId: criterion.id, method: criterion.method });
      await persistResult(run.id, criterion.id, criterion.key, criterion.method, result);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finishRun(handle, { status: "FAILED", error: message });
    await db.$transaction(async (tx) => {
      await tx.verificationRun.update({ where: { id: run.id }, data: { status: "ERROR", summary: message.slice(0, 2000), finishedAt: new Date() } });
      await transitionContract(tx, contract.id, { verificationState: "ERROR", actor: { type: "SYSTEM", label: "Verifier runtime" }, reason: `Verification errored: ${message}`, severity: "WARNING" });
    });
    throw error;
  } finally {
    if (browser) await browser.close().catch(() => undefined);
  }

  // Deterministic outcome from tool results.
  const requiredObjective = criteria.filter((c) => c.kind === "OBJECTIVE" && c.required);
  const failedRequired = requiredObjective.filter((c) => resultsByKey.get(c.key)?.passed !== true);
  const undetermined = requiredObjective.filter((c) => resultsByKey.get(c.key)?.passed === null);
  const subjectiveUnscored = criteria.filter((c) => c.kind === "SUBJECTIVE" && resultsByKey.get(c.key)?.passed === null);
  const objectivePassed = failedRequired.length === 0;
  const status: "PASSED" | "FAILED" | "NEEDS_HUMAN_REVIEW" = !objectivePassed ? (undetermined.length === failedRequired.length ? "NEEDS_HUMAN_REVIEW" : "FAILED") : subjectiveUnscored.length > 0 ? "NEEDS_HUMAN_REVIEW" : "PASSED";

  // Narrative report from the model, grounded in tool output only.
  const toolSummary = criteria.map((c) => ({ key: c.key, method: c.method, kind: c.kind, required: c.required, description: c.description, passed: resultsByKey.get(c.key)?.passed ?? null, score: resultsByKey.get(c.key)?.score ?? null, details: JSON.stringify(resultsByKey.get(c.key)?.details ?? {}).slice(0, 1500) }));
  let report: z.infer<typeof reportSchema>;
  if (geminiConfigured()) {
    try {
      const out = await generateStructured({
        model: env().GEMINI_MODEL_VERIFIER,
        systemInstruction: VERIFIER_INSTRUCTIONS,
        contents: [userText(`Deterministic outcome: ${status}. Required objective criteria failed: ${failedRequired.map((c) => c.key).join(", ") || "none"}.\n\nTool results (JSON):\n${JSON.stringify(toolSummary, null, 2)}\n\nWrite the verification report. The recommendation must be consistent with the deterministic outcome.`)],
        schema: reportSchema,
        jsonSchema: reportJson,
      });
      handle.usage.inputTokens += out.usage.inputTokens;
      handle.usage.outputTokens += out.usage.outputTokens;
      report = out.value;
    } catch (error) {
      logger.warn("Verifier report generation failed; using deterministic summary", { error: String(error) });
      report = deterministicReport(status, toolSummary);
    }
  } else {
    report = deterministicReport(status, toolSummary);
  }
  const recommendation = status === "PASSED" ? "ACCEPT" : status === "FAILED" ? "CORRECT" : "HUMAN_REVIEW";
  report.recommendation = recommendation;

  await recordMessage(handle, { kind: "VERIFICATION_REPORT", content: `${report.summary}\n\nRecommendation: ${recommendation}.`, structured: { ...report, status, failed: failedRequired.map((c) => c.key) } });

  const workerLabel = contract.workerAgent ? { type: "AGENT" as const, id: contract.workerAgent.id, label: contract.workerAgent.name } : { type: "SYSTEM" as const, label: "Worker" };
  await db.$transaction(async (tx) => {
    await tx.verificationRun.update({ where: { id: run.id }, data: { status, recommendation, summary: report.summary.slice(0, 2000), report: { ...report, status, deterministic: { failedRequired: failedRequired.map((c) => c.key), undetermined: undetermined.map((c) => c.key), subjectiveUnscored: subjectiveUnscored.map((c) => c.key) } } as unknown as Prisma.InputJsonValue, finishedAt: new Date() } });
    if (status === "PASSED") {
      await transitionContract(tx, contract.id, { status: "ELIGIBLE_FOR_CAPTURE", verificationState: "PASSED", actor: { type: "AGENT", id: run.verifierAgent.id, label: run.verifierAgent.name }, reason: `Verification attempt ${run.attempt} passed: all ${requiredObjective.length} required objective criteria met. Requesting a capture decision from the policy engine.`, severity: "NOTICE" });
    } else if (status === "FAILED") {
      const exceeded = contract.correctionCount + 1 > policy.maxCorrectionAttempts;
      await tx.contract.update({ where: { id: contract.id }, data: { correctionCount: { increment: 1 } } });
      await transitionContract(tx, contract.id, {
        status: exceeded ? "FAILED" : "CORRECTION_REQUIRED",
        verificationState: "FAILED",
        data: exceeded ? { failureReason: `Verification failed ${contract.correctionCount + 1} times; correction limit reached.` } : undefined,
        actor: { type: "AGENT", id: run.verifierAgent.id, label: run.verifierAgent.name },
        reason: `Verification attempt ${run.attempt} failed: ${failedRequired.map((c) => c.key).join(", ")}. Capture is blocked. ${exceeded ? "Correction limit reached." : "Correction requested from the worker."}`,
        severity: "WARNING",
      });
    } else {
      await transitionContract(tx, contract.id, { status: "AWAITING_HUMAN_REVIEW", verificationState: "NEEDS_HUMAN_REVIEW", actor: { type: "AGENT", id: run.verifierAgent.id, label: run.verifierAgent.name }, reason: `Verification attempt ${run.attempt} needs human review: ${[...undetermined, ...subjectiveUnscored].map((c) => c.key).join(", ")}.`, severity: "NOTICE" });
      await tx.approvalRequest.create({ data: { organizationId: contract.organizationId, contractId: contract.id, kind: "HUMAN_REVIEW", title: "Verification needs a human decision", description: report.summary.slice(0, 1000), context: { verificationRunId: run.id } } });
    }
  });
  await finishRun(handle, { status: "SUCCEEDED", summary: `${status}: ${report.summary}`.slice(0, 500), iterations: criteria.length });

  if (status === "FAILED") {
    const fresh = await db.contract.findUniqueOrThrow({ where: { id: contract.id } });
    if (fresh.status === "CORRECTION_REQUIRED") {
      await recordMessage(handle, { kind: "CORRECTION_REQUEST", toAgentId: contract.workerAgentId, content: report.correctionRequest, structured: { failures: report.failures } });
      await enqueue("work.correct", { contractId: contract.id }, { contractId: contract.id, dedupeKey: `correct:${contract.id}:${run.attempt}` });
    }
    await notifyWorkspace(contract.organizationId, { kind: "verification_outcome", subject: `Verification failed for "${contract.title}"`, heading: "Payment capture blocked", paragraphs: [`Attempt ${run.attempt} failed: ${failedRequired.map((c) => c.key).join(", ")}.`, fresh.status === "CORRECTION_REQUIRED" ? "The worker has been sent a correction request." : "The correction limit was reached; the authorization can be voided."], contractId: contract.id });
  } else if (status === "PASSED") {
    void workerLabel;
    await notifyWorkspace(contract.organizationId, { kind: "verification_outcome", subject: `Verification passed for "${contract.title}"`, heading: "All objective criteria met", paragraphs: [`Attempt ${run.attempt} passed every required check.`, "The policy engine will now decide whether capture can proceed or needs your approval."], contractId: contract.id });
    if (paypalConfigured()) {
      try {
        await capturePayment(contract.id, { type: "SYSTEM", label: "Post-verification settlement" });
      } catch (error) {
        logger.warn("Capture after verification did not complete", { contractId: contract.id, error: String(error) });
      }
    } else {
      // Record the engine's decision anyway so the contract page explains why settlement cannot proceed.
      await db.$transaction((tx) => decide(tx, contract.id, "CAPTURE_PAYMENT", { actorLabel: "Post-verification settlement" }));
      logger.warn("PayPal is not configured; capture decision recorded without a capture attempt", { contractId: contract.id });
    }
  } else {
    await notifyWorkspace(contract.organizationId, { kind: "approval_request", subject: `Human review needed for "${contract.title}"`, heading: "A verification decision needs you", paragraphs: [report.summary], contractId: contract.id });
  }
}

function deterministicReport(status: string, toolSummary: { key: string; passed: boolean | null; description: string; details: string }[]) {
  const failures = toolSummary.filter((t) => t.passed !== true).map((t) => ({ key: t.key, reason: t.passed === null ? "Check could not be completed." : `Tool reported failure: ${t.details.slice(0, 300)}`, fix: `Address the criterion: ${t.description}` }));
  return {
    summary: `${status}. ${toolSummary.filter((t) => t.passed === true).length} of ${toolSummary.length} criteria passed.`,
    failures,
    correctionRequest: failures.length ? `Fix the following criteria: ${failures.map((f) => `${f.key}: ${f.fix}`).join("; ")}` : "No correction needed.",
    recommendation: status === "PASSED" ? ("ACCEPT" as const) : status === "FAILED" ? ("CORRECT" as const) : ("HUMAN_REVIEW" as const),
  };
}

async function persistResult(verificationRunId: string, criterionId: string, criterionKey: string, method: VerificationMethod, result: CheckResult) {
  const store = storage();
  const record = await db.verificationResult.upsert({
    where: { verificationRunId_criterionKey: { verificationRunId, criterionKey } },
    create: { verificationRunId, criterionId, criterionKey, method, passed: result.passed, score: result.score ?? null, details: JSON.parse(JSON.stringify(result.details)) as Prisma.InputJsonValue },
    update: { passed: result.passed, score: result.score ?? null, details: JSON.parse(JSON.stringify(result.details)) as Prisma.InputJsonValue },
  });
  let index = 0;
  for (const ev of result.evidence) {
    index += 1;
    const hash = hashBytes(ev.bytes);
    const ext = ev.mimeType === "image/png" ? "png" : "json";
    const key = `evidence/${verificationRunId}/${criterionKey}-${index}.${ext}`;
    await store.put(key, ev.bytes, ev.mimeType);
    await db.evidenceRecord.create({ data: { verificationRunId, resultId: record.id, kind: ev.kind, storageKey: key, contentHash: hash, sizeBytes: ev.bytes.length, mimeType: ev.mimeType, label: ev.label, metadata: ev.metadata ? (JSON.parse(JSON.stringify(ev.metadata)) as Prisma.InputJsonValue) : undefined } });
  }
}
