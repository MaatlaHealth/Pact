import { GoogleGenAI, type Content, type FunctionDeclaration, type GenerateContentResponse, type Part } from "@google/genai";
import type { ZodType } from "zod";
import { z } from "zod";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * Gemini access for the agent layer. Every call has a timeout, bounded
 * retries, schema validation of the model's JSON, and token accounting that
 * the caller persists on the agent run.
 */

export class GeminiNotConfiguredError extends Error {
  constructor() {
    super("Gemini is not configured. Set GEMINI_API_KEY.");
    this.name = "GeminiNotConfiguredError";
  }
}

export class GeminiResponseError extends Error {
  constructor(message: string, public readonly raw?: string) {
    super(message);
    this.name = "GeminiResponseError";
  }
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface GenerateOptions {
  model: string;
  systemInstruction: string;
  contents: Content[];
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
  retries?: number;
  tools?: FunctionDeclaration[];
  /** When set, forces JSON output matching the schema. */
  responseJsonSchema?: Record<string, unknown>;
  abortSignal?: AbortSignal;
}

export interface GenerateResult {
  text: string | null;
  functionCalls: { id?: string; name: string; args: Record<string, unknown> }[];
  usage: TokenUsage;
  modelContent: Content | null;
  finishReason?: string;
}

let client: GoogleGenAI | undefined;

export function geminiConfigured(): boolean {
  try {
    return Boolean(env().GEMINI_API_KEY);
  } catch {
    return false;
  }
}

function getClient(): GoogleGenAI {
  const key = env().GEMINI_API_KEY;
  if (!key) throw new GeminiNotConfiguredError();
  client ??= new GoogleGenAI({ apiKey: key });
  return client;
}

function usageFrom(response: GenerateContentResponse): TokenUsage {
  return {
    inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: (response.usageMetadata?.candidatesTokenCount ?? 0) + (response.usageMetadata?.thoughtsTokenCount ?? 0),
  };
}

export async function generate(options: GenerateOptions): Promise<GenerateResult> {
  const ai = getClient();
  const retries = options.retries ?? 2;
  let lastError: unknown;
  for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
    try {
      const response = await ai.models.generateContent({
        model: options.model,
        contents: options.contents,
        config: {
          systemInstruction: options.systemInstruction,
          temperature: options.temperature ?? 0.3,
          maxOutputTokens: options.maxOutputTokens ?? 8192,
          abortSignal: options.abortSignal,
          httpOptions: { timeout: options.timeoutMs ?? 90_000 },
          ...(options.tools?.length ? { tools: [{ functionDeclarations: options.tools }] } : {}),
          ...(options.responseJsonSchema ? { responseMimeType: "application/json", responseJsonSchema: options.responseJsonSchema } : {}),
        },
      });
      const candidate = response.candidates?.[0];
      const parts: Part[] = candidate?.content?.parts ?? [];
      const functionCalls = parts
        .filter((p) => p.functionCall)
        .map((p) => ({ id: p.functionCall!.id, name: p.functionCall!.name ?? "", args: (p.functionCall!.args ?? {}) as Record<string, unknown> }));
      const text = parts.filter((p) => typeof p.text === "string" && !p.thought).map((p) => p.text).join("") || null;
      return {
        text,
        functionCalls,
        usage: usageFrom(response),
        modelContent: candidate?.content ?? null,
        finishReason: candidate?.finishReason ? String(candidate.finishReason) : undefined,
      };
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const retryable = /429|500|502|503|504|timeout|ECONNRESET|fetch failed|overloaded|UNAVAILABLE|RESOURCE_EXHAUSTED/i.test(message);
      logger.warn("Gemini call failed", { model: options.model, attempt, retryable, error: message });
      if (!retryable || attempt > retries) break;
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Gemini call failed.");
}

/**
 * Requests JSON matching a Zod schema and validates it. One repair attempt is
 * made if the model returns invalid JSON or a schema violation.
 */
export async function generateStructured<T>(options: Omit<GenerateOptions, "responseJsonSchema"> & { schema: ZodType<T>; jsonSchema: Record<string, unknown> }): Promise<{ value: T; usage: TokenUsage; raw: string }> {
  let usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
  let contents = options.contents;
  let lastRaw = "";
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const result = await generate({ ...options, contents, responseJsonSchema: options.jsonSchema, temperature: options.temperature ?? 0.2 });
    usage = { inputTokens: usage.inputTokens + result.usage.inputTokens, outputTokens: usage.outputTokens + result.usage.outputTokens };
    lastRaw = result.text ?? "";
    const parsed = parseJsonLoose(lastRaw);
    if (parsed.ok) {
      const validated = options.schema.safeParse(parsed.value);
      if (validated.success) return { value: validated.data, usage, raw: lastRaw };
      const issues = validated.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      if (attempt === 2) throw new GeminiResponseError(`Model output failed schema validation: ${issues}`, lastRaw);
      contents = [
        ...contents,
        { role: "model", parts: [{ text: lastRaw }] },
        { role: "user", parts: [{ text: `Your previous JSON failed validation: ${issues}. Return corrected JSON only.` }] },
      ];
    } else {
      if (attempt === 2) throw new GeminiResponseError("Model output was not valid JSON.", lastRaw);
      contents = [
        ...contents,
        { role: "model", parts: [{ text: lastRaw }] },
        { role: "user", parts: [{ text: "Your previous reply was not valid JSON. Return the JSON object only." }] },
      ];
    }
  }
  throw new GeminiResponseError("Model output could not be validated.", lastRaw);
}

export function parseJsonLoose(text: string): { ok: true; value: unknown } | { ok: false } {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return { ok: true, value: JSON.parse(trimmed) };
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return { ok: true, value: JSON.parse(trimmed.slice(start, end + 1)) };
      } catch {
        return { ok: false };
      }
    }
    return { ok: false };
  }
}

export function userText(text: string): Content {
  return { role: "user", parts: [{ text }] };
}

export function functionResponseContent(responses: { id?: string; name: string; response: Record<string, unknown> }[]): Content {
  return { role: "user", parts: responses.map((r) => ({ functionResponse: { id: r.id, name: r.name, response: r.response } })) };
}

export const tokenUsageSchema = z.object({ inputTokens: z.number(), outputTokens: z.number() });
