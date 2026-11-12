import type { VerificationMethod } from "@/generated/prisma/client";

/** Display names and timeouts per verification method. Safe to import from client components. */
export const METHOD_LABELS: Record<VerificationMethod, string> = {
  HTTP_AVAILABILITY: "Page availability",
  REQUIRED_SECTIONS: "Required sections",
  NAVIGATION_LINKS: "Navigation",
  RESPONSIVE_VIEWPORTS: "Responsive layout",
  CONTACT_FORM_SUBMISSION: "Contact form submission",
  ACCESSIBILITY_AUDIT: "Accessibility",
  LIGHTHOUSE_MOBILE_PERFORMANCE: "Lighthouse mobile performance",
  CONSOLE_ERRORS: "Console errors",
  BROKEN_LINKS: "Broken links",
  HTML_VALIDITY: "HTML validity",
  JSON_SCHEMA: "JSON Schema",
  DATASET_ROW_COUNT: "Row count",
  DATASET_UNIQUENESS: "Uniqueness",
  RUBRIC_REVIEW: "Rubric review",
};

export const METHOD_TIMEOUT_MS: Partial<Record<VerificationMethod, number>> = {
  LIGHTHOUSE_MOBILE_PERFORMANCE: 180_000,
  ACCESSIBILITY_AUDIT: 180_000,
  BROKEN_LINKS: 120_000,
};
