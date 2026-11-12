import type { VerificationMethod } from "@/generated/prisma/client";
import type { CheckFunction } from "@/lib/verification/types";
import { httpAvailability, requiredSections, navigationLinks, responsiveViewports, contactFormSubmission, consoleErrors, brokenLinks, htmlValidity } from "@/lib/verification/checks/site";
import { lighthouseMobilePerformance, accessibilityAudit } from "@/lib/verification/checks/lighthouse";
import { jsonSchema, datasetRowCount, datasetUniqueness } from "@/lib/verification/checks/dataset";

/**
 * The only mapping from an approved verification method to executable code.
 * RUBRIC_REVIEW is handled by the verifier agent's rubric scoring, never by
 * this table, so a subjective criterion can never be "passed" by a tool.
 */
export const CHECKS: Record<Exclude<VerificationMethod, "RUBRIC_REVIEW">, CheckFunction> = {
  HTTP_AVAILABILITY: httpAvailability,
  REQUIRED_SECTIONS: requiredSections,
  NAVIGATION_LINKS: navigationLinks,
  RESPONSIVE_VIEWPORTS: responsiveViewports,
  CONTACT_FORM_SUBMISSION: contactFormSubmission,
  ACCESSIBILITY_AUDIT: accessibilityAudit,
  LIGHTHOUSE_MOBILE_PERFORMANCE: lighthouseMobilePerformance,
  CONSOLE_ERRORS: consoleErrors,
  BROKEN_LINKS: brokenLinks,
  HTML_VALIDITY: htmlValidity,
  JSON_SCHEMA: jsonSchema,
  DATASET_ROW_COUNT: datasetRowCount,
  DATASET_UNIQUENESS: datasetUniqueness,
};

export { METHOD_LABELS, METHOD_TIMEOUT_MS } from "@/lib/verification/methods";
