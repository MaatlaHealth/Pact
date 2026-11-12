import { createHash } from "node:crypto";

/**
 * Canonical JSON serialisation (RFC 8785 style ordering): object keys sorted,
 * no whitespace, undefined values dropped. The same logical document always
 * produces the same bytes, so hashes and signatures are reproducible.
 */
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isFinite(value)) throw new Error("Non-finite numbers cannot be canonicalised.");
    return value;
  }
  if (Array.isArray(value)) return value.map(sortValue);
  if (value instanceof Date) return value.toISOString();
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const out: Record<string, unknown> = {};
  for (const [k, v] of entries) out[k] = sortValue(v);
  return out;
}

export function hashCanonical(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalize(value)).digest("hex")}`;
}

export function hashBytes(bytes: Buffer | Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}
