import path from "node:path";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { storage, contentTypeFor } from "@/lib/storage";
import { hashBytes, hashCanonical } from "@/lib/contracts/canonical";
import { generateToken } from "@/lib/security/tokens";
import type { DeliverableFile } from "@/lib/verification/types";
import type { DeliverableKind, Prisma } from "@/generated/prisma/client";

/**
 * Deliverable artifacts are static files written by the worker agent. They are
 * stored under an isolated prefix, hashed individually and as a set, and
 * served only through the sandboxed preview route. Nothing in a deliverable
 * is ever executed on the server.
 */

const ALLOWED_EXTENSIONS = new Set([".html", ".css", ".js", ".json", ".svg", ".png", ".jpg", ".jpeg", ".webp", ".ico", ".txt", ".woff2"]);
const MAX_FILES = 40;
const MAX_FILE_BYTES = 1_500_000;
const MAX_TOTAL_BYTES = 6_000_000;

export class DeliverableValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeliverableValidationError";
  }
}

export interface ArtifactInput {
  path: string;
  content: string | Buffer;
}

export function validateArtifactFiles(files: ArtifactInput[], kind: DeliverableKind): void {
  if (files.length === 0) throw new DeliverableValidationError("Deliverable has no files.");
  if (files.length > MAX_FILES) throw new DeliverableValidationError(`Deliverable has more than ${MAX_FILES} files.`);
  let total = 0;
  const seen = new Set<string>();
  for (const file of files) {
    const p = file.path.replace(/\\/g, "/");
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_\-./]{0,120}$/.test(p) || p.includes("..") || p.startsWith("/") || p.includes("//")) {
      throw new DeliverableValidationError(`Unsafe file path: ${file.path}`);
    }
    if (!ALLOWED_EXTENSIONS.has(path.extname(p).toLowerCase())) throw new DeliverableValidationError(`File type not allowed: ${p}`);
    if (seen.has(p)) throw new DeliverableValidationError(`Duplicate file: ${p}`);
    seen.add(p);
    const size = Buffer.byteLength(file.content);
    if (size > MAX_FILE_BYTES) throw new DeliverableValidationError(`${p} exceeds ${MAX_FILE_BYTES} bytes.`);
    total += size;
  }
  if (total > MAX_TOTAL_BYTES) throw new DeliverableValidationError("Deliverable exceeds the total size limit.");
  if (kind === "STATIC_SITE" && !seen.has("index.html")) throw new DeliverableValidationError("A static site deliverable needs index.html.");
  if (kind === "JSON_DATASET" && !seen.has("dataset.json")) throw new DeliverableValidationError("A dataset deliverable needs dataset.json.");
}

export async function storeDeliverable(input: { contractId: string; workerAgentId: string; runId: string | null; kind: DeliverableKind; files: ArtifactInput[]; workerNotes?: string }) {
  validateArtifactFiles(input.files, input.kind);
  const last = await db.deliverable.findFirst({ where: { contractId: input.contractId }, orderBy: { submissionNumber: "desc" } });
  const submissionNumber = (last?.submissionNumber ?? 0) + 1;
  const previewToken = generateToken(18);
  const prefix = `deliverables/${input.contractId}/${submissionNumber}`;
  const store = storage();
  const manifestFiles: { path: string; bytes: number; hash: string; contentType: string }[] = [];
  for (const file of input.files) {
    const bytes = Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content, "utf8");
    const contentType = contentTypeFor(file.path);
    await store.put(`${prefix}/${file.path}`, bytes, contentType);
    manifestFiles.push({ path: file.path, bytes: bytes.length, hash: hashBytes(bytes), contentType });
  }
  manifestFiles.sort((a, b) => a.path.localeCompare(b.path));
  const rootHash = hashCanonical(manifestFiles.map((f) => ({ path: f.path, hash: f.hash })));
  return db.deliverable.create({
    data: {
      contractId: input.contractId,
      workerAgentId: input.workerAgentId,
      runId: input.runId,
      submissionNumber,
      kind: input.kind,
      storagePrefix: prefix,
      manifest: { files: manifestFiles, kind: input.kind } as unknown as Prisma.InputJsonValue,
      rootHash,
      previewToken,
      workerNotes: input.workerNotes,
    },
  });
}

export async function loadDeliverableFiles(deliverableId: string): Promise<DeliverableFile[]> {
  const deliverable = await db.deliverable.findUniqueOrThrow({ where: { id: deliverableId } });
  const manifest = deliverable.manifest as { files: { path: string; hash: string; contentType: string }[] };
  const store = storage();
  const files: DeliverableFile[] = [];
  for (const entry of manifest.files) {
    const obj = await store.get(`${deliverable.storagePrefix}/${entry.path}`);
    if (!obj) throw new Error(`Deliverable file missing from storage: ${entry.path}`);
    const hash = hashBytes(obj.body);
    if (hash !== entry.hash) throw new Error(`Deliverable file ${entry.path} does not match its recorded hash.`);
    files.push({ path: entry.path, bytes: obj.body, contentType: entry.contentType, hash });
  }
  return files;
}

export function previewUrlFor(previewToken: string, filePath = "index.html"): string {
  return `${env().APP_URL}/preview/${previewToken}/${filePath}`;
}

export function formCaptureUrlFor(previewToken: string): string {
  return `${env().APP_URL}/api/form-capture/${previewToken}`;
}
