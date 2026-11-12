import Ajv from "ajv";
import addFormats from "ajv-formats";
import type { CheckContext, CheckResult } from "@/lib/verification/types";
import { jsonEvidence, fileByPath } from "@/lib/verification/types";

function loadDataset(ctx: CheckContext): { rows: unknown[] } | { error: string } {
  const file = fileByPath(ctx.files, "dataset.json");
  if (!file) return { error: "dataset.json not found in deliverable." };
  try {
    const parsed = JSON.parse(file.bytes.toString("utf8"));
    if (!Array.isArray(parsed)) return { error: "dataset.json must contain a JSON array." };
    return { rows: parsed };
  } catch (error) {
    return { error: `dataset.json is not valid JSON: ${error instanceof Error ? error.message : String(error)}` };
  }
}

export async function jsonSchema(ctx: CheckContext): Promise<CheckResult> {
  const data = loadDataset(ctx);
  if ("error" in data) return { passed: false, details: { reason: data.error }, evidence: [jsonEvidence("TEST_OUTPUT", "JSON Schema validation", { error: data.error })] };
  const schema = ctx.parameters.schema as Record<string, unknown> | undefined;
  if (!schema) return { passed: null, details: { reason: "No schema in criterion parameters." }, evidence: [] };
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  let validate;
  try {
    validate = ajv.compile(schema);
  } catch (error) {
    return { passed: null, details: { reason: `Schema could not be compiled: ${error instanceof Error ? error.message : String(error)}` }, evidence: [] };
  }
  const failures: { row: number; errors: string[] }[] = [];
  data.rows.forEach((row, index) => {
    if (!validate(row)) failures.push({ row: index, errors: (validate.errors ?? []).map((e) => `${e.instancePath || "/"} ${e.message ?? ""}`.trim()).slice(0, 5) });
  });
  return {
    passed: failures.length === 0,
    details: { rows: data.rows.length, invalidRows: failures.length, examples: failures.slice(0, 10) },
    evidence: [jsonEvidence("TEST_OUTPUT", "JSON Schema validation", { rows: data.rows.length, failures: failures.slice(0, 100) })],
  };
}

export async function datasetRowCount(ctx: CheckContext): Promise<CheckResult> {
  const data = loadDataset(ctx);
  if ("error" in data) return { passed: false, details: { reason: data.error }, evidence: [] };
  const min = Number(ctx.parameters.min ?? 1);
  const max = ctx.parameters.max === undefined ? null : Number(ctx.parameters.max);
  const count = data.rows.length;
  const passed = count >= min && (max === null || count <= max);
  return { passed, details: { count, min, max }, evidence: [jsonEvidence("TEST_OUTPUT", "Row count", { count, min, max })] };
}

export async function datasetUniqueness(ctx: CheckContext): Promise<CheckResult> {
  const data = loadDataset(ctx);
  if ("error" in data) return { passed: false, details: { reason: data.error }, evidence: [] };
  const field = String(ctx.parameters.field ?? "id");
  const seen = new Map<string, number>();
  const duplicates: string[] = [];
  let missing = 0;
  for (const row of data.rows) {
    const value = (row as Record<string, unknown>)?.[field];
    if (value === undefined || value === null) {
      missing += 1;
      continue;
    }
    const key = JSON.stringify(value);
    seen.set(key, (seen.get(key) ?? 0) + 1);
    if (seen.get(key) === 2) duplicates.push(key);
  }
  return { passed: duplicates.length === 0 && missing === 0, details: { field, rows: data.rows.length, duplicates: duplicates.slice(0, 20), missing }, evidence: [jsonEvidence("TEST_OUTPUT", "Uniqueness", { field, duplicates, missing })] };
}
