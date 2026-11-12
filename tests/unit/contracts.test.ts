import { describe, it, expect } from "vitest";
import { canonicalize, hashCanonical } from "@/lib/contracts/canonical";
import { contractContentSchema, normaliseContractContent } from "@/lib/contracts/schema";
import { draftToContent } from "@/lib/agents/contract-generator";

describe("canonical serialisation", () => {
  it("is independent of key order and undefined values", () => {
    const a = { b: 1, a: [3, { z: 1, y: 2 }], c: undefined };
    const b = { a: [3, { y: 2, z: 1 }], b: 1 };
    expect(canonicalize(a)).toBe(canonicalize(b));
    expect(hashCanonical(a)).toBe(hashCanonical(b));
  });

  it("changes the hash when content changes", () => {
    expect(hashCanonical({ a: 1 })).not.toBe(hashCanonical({ a: 2 }));
  });

  it("rejects non-finite numbers", () => {
    expect(() => canonicalize({ a: Number.NaN })).toThrow();
  });
});

const validContent = {
  title: "Harbor Analytics landing page",
  category: "LANDING_PAGE" as const,
  taskDescription: "Build a responsive landing page with hero, features, pricing, and a working contact form.",
  deliverables: ["index.html", "styles.css"],
  budgetCents: 6000,
  currency: "USD",
  deadline: null,
  criteria: [
    { key: "available", description: "The page responds with HTTP 200.", kind: "OBJECTIVE" as const, method: "HTTP_AVAILABILITY" as const, parameters: {}, required: true },
    { key: "sections", description: "Hero, features, pricing, and contact sections exist.", kind: "OBJECTIVE" as const, method: "REQUIRED_SECTIONS" as const, parameters: { sections: ["hero", "features", "pricing", "contact"] }, required: true },
    { key: "design", description: "The design feels premium.", kind: "SUBJECTIVE" as const, method: "RUBRIC_REVIEW" as const, parameters: { rubric: ["Consistent spacing", "Clear hierarchy"], minScore: 7 }, required: false },
  ],
  evidenceRequirements: ["Screenshots at three viewports"],
  paymentRules: { authorizationIntent: "AUTHORIZE" as const, captureCondition: "All required objective criteria pass verification.", requiresHumanApprovalForCapture: false },
  approvalRequirements: [],
  disputeProcedure: "The owner may reject within 7 days with evidence; the authorization is voided if unresolved.",
};

describe("contract content schema", () => {
  it("accepts a valid contract and fills parameter defaults", () => {
    const parsed = normaliseContractContent(contractContentSchema.parse(validContent));
    expect(parsed.criteria[0].parameters).toEqual({ expectedStatus: 200 });
  });

  it("rejects a subjective criterion with a programmatic method", () => {
    const bad = { ...validContent, criteria: [{ ...validContent.criteria[0], kind: "SUBJECTIVE" as const }] };
    expect(() => contractContentSchema.parse(bad)).toThrow();
  });

  it("rejects an objective criterion that uses rubric review", () => {
    const bad = { ...validContent, criteria: [{ ...validContent.criteria[2], kind: "OBJECTIVE" as const }] };
    expect(() => contractContentSchema.parse(bad)).toThrow();
  });

  it("rejects contracts with no objective criterion", () => {
    const bad = { ...validContent, criteria: [validContent.criteria[2]] };
    expect(() => contractContentSchema.parse(bad)).toThrow();
  });

  it("rejects duplicate keys", () => {
    const bad = { ...validContent, criteria: [validContent.criteria[0], validContent.criteria[0]] };
    expect(() => contractContentSchema.parse(bad)).toThrow();
  });

  it("rejects methods that do not apply to the category", () => {
    const bad = { ...validContent, criteria: [{ ...validContent.criteria[0], method: "JSON_SCHEMA" as const }] };
    expect(() => contractContentSchema.parse(bad)).toThrow();
  });
});

describe("draft mapping", () => {
  it("maps a model draft onto validated content", () => {
    const content = draftToContent(
      {
        title: "Harbor landing page",
        category: "LANDING_PAGE",
        taskDescription: "Build a responsive landing page with a hero, features, pricing, and a working contact form.",
        deliverables: ["index.html"],
        budgetCents: 6000,
        currency: "usd",
        deadlineIso: null,
        criteria: [
          { key: "Lighthouse-Perf", description: "Mobile Lighthouse performance of at least 90.", kind: "OBJECTIVE", method: "LIGHTHOUSE_MOBILE_PERFORMANCE", required: true, minScore: 90 },
          { key: "sections", description: "All four sections are present.", kind: "OBJECTIVE", method: "REQUIRED_SECTIONS", required: true, sections: ["hero", "features"] },
        ],
        evidenceRequirements: ["Lighthouse report"],
        captureCondition: "All required criteria pass.",
        approvalRequirements: [],
        disputeProcedure: "Owner may dispute within seven days with evidence.",
      },
      { requireHumanApprovalForCapture: true },
    );
    expect(content.currency).toBe("USD");
    expect(content.criteria[0].key).toBe("lighthouse_perf");
    expect(content.criteria[0].parameters).toEqual({ minScore: 90 });
    expect(content.paymentRules.requiresHumanApprovalForCapture).toBe(true);
  });
});
