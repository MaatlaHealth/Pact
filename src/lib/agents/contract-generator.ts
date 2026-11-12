import { z } from "zod";
import { env } from "@/lib/env";
import { db } from "@/lib/db";
import { generateStructured, userText, geminiConfigured } from "@/lib/gemini/client";
import { contractContentSchema, normaliseContractContent, type ContractContent } from "@/lib/contracts/schema";
import { CONTRACT_GENERATOR_INSTRUCTIONS, PROMPT_VERSION } from "@/lib/agents/prompts";
import { startRun, finishRun, recordMessage, platformAgent } from "@/lib/agents/runtime";
import { HttpError } from "@/lib/security/request";

/**
 * Natural language objective to structured contract. The model returns a
 * flat draft shape that is easy to constrain; it is then mapped onto the
 * strict ContractContent schema, so nothing unvalidated reaches the database.
 */

const draftCriterionSchema = z.object({
  key: z.string(),
  description: z.string(),
  kind: z.enum(["OBJECTIVE", "SUBJECTIVE"]),
  method: z.enum([
    "HTTP_AVAILABILITY",
    "REQUIRED_SECTIONS",
    "NAVIGATION_LINKS",
    "RESPONSIVE_VIEWPORTS",
    "CONTACT_FORM_SUBMISSION",
    "ACCESSIBILITY_AUDIT",
    "LIGHTHOUSE_MOBILE_PERFORMANCE",
    "CONSOLE_ERRORS",
    "BROKEN_LINKS",
    "HTML_VALIDITY",
    "JSON_SCHEMA",
    "DATASET_ROW_COUNT",
    "DATASET_UNIQUENESS",
    "RUBRIC_REVIEW",
  ]),
  required: z.boolean(),
  sections: z.array(z.string()).optional(),
  minScore: z.number().optional(),
  minLinks: z.number().optional(),
  widths: z.array(z.number()).optional(),
  requiredFields: z.array(z.string()).optional(),
  maxErrors: z.number().optional(),
  maxBroken: z.number().optional(),
  jsonSchemaText: z.string().optional(),
  minRows: z.number().optional(),
  maxRows: z.number().optional(),
  uniqueField: z.string().optional(),
  rubric: z.array(z.string()).optional(),
});

const draftSchema = z.object({
  title: z.string(),
  category: z.enum(["LANDING_PAGE", "JSON_DATASET"]),
  taskDescription: z.string(),
  deliverables: z.array(z.string()),
  budgetCents: z.number().int(),
  currency: z.string(),
  deadlineIso: z.string().nullable(),
  criteria: z.array(draftCriterionSchema),
  evidenceRequirements: z.array(z.string()),
  captureCondition: z.string(),
  approvalRequirements: z.array(z.string()),
  disputeProcedure: z.string(),
});
type Draft = z.infer<typeof draftSchema>;

const draftJsonSchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    category: { type: "string", enum: ["LANDING_PAGE", "JSON_DATASET"] },
    taskDescription: { type: "string" },
    deliverables: { type: "array", items: { type: "string" } },
    budgetCents: { type: "integer" },
    currency: { type: "string" },
    deadlineIso: { type: "string", nullable: true },
    criteria: {
      type: "array",
      items: {
        type: "object",
        properties: {
          key: { type: "string" },
          description: { type: "string" },
          kind: { type: "string", enum: ["OBJECTIVE", "SUBJECTIVE"] },
          method: {
            type: "string",
            enum: ["HTTP_AVAILABILITY", "REQUIRED_SECTIONS", "NAVIGATION_LINKS", "RESPONSIVE_VIEWPORTS", "CONTACT_FORM_SUBMISSION", "ACCESSIBILITY_AUDIT", "LIGHTHOUSE_MOBILE_PERFORMANCE", "CONSOLE_ERRORS", "BROKEN_LINKS", "HTML_VALIDITY", "JSON_SCHEMA", "DATASET_ROW_COUNT", "DATASET_UNIQUENESS", "RUBRIC_REVIEW"],
          },
          required: { type: "boolean" },
          sections: { type: "array", items: { type: "string" } },
          minScore: { type: "number" },
          minLinks: { type: "integer" },
          widths: { type: "array", items: { type: "integer" } },
          requiredFields: { type: "array", items: { type: "string" } },
          maxErrors: { type: "integer" },
          maxBroken: { type: "integer" },
          jsonSchemaText: { type: "string" },
          minRows: { type: "integer" },
          maxRows: { type: "integer" },
          uniqueField: { type: "string" },
          rubric: { type: "array", items: { type: "string" } },
        },
        required: ["key", "description", "kind", "method", "required"],
      },
    },
    evidenceRequirements: { type: "array", items: { type: "string" } },
    captureCondition: { type: "string" },
    approvalRequirements: { type: "array", items: { type: "string" } },
    disputeProcedure: { type: "string" },
  },
  required: ["title", "category", "taskDescription", "deliverables", "budgetCents", "currency", "deadlineIso", "criteria", "evidenceRequirements", "captureCondition", "approvalRequirements", "disputeProcedure"],
};

export function draftToContent(draft: Draft, policy: { requireHumanApprovalForCapture: boolean }): ContractContent {
  const criteria = draft.criteria.map((c) => {
    const parameters: Record<string, unknown> = {};
    switch (c.method) {
      case "REQUIRED_SECTIONS":
        parameters.sections = c.sections ?? [];
        break;
      case "NAVIGATION_LINKS":
        parameters.minLinks = c.minLinks ?? 3;
        break;
      case "RESPONSIVE_VIEWPORTS":
        parameters.widths = c.widths ?? [375, 768, 1280];
        break;
      case "CONTACT_FORM_SUBMISSION":
        parameters.requiredFields = c.requiredFields ?? ["name", "email", "message"];
        break;
      case "ACCESSIBILITY_AUDIT":
      case "LIGHTHOUSE_MOBILE_PERFORMANCE":
        parameters.minScore = c.minScore ?? 90;
        break;
      case "CONSOLE_ERRORS":
        parameters.maxErrors = c.maxErrors ?? 0;
        break;
      case "BROKEN_LINKS":
        parameters.maxBroken = c.maxBroken ?? 0;
        break;
      case "JSON_SCHEMA":
        parameters.schema = c.jsonSchemaText ? safeParseJson(c.jsonSchemaText) : {};
        break;
      case "DATASET_ROW_COUNT":
        parameters.min = c.minRows ?? 1;
        if (c.maxRows) parameters.max = c.maxRows;
        break;
      case "DATASET_UNIQUENESS":
        parameters.field = c.uniqueField ?? "id";
        break;
      case "RUBRIC_REVIEW":
        parameters.rubric = c.rubric ?? [c.description];
        parameters.minScore = c.minScore && c.minScore <= 10 ? c.minScore : 7;
        break;
      default:
        break;
    }
    return { key: c.key.toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 48), description: c.description, kind: c.kind, method: c.method, parameters, required: c.required };
  });
  const content = contractContentSchema.parse({
    title: draft.title,
    category: draft.category,
    taskDescription: draft.taskDescription,
    deliverables: draft.deliverables,
    budgetCents: draft.budgetCents,
    currency: draft.currency.toUpperCase(),
    deadline: draft.deadlineIso,
    criteria,
    evidenceRequirements: draft.evidenceRequirements,
    paymentRules: { authorizationIntent: "AUTHORIZE", captureCondition: draft.captureCondition, requiresHumanApprovalForCapture: policy.requireHumanApprovalForCapture },
    approvalRequirements: draft.approvalRequirements,
    disputeProcedure: draft.disputeProcedure,
  });
  return normaliseContractContent(content);
}

function safeParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

export async function generateContractFromObjective(input: { contractId: string; objective: string; budgetCents: number; currency: string; category: "LANDING_PAGE" | "JSON_DATASET"; policy: { requireHumanApprovalForCapture: boolean } }): Promise<{ content: ContractContent; runId: string }> {
  if (!geminiConfigured()) throw new HttpError(503, "Gemini is not configured. Set GEMINI_API_KEY to generate contracts.", "gemini_not_configured");
  const generator = await platformAgent("BUYER");
  const model = env().GEMINI_MODEL_CONTRACTS;
  const handle = await startRun({ agentId: generator.id, contractId: input.contractId, purpose: "CONTRACT_GENERATION", model });
  try {
    const prompt = [
      `Objective from the business owner:`,
      input.objective,
      ``,
      `Task category: ${input.category}`,
      `Budget: ${input.budgetCents} cents ${input.currency}`,
      `Today: ${new Date().toISOString().slice(0, 10)}`,
      `Prompt version: ${PROMPT_VERSION}`,
      ``,
      `Return the structured contract draft.`,
    ].join("\n");
    const { value, usage, raw } = await generateStructured({
      model,
      systemInstruction: CONTRACT_GENERATOR_INSTRUCTIONS,
      contents: [userText(prompt)],
      schema: draftSchema,
      jsonSchema: draftJsonSchema,
      timeoutMs: 90_000,
    });
    handle.usage = usage;
    const content = draftToContent({ ...value, budgetCents: input.budgetCents, currency: input.currency, category: input.category }, input.policy);
    await recordMessage(handle, { kind: "NOTE", content: `Generated contract draft "${content.title}" with ${content.criteria.length} criteria (${content.criteria.filter((c) => c.kind === "OBJECTIVE").length} objective).`, structured: { raw: raw.slice(0, 20000) } });
    await finishRun(handle, { status: "SUCCEEDED", summary: `Drafted ${content.criteria.length} criteria.`, iterations: 1 });
    return { content, runId: handle.run.id };
  } catch (error) {
    await finishRun(handle, { status: "FAILED", error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

export async function contractGenerationAvailable(): Promise<boolean> {
  if (!geminiConfigured()) return false;
  const buyer = await db.agent.findFirst({ where: { role: "BUYER", isPlatformAgent: true } });
  return Boolean(buyer);
}
