import { defineConfig } from "vitest/config";

// Integration tests run against a real PostgreSQL database (TEST_DATABASE_URL)
// and, when credentials are present, the PayPal sandbox and Gemini API.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    environment: "node",
    testTimeout: 180000,
    hookTimeout: 180000,
    fileParallelism: false,
    setupFiles: ["tests/integration/setup.ts"],
  },
});
