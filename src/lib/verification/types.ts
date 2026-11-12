import type { Browser, BrowserContext } from "playwright";
import type { EvidenceKind, VerificationMethod } from "@/generated/prisma/client";

export interface DeliverableFile {
  path: string;
  bytes: Buffer;
  contentType: string;
  hash: string;
}

export interface EvidenceDraft {
  kind: EvidenceKind;
  label: string;
  mimeType: string;
  bytes: Buffer;
  metadata?: Record<string, unknown>;
}

export interface CheckResult {
  passed: boolean | null;
  score?: number | null;
  details: Record<string, unknown>;
  evidence: EvidenceDraft[];
}

export interface CheckContext {
  contractId: string;
  deliverableId: string;
  verificationRunId: string;
  method: VerificationMethod;
  criterionKey: string;
  parameters: Record<string, unknown>;
  /** Absolute URL of the deliverable's entry point as served by the preview route. */
  previewUrl: string;
  previewOrigin: string;
  files: DeliverableFile[];
  formCaptureToken: string;
  browser: Browser | null;
  newContext: (options?: { viewport?: { width: number; height: number }; isMobile?: boolean }) => Promise<BrowserContext>;
  log: (message: string, meta?: Record<string, unknown>) => void;
  lighthouseEnabled: boolean;
  chromiumPath: string | null;
}

export type CheckFunction = (ctx: CheckContext) => Promise<CheckResult>;

export function jsonEvidence(kind: EvidenceKind, label: string, value: unknown, metadata?: Record<string, unknown>): EvidenceDraft {
  return { kind, label, mimeType: "application/json", bytes: Buffer.from(JSON.stringify(value, null, 2)), metadata };
}

export function fileByPath(files: DeliverableFile[], path: string): DeliverableFile | undefined {
  const normalised = path.replace(/^\.?\//, "");
  return files.find((f) => f.path === normalised);
}
