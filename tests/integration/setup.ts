import "dotenv/config";
import { execSync } from "node:child_process";
import { beforeAll } from "vitest";

/**
 * Integration tests use TEST_DATABASE_URL so they never touch development
 * data. Migrations are applied once per run; each test file creates its own
 * isolated organizations and cleans them up.
 */
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) throw new Error("TEST_DATABASE_URL must be set for integration tests (see .env.example).");
process.env.DATABASE_URL = testUrl;
process.env.APP_SECRET ??= "integration-test-secret-integration-test-secret";
process.env.APP_URL ??= "http://localhost:3000";
process.env.STORAGE_DRIVER = "local";
process.env.STORAGE_LOCAL_DIR = "./.pact-local/test-storage";
(process.env as Record<string, string>).NODE_ENV = "test";

let migrated = false;

beforeAll(() => {
  if (migrated) return;
  execSync("npx prisma migrate deploy", { stdio: "pipe", env: { ...process.env, DATABASE_URL: testUrl } });
  migrated = true;
});
