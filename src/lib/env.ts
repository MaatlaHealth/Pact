import { z } from "zod";

/**
 * Environment access for the server. Every integration reports whether it is
 * configured so the UI can show an honest configuration state instead of
 * pretending a feature works.
 */

const optional = z.string().trim().optional().transform((v) => (v ? v : undefined));

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  APP_SECRET: z.string().min(32, "APP_SECRET must be at least 32 characters"),
  PACT_DEPLOYMENT_LABEL: optional,
  DATABASE_URL: z.string().min(1),

  PAYPAL_ENVIRONMENT: z.enum(["sandbox", "live"]).default("sandbox"),
  PAYPAL_CLIENT_ID: optional,
  PAYPAL_CLIENT_SECRET: optional,
  PAYPAL_WEBHOOK_ID: optional,
  PAYPAL_PAYEE_EMAIL: optional,

  GEMINI_API_KEY: optional,
  GEMINI_MODEL_CONTRACTS: z.string().default("gemini-3.8-flash"),
  GEMINI_MODEL_BUYER: z.string().default("gemini-3.8-flash"),
  GEMINI_MODEL_WORKER: z.string().default("gemini-3.8-flash"),
  GEMINI_MODEL_VERIFIER: z.string().default("gemini-3.8-flash"),
  GEMINI_MAX_TOKENS_PER_RUN: z.coerce.number().int().positive().default(400000),

  RESEND_API_KEY: optional,
  EMAIL_FROM: z.string().default("PACT Protocol <no-reply@example.com>"),

  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default("./.pact-storage"),
  S3_BUCKET: optional,
  S3_REGION: z.string().default("auto"),
  S3_ENDPOINT: optional,
  S3_ACCESS_KEY_ID: optional,
  S3_SECRET_ACCESS_KEY: optional,

  RECEIPT_SIGNING_KEY_ID: optional,
  RECEIPT_SIGNING_PRIVATE_KEY_PEM: optional,
  RECEIPT_SIGNING_PUBLIC_KEY_PEM: optional,

  PLAYWRIGHT_CHROMIUM_PATH: optional,
  LIGHTHOUSE_ENABLED: z
    .string()
    .default("true")
    .transform((v) => v !== "false" && v !== "0"),
  WORKER_ID: optional,

  JUDGE_EMAIL: optional,
  JUDGE_PASSWORD: optional,
  JUDGE_ORG_NAME: z.string().default("PACT Judge Demo"),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export function resetEnvCache() {
  cached = undefined;
}

export type IntegrationName = "paypal" | "gemini" | "email" | "storage" | "receiptSigning" | "webhooks";

export interface IntegrationStatus {
  name: IntegrationName;
  configured: boolean;
  environment?: string;
  detail: string;
  instructions?: string;
}

/**
 * Non-secret description of what is configured. Safe to send to the browser.
 */
export function integrationStatuses(): IntegrationStatus[] {
  const e = env();
  const paypalConfigured = Boolean(e.PAYPAL_CLIENT_ID && e.PAYPAL_CLIENT_SECRET);
  const storageOk = e.STORAGE_DRIVER === "local" || Boolean(e.S3_BUCKET && e.S3_ACCESS_KEY_ID && e.S3_SECRET_ACCESS_KEY);
  return [
    {
      name: "paypal",
      configured: paypalConfigured,
      environment: e.PAYPAL_ENVIRONMENT,
      detail: paypalConfigured
        ? `PayPal REST credentials present (${e.PAYPAL_ENVIRONMENT}).`
        : "PayPal client ID and secret are not set. Orders cannot be created.",
      instructions: paypalConfigured
        ? undefined
        : "Create a sandbox REST app at developer.paypal.com and set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET.",
    },
    {
      name: "webhooks",
      configured: Boolean(e.PAYPAL_WEBHOOK_ID),
      environment: e.PAYPAL_ENVIRONMENT,
      detail: e.PAYPAL_WEBHOOK_ID
        ? "PayPal webhook ID present. Incoming events are signature-verified."
        : "PAYPAL_WEBHOOK_ID is not set. Webhook events will be rejected until it is.",
      instructions: e.PAYPAL_WEBHOOK_ID
        ? undefined
        : `Register ${e.APP_URL}/api/webhooks/paypal in the PayPal dashboard and set PAYPAL_WEBHOOK_ID.`,
    },
    {
      name: "gemini",
      configured: Boolean(e.GEMINI_API_KEY),
      environment: e.GEMINI_MODEL_WORKER,
      detail: e.GEMINI_API_KEY
        ? "Gemini API key present. Agents can reason and generate contracts."
        : "GEMINI_API_KEY is not set. Contract generation and agent runs are unavailable.",
      instructions: e.GEMINI_API_KEY ? undefined : "Create a key at aistudio.google.com and set GEMINI_API_KEY.",
    },
    {
      name: "email",
      configured: Boolean(e.RESEND_API_KEY),
      detail: e.RESEND_API_KEY
        ? "Resend API key present. Transactional email is delivered."
        : "RESEND_API_KEY is not set. Verification and reset links are written to the server log.",
      instructions: e.RESEND_API_KEY ? undefined : "Set RESEND_API_KEY and a verified EMAIL_FROM sender.",
    },
    {
      name: "storage",
      configured: storageOk,
      environment: e.STORAGE_DRIVER,
      detail:
        e.STORAGE_DRIVER === "local"
          ? `Local filesystem storage at ${e.STORAGE_LOCAL_DIR}. Suitable for development only.`
          : storageOk
            ? `S3-compatible storage configured (bucket ${e.S3_BUCKET}).`
            : "STORAGE_DRIVER=s3 but bucket or credentials are missing.",
    },
    {
      name: "receiptSigning",
      configured: Boolean(e.RECEIPT_SIGNING_PRIVATE_KEY_PEM && e.RECEIPT_SIGNING_PUBLIC_KEY_PEM && e.RECEIPT_SIGNING_KEY_ID),
      detail: e.RECEIPT_SIGNING_PRIVATE_KEY_PEM
        ? `Ed25519 signing key ${e.RECEIPT_SIGNING_KEY_ID} loaded.`
        : "No receipt signing key. Run `npm run keys:generate` and set the RECEIPT_SIGNING_* variables.",
    },
  ];
}

export function isConfigured(name: IntegrationName): boolean {
  return integrationStatuses().find((s) => s.name === name)?.configured ?? false;
}
