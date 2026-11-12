import { z } from "zod";

/**
 * Structured contract content. This is what the business owner approves and
 * what gets hashed. Objective criteria map to programmatic verification
 * methods; subjective criteria carry a rubric for AI-assisted review that the
 * policy engine routes to a human when configured.
 */

export const taskCategorySchema = z.enum(["LANDING_PAGE", "JSON_DATASET"]);
export type TaskCategoryValue = z.infer<typeof taskCategorySchema>;

export const objectiveMethodSchema = z.enum([
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
]);

export const criterionSchema = z.object({
  key: z.string().regex(/^[a-z0-9_]{3,48}$/, "Use lowercase letters, numbers, and underscores."),
  description: z.string().min(8).max(400),
  kind: z.enum(["OBJECTIVE", "SUBJECTIVE"]),
  method: z.union([objectiveMethodSchema, z.literal("RUBRIC_REVIEW")]),
  parameters: z.record(z.string(), z.unknown()).default({}),
  required: z.boolean().default(true),
});
export type CriterionContent = z.infer<typeof criterionSchema>;

export const contractContentSchema = z
  .object({
    title: z.string().min(4).max(120),
    category: taskCategorySchema,
    taskDescription: z.string().min(20).max(4000),
    deliverables: z.array(z.string().min(3).max(300)).min(1).max(20),
    budgetCents: z.number().int().positive(),
    currency: z.string().length(3),
    deadline: z.string().datetime().nullable(),
    criteria: z.array(criterionSchema).min(1).max(30),
    evidenceRequirements: z.array(z.string().min(3).max(300)).min(1).max(20),
    paymentRules: z.object({
      authorizationIntent: z.literal("AUTHORIZE"),
      captureCondition: z.string().min(10).max(600),
      requiresHumanApprovalForCapture: z.boolean(),
    }),
    approvalRequirements: z.array(z.string().min(3).max(300)).max(20),
    disputeProcedure: z.string().min(10).max(1200),
  })
  .superRefine((value, ctx) => {
    const keys = new Set<string>();
    value.criteria.forEach((c, index) => {
      if (keys.has(c.key)) ctx.addIssue({ code: "custom", path: ["criteria", index, "key"], message: `Duplicate criterion key ${c.key}.` });
      keys.add(c.key);
      if (c.kind === "OBJECTIVE" && c.method === "RUBRIC_REVIEW") {
        ctx.addIssue({ code: "custom", path: ["criteria", index, "method"], message: "Objective criteria need a programmatic method." });
      }
      if (c.kind === "SUBJECTIVE" && c.method !== "RUBRIC_REVIEW") {
        ctx.addIssue({ code: "custom", path: ["criteria", index, "method"], message: "Subjective criteria use RUBRIC_REVIEW." });
      }
    });
    if (!value.criteria.some((c) => c.kind === "OBJECTIVE")) {
      ctx.addIssue({ code: "custom", path: ["criteria"], message: "At least one objective criterion is required." });
    }
    const methodsForCategory: Record<TaskCategoryValue, string[]> = {
      LANDING_PAGE: [
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
        "RUBRIC_REVIEW",
      ],
      JSON_DATASET: ["JSON_SCHEMA", "DATASET_ROW_COUNT", "DATASET_UNIQUENESS", "RUBRIC_REVIEW"],
    };
    value.criteria.forEach((c, index) => {
      if (!methodsForCategory[value.category].includes(c.method)) {
        ctx.addIssue({ code: "custom", path: ["criteria", index, "method"], message: `${c.method} does not apply to ${value.category}.` });
      }
    });
  });

export type ContractContent = z.infer<typeof contractContentSchema>;

/** Parameter schemas per verification method, used to validate AI output and user edits. */
export const methodParameterSchemas = {
  HTTP_AVAILABILITY: z.object({ expectedStatus: z.number().int().default(200) }),
  REQUIRED_SECTIONS: z.object({ sections: z.array(z.string().min(2)).min(1) }),
  NAVIGATION_LINKS: z.object({ minLinks: z.number().int().min(1).default(3) }),
  RESPONSIVE_VIEWPORTS: z.object({ widths: z.array(z.number().int().min(280).max(2560)).min(1).default([375, 768, 1280]) }),
  CONTACT_FORM_SUBMISSION: z.object({ requiredFields: z.array(z.string()).default(["name", "email", "message"]) }),
  ACCESSIBILITY_AUDIT: z.object({ minScore: z.number().min(0).max(100).default(90) }),
  LIGHTHOUSE_MOBILE_PERFORMANCE: z.object({ minScore: z.number().min(0).max(100).default(90) }),
  CONSOLE_ERRORS: z.object({ maxErrors: z.number().int().min(0).default(0) }),
  BROKEN_LINKS: z.object({ maxBroken: z.number().int().min(0).default(0) }),
  HTML_VALIDITY: z.object({}),
  JSON_SCHEMA: z.object({ schema: z.record(z.string(), z.unknown()) }),
  DATASET_ROW_COUNT: z.object({ min: z.number().int().min(1), max: z.number().int().min(1).optional() }),
  DATASET_UNIQUENESS: z.object({ field: z.string().min(1) }),
  RUBRIC_REVIEW: z.object({ rubric: z.array(z.string().min(3)).min(1), minScore: z.number().min(0).max(10).default(7) }),
} as const;

export function validateCriterionParameters(criterion: CriterionContent): CriterionContent {
  const schema = methodParameterSchemas[criterion.method as keyof typeof methodParameterSchemas];
  const parameters = schema.parse(criterion.parameters ?? {});
  return { ...criterion, parameters };
}

export function normaliseContractContent(content: ContractContent): ContractContent {
  return { ...content, criteria: content.criteria.map(validateCriterionParameters) };
}
