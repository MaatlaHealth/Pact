import { Type, type FunctionDeclaration } from "@google/genai";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { userText } from "@/lib/gemini/client";
import { WORKER_INSTRUCTIONS } from "@/lib/agents/prompts";
import { startRun, finishRun, recordMessage, runToolLoop, type ToolDefinition } from "@/lib/agents/runtime";
import { decide, PolicyDeniedError } from "@/lib/policy/snapshot";
import { transitionContract } from "@/lib/contracts/transitions";
import { storeDeliverable, validateArtifactFiles, formCaptureUrlFor, DeliverableValidationError, type ArtifactInput } from "@/lib/deliverables/service";
import { enqueue } from "@/lib/jobs/queue";
import { generateToken } from "@/lib/security/tokens";
import type { ContractContent } from "@/lib/contracts/schema";
import { METHOD_LABELS } from "@/lib/verification/methods";

/**
 * Worker Agent execution. The model works through tools: it reads the brief,
 * writes files into an in-memory workspace, runs a limited self-check, and
 * submits. Files are validated and stored as an immutable deliverable; the
 * independent verifier decides whether they meet the contract.
 */

export type WorkerScenario = "BEST_EFFORT" | "DEFECTIVE_FIRST_DRAFT";

const writeFileDecl: FunctionDeclaration = {
  name: "write_file",
  description: "Create or replace a file in the deliverable workspace. Paths are relative (index.html, styles.css, script.js, dataset.json). Content must be complete.",
  parameters: { type: Type.OBJECT, properties: { path: { type: Type.STRING }, content: { type: Type.STRING } }, required: ["path", "content"] },
};
const readFileDecl: FunctionDeclaration = {
  name: "read_file",
  description: "Read a file you previously wrote.",
  parameters: { type: Type.OBJECT, properties: { path: { type: Type.STRING } }, required: ["path"] },
};
const listFilesDecl: FunctionDeclaration = { name: "list_files", description: "List files in the workspace with sizes.", parameters: { type: Type.OBJECT, properties: {} } };
const selfCheckDecl: FunctionDeclaration = { name: "self_check", description: "Run a quick structural check of the workspace against the brief. This is not the independent verification.", parameters: { type: Type.OBJECT, properties: {} } };
const submitDecl: FunctionDeclaration = {
  name: "submit_deliverable",
  description: "Submit the workspace as the deliverable for independent verification. Include short notes on how each criterion is addressed.",
  parameters: { type: Type.OBJECT, properties: { notes: { type: Type.STRING } }, required: ["notes"] },
};

interface SelfCheckReport {
  ok: boolean;
  problems: string[];
  files: string[];
}

function selfCheck(files: Map<string, string>, content: ContractContent, formAction: string): SelfCheckReport {
  const problems: string[] = [];
  if (content.category === "LANDING_PAGE") {
    const html = files.get("index.html");
    if (!html) problems.push("index.html is missing.");
    else {
      if (!/<!doctype html>/i.test(html)) problems.push("Missing <!doctype html>.");
      if (!/<html[^>]+lang=/i.test(html)) problems.push("Missing lang attribute on <html>.");
      if (!/<meta[^>]+viewport/i.test(html)) problems.push("Missing viewport meta.");
      if (!/<title>[^<]+<\/title>/i.test(html)) problems.push("Missing <title>.");
      if ((html.match(/<h1[\s>]/gi) ?? []).length !== 1) problems.push("Exactly one <h1> is required.");
      if (/<(script|link)[^>]+(src|href)=["']https?:/i.test(html)) problems.push("External scripts or stylesheets are not allowed.");
      for (const c of content.criteria) {
        if (c.method === "REQUIRED_SECTIONS") {
          for (const s of (c.parameters.sections as string[]) ?? []) {
            const id = s.toLowerCase().replace(/[^a-z0-9]+/g, "-");
            if (!new RegExp(`id=["']${id}["']`, "i").test(html)) problems.push(`No element with id="${id}" for section "${s}".`);
          }
        }
        if (c.method === "CONTACT_FORM_SUBMISSION") {
          if (!/<form[\s>]/i.test(html)) problems.push("No <form> element.");
          else {
            if (!html.includes(`action="${formAction}"`) && !html.includes(`action='${formAction}'`)) problems.push(`Form action must be exactly ${formAction}.`);
            if (!/<form[^>]+method=["']post["']/i.test(html)) problems.push('Form method must be "post".');
            for (const f of (c.parameters.requiredFields as string[]) ?? ["name", "email", "message"]) {
              if (!new RegExp(`name=["']${f}["']`, "i").test(html)) problems.push(`Form field name="${f}" is missing.`);
            }
          }
        }
      }
      const imgsWithoutAlt = (html.match(/<img(?![^>]*alt=)[^>]*>/gi) ?? []).length;
      if (imgsWithoutAlt) problems.push(`${imgsWithoutAlt} <img> tags lack alt.`);
      if (/href=["']#["']/.test(html)) problems.push('Links with href="#" will fail the navigation and broken-link checks.');
    }
  } else {
    const json = files.get("dataset.json");
    if (!json) problems.push("dataset.json is missing.");
    else {
      try {
        const parsed = JSON.parse(json);
        if (!Array.isArray(parsed)) problems.push("dataset.json must be a JSON array.");
      } catch {
        problems.push("dataset.json is not valid JSON.");
      }
    }
  }
  return { ok: problems.length === 0, problems, files: Array.from(files.keys()) };
}

export async function runWorkerExecution(contractId: string, mode: "EXECUTION" | "CORRECTION"): Promise<void> {
  const contract = await db.contract.findUniqueOrThrow({
    where: { id: contractId },
    include: { approvedVersion: true, workerAgent: true, organization: { include: { spendingPolicy: true } }, verificationRuns: { orderBy: { attempt: "desc" }, take: 1, include: { results: true } }, deliverables: { orderBy: { submissionNumber: "desc" }, take: 1 } },
  });
  if (!contract.workerAgent || !contract.approvedVersion) throw new Error("Contract has no worker or approved version.");
  if (!["AUTHORIZED", "CORRECTION_REQUIRED", "IN_PROGRESS"].includes(contract.status)) return;
  const content = contract.approvedVersion.content as unknown as ContractContent;
  const worker = contract.workerAgent;
  const scenario = ((await db.integrationSetting.findUnique({ where: { organizationId_provider: { organizationId: contract.organizationId, provider: `scenario:${contractId}` } } }))?.config as { scenario?: WorkerScenario } | undefined)?.scenario ?? "BEST_EFFORT";

  if (contract.status !== "IN_PROGRESS") {
    await db.$transaction(async (tx) => {
      const decision = await decide(tx, contractId, "START_WORK");
      if (decision.outcome !== "ALLOW") throw new PolicyDeniedError(decision);
      await transitionContract(tx, contractId, { status: "IN_PROGRESS", actor: { type: "AGENT", id: worker.id, label: worker.name }, reason: mode === "CORRECTION" ? `Correction attempt ${contract.correctionCount} started.` : "Work started under an authorized payment." });
    });
  }

  const handle = await startRun({ agentId: worker.id, contractId, purpose: mode, model: env().GEMINI_MODEL_WORKER, correlationId: `work-${contractId}-${(contract.deliverables[0]?.submissionNumber ?? 0) + 1}` });
  const previewToken = generateToken(18);
  const formAction = formCaptureUrlFor(previewToken);
  const files = new Map<string, string>();

  // Corrections start from the previous submission so the worker revises real files.
  if (mode === "CORRECTION" && contract.deliverables[0]) {
    const { loadDeliverableFiles } = await import("@/lib/deliverables/service");
    for (const f of await loadDeliverableFiles(contract.deliverables[0].id)) files.set(f.path, f.bytes.toString("utf8"));
  }

  const lastRun = contract.verificationRuns[0];
  const failureReport = mode === "CORRECTION" && lastRun ? formatFailureReport(lastRun.report, lastRun.results, content) : null;
  const draftConstraint =
    scenario === "DEFECTIVE_FIRST_DRAFT" && mode === "EXECUTION"
      ? `\n\nDRAFT CONSTRAINT (labelled demonstration scenario): this first submission is a draft. Leave the contact form's action attribute as "#" with method "get" and do not wire it to the capture endpoint yet. Everything else must be complete.`
      : "";

  const brief = [
    `You are working on contract "${content.title}" (${content.category}).`,
    content.taskDescription,
    ``,
    `Deliverables:`,
    ...content.deliverables.map((d) => `- ${d}`),
    ``,
    `Acceptance criteria (verified independently by tools after you submit):`,
    ...content.criteria.map((c) => `- ${c.key} [${METHOD_LABELS[c.method as keyof typeof METHOD_LABELS]}]: ${c.description} ${c.method === "RUBRIC_REVIEW" ? `Rubric: ${((c.parameters.rubric as string[]) ?? []).join("; ")}` : `Parameters: ${JSON.stringify(c.parameters)}`}`),
    ``,
    content.category === "LANDING_PAGE"
      ? `Contact form requirements: <form action="${formAction}" method="post"> with inputs named name, email, message and a submit button. After submission the browser will show the endpoint's confirmation page.`
      : `Write dataset.json containing a JSON array of objects that satisfies the schema and uniqueness criteria exactly.`,
    `Required section ids (lowercase, hyphenated): ${content.criteria.filter((c) => c.method === "REQUIRED_SECTIONS").flatMap((c) => (c.parameters.sections as string[]) ?? []).map((s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-")).join(", ") || "none"}.`,
    draftConstraint,
    failureReport ? `\n\nPREVIOUS VERIFICATION FAILED. Fix every item below, keep everything that passed, and resubmit:\n${failureReport}` : "",
    mode === "CORRECTION" ? `\nYour previous files are already in the workspace: ${Array.from(files.keys()).join(", ")}. Read them, revise them, run self_check, then submit.` : `\nStart by writing the files, run self_check, fix problems, then submit.`,
  ].join("\n");

  await recordMessage(handle, { kind: "STATUS", content: mode === "CORRECTION" ? "Starting correction from the previous deliverable." : "Starting work from the approved brief.", structured: { scenario, formAction } });

  const tools: ToolDefinition[] = [
    { declaration: writeFileDecl, handler: async (args) => {
        const path = String(args.path ?? "");
        const text = String(args.content ?? "");
        validateArtifactFiles([{ path, content: text }], content.category === "LANDING_PAGE" ? "STATIC_SITE" : "JSON_DATASET");
        files.set(path.replace(/^\.?\//, ""), text);
        return { written: path, bytes: Buffer.byteLength(text) };
      } },
    { declaration: readFileDecl, handler: async (args) => ({ path: args.path, content: files.get(String(args.path)) ?? null }) },
    { declaration: listFilesDecl, handler: async () => ({ files: Array.from(files.entries()).map(([p, c]) => ({ path: p, bytes: Buffer.byteLength(c) })) }) },
    { declaration: selfCheckDecl, handler: async () => selfCheck(files, content, formAction) },
    { declaration: submitDecl, handler: async (args) => {
        const artifacts: ArtifactInput[] = Array.from(files.entries()).map(([path, text]) => ({ path, content: text }));
        validateArtifactFiles(artifacts, content.category === "LANDING_PAGE" ? "STATIC_SITE" : "JSON_DATASET");
        return { accepted: true, files: artifacts.length, notes: String(args.notes ?? "") };
      } },
  ];

  try {
    const loop = await runToolLoop(handle, { model: env().GEMINI_MODEL_WORKER, systemInstruction: WORKER_INSTRUCTIONS, initialContents: [userText(brief)], tools, maxIterations: 14, terminalTool: "submit_deliverable" });
    if (!loop.terminated) throw new Error(`Worker did not submit within the iteration limit (${loop.iterations}).`);
    const notes = String(loop.terminalArgs?.notes ?? "");
    const artifacts: ArtifactInput[] = Array.from(files.entries()).map(([path, text]) => ({ path, content: text }));

    const deliverable = await db.$transaction(async (tx) => {
      const decision = await decide(tx, contractId, "SUBMIT_DELIVERABLE");
      if (decision.outcome !== "ALLOW") throw new PolicyDeniedError(decision);
      return null;
    }).then(() => storeDeliverable({ contractId, workerAgentId: worker.id, runId: handle.run.id, kind: content.category === "LANDING_PAGE" ? "STATIC_SITE" : "JSON_DATASET", files: artifacts, workerNotes: notes }));
    // The preview token is fixed before generation so the form action matches.
    await db.deliverable.update({ where: { id: deliverable.id }, data: { previewToken } });

    await recordMessage(handle, { kind: "SUBMISSION", content: `Submitted deliverable #${deliverable.submissionNumber} (${artifacts.length} files, root hash ${deliverable.rootHash}). ${notes}`.slice(0, 4000), structured: { deliverableId: deliverable.id, rootHash: deliverable.rootHash, files: artifacts.map((a) => a.path) } });

    const verifierAgent = await db.agent.findFirstOrThrow({ where: { role: "VERIFIER", isPlatformAgent: true, status: "ACTIVE" } });
    const attempt = (await db.verificationRun.count({ where: { contractId } })) + 1;
    await db.$transaction(async (tx) => {
      await tx.contract.update({ where: { id: contractId }, data: { verifierAgentId: verifierAgent.id } });
      await transitionContract(tx, contractId, { status: "UNDER_VERIFICATION", verificationState: "QUEUED", actor: { type: "AGENT", id: worker.id, label: worker.name }, reason: `Deliverable #${deliverable.submissionNumber} submitted. Verification attempt ${attempt} queued.`, severity: "NOTICE" });
      const run = await tx.verificationRun.create({ data: { contractId, deliverableId: deliverable.id, verifierAgentId: verifierAgent.id, attempt } });
      await enqueue("verification.run", { verificationRunId: run.id, contractId }, { contractId, dedupeKey: `verify:${run.id}`, maxAttempts: 2 }, tx);
    });
    await finishRun(handle, { status: "SUCCEEDED", summary: `Submitted deliverable #${deliverable.submissionNumber}.`, iterations: loop.iterations });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finishRun(handle, { status: error instanceof DeliverableValidationError ? "FAILED" : "FAILED", error: message });
    await db.$transaction((tx) => transitionContract(tx, contractId, { status: "FAILED", data: { failureReason: `Worker execution failed: ${message}` }, actor: { type: "SYSTEM", label: "Worker runtime" }, reason: `Worker execution failed: ${message}`, severity: "WARNING" })).catch(() => undefined);
    throw error;
  }
}

function formatFailureReport(report: unknown, results: { criterionKey: string; passed: boolean | null; details: unknown }[], content: ContractContent): string {
  const r = report as { correctionRequest?: string; failures?: { key: string; reason: string }[] } | null;
  const lines: string[] = [];
  if (r?.correctionRequest) lines.push(r.correctionRequest);
  for (const result of results.filter((x) => x.passed !== true)) {
    const criterion = content.criteria.find((c) => c.key === result.criterionKey);
    const details = JSON.stringify(result.details).slice(0, 700);
    lines.push(`- ${result.criterionKey} (${criterion?.method ?? "unknown"}): ${criterion?.description ?? ""} Tool output: ${details}`);
  }
  return lines.join("\n");
}
