import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import type { PayPalErrorBody } from "@/lib/paypal/types";

export class PayPalNotConfiguredError extends Error {
  constructor() {
    super("PayPal is not configured. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET.");
    this.name = "PayPalNotConfiguredError";
  }
}

export class PayPalApiError extends Error {
  status: number;
  paypalName?: string;
  debugId?: string;
  issues: string[];
  body?: PayPalErrorBody;
  constructor(status: number, body: PayPalErrorBody | undefined, fallback: string) {
    const issues = (body?.details ?? []).map((d) => [d.issue, d.description].filter(Boolean).join(": "));
    super(body?.message ? `${body.name ?? "PAYPAL_ERROR"}: ${body.message}${issues.length ? ` (${issues.join("; ")})` : ""}` : fallback);
    this.name = "PayPalApiError";
    this.status = status;
    this.paypalName = body?.name;
    this.debugId = body?.debug_id;
    this.issues = issues;
    this.body = body;
  }
  hasIssue(issue: string): boolean {
    return (this.body?.details ?? []).some((d) => d.issue === issue);
  }
}

/** Thrown when a request may have reached PayPal but no response was read. */
export class PayPalUncertainError extends Error {
  requestId: string;
  cause: unknown;
  constructor(requestId: string, cause: unknown) {
    super(`PayPal request ${requestId} did not complete; outcome unknown.`);
    this.name = "PayPalUncertainError";
    this.requestId = requestId;
    this.cause = cause;
  }
}

export interface PayPalClientOptions {
  clientId?: string;
  clientSecret?: string;
  environment?: "sandbox" | "live";
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

interface TokenCache {
  accessToken: string;
  expiresAt: number;
}

export interface PayPalRequestOptions {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  body?: unknown;
  requestId?: string;
  /** Retries for 5xx and network errors. Safe only with a requestId (idempotent). */
  retries?: number;
  preferRepresentation?: boolean;
}

export class PayPalClient {
  readonly baseUrl: string;
  readonly environment: "sandbox" | "live";
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private token?: TokenCache;

  constructor(options: PayPalClientOptions = {}) {
    const e = safeEnv();
    const clientId = options.clientId ?? e?.PAYPAL_CLIENT_ID;
    const clientSecret = options.clientSecret ?? e?.PAYPAL_CLIENT_SECRET;
    if (!clientId || !clientSecret) throw new PayPalNotConfiguredError();
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.environment = options.environment ?? e?.PAYPAL_ENVIRONMENT ?? "sandbox";
    this.baseUrl = this.environment === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 30000;
  }

  async getAccessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.accessToken;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/v1/oauth2/token`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
        signal: controller.signal,
      });
      const body = (await response.json().catch(() => undefined)) as { access_token?: string; expires_in?: number; error_description?: string } | undefined;
      if (!response.ok || !body?.access_token) {
        throw new PayPalApiError(response.status, { name: "OAUTH_FAILED", message: body?.error_description ?? "Could not obtain PayPal access token." }, "PayPal OAuth failed.");
      }
      this.token = { accessToken: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 };
      return this.token.accessToken;
    } finally {
      clearTimeout(timer);
    }
  }

  async request<T>(options: PayPalRequestOptions): Promise<{ status: number; data: T; headers: Headers }> {
    const retries = options.requestId ? (options.retries ?? 2) : 0;
    let attempt = 0;
    let lastError: unknown;
    while (attempt <= retries) {
      attempt += 1;
      const token = await this.getAccessToken();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      };
      if (options.requestId) headers["PayPal-Request-Id"] = options.requestId;
      if (options.preferRepresentation) headers.Prefer = "return=representation";
      let response: Response;
      try {
        response = await this.fetchImpl(`${this.baseUrl}${options.path}`, {
          method: options.method,
          headers,
          body: options.body === undefined ? undefined : JSON.stringify(options.body),
          signal: controller.signal,
        });
      } catch (error) {
        clearTimeout(timer);
        lastError = error;
        logger.warn("PayPal network error", { path: options.path, attempt, error: String(error) });
        if (attempt <= retries) {
          await sleep(300 * attempt);
          continue;
        }
        if (options.method !== "GET") throw new PayPalUncertainError(options.requestId ?? "none", error);
        throw error;
      }
      clearTimeout(timer);
      const text = await response.text();
      const data = text ? safeJson(text) : undefined;
      if (response.ok) {
        return { status: response.status, data: data as T, headers: response.headers };
      }
      if (response.status === 401 && attempt <= retries) {
        this.token = undefined;
        continue;
      }
      if (response.status >= 500 && attempt <= retries) {
        lastError = new PayPalApiError(response.status, data as PayPalErrorBody, `PayPal returned ${response.status}.`);
        await sleep(300 * attempt);
        continue;
      }
      throw new PayPalApiError(response.status, data as PayPalErrorBody | undefined, `PayPal returned ${response.status}.`);
    }
    throw lastError instanceof Error ? lastError : new Error("PayPal request failed.");
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeEnv() {
  try {
    return env();
  } catch {
    return undefined;
  }
}

let shared: PayPalClient | undefined;

export function paypalClient(): PayPalClient {
  shared ??= new PayPalClient();
  return shared;
}

export function paypalConfigured(): boolean {
  const e = safeEnv();
  return Boolean(e?.PAYPAL_CLIENT_ID && e?.PAYPAL_CLIENT_SECRET);
}
