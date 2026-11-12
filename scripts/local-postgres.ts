/**
 * Starts an embedded PostgreSQL server for local development and testing.
 * This exists so the project runs on a machine without Docker or a system
 * PostgreSQL. Production deployments use a managed PostgreSQL instance.
 *
 * Usage: npm run db:local
 * Connection string: postgresql://pact:pact@localhost:54329/pact
 */
import EmbeddedPostgres from "embedded-postgres";
import path from "node:path";
import fs from "node:fs";

const port = Number(process.env.LOCAL_PG_PORT ?? 54329);
const dataDir = path.resolve(process.cwd(), ".pact-local/postgres");
const firstRun = !fs.existsSync(path.join(dataDir, "PG_VERSION"));

async function main() {
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: "pact",
    password: "pact",
    port,
    persistent: true,
    onLog: () => {},
    onError: (message) => console.error(String(message)),
  });

  if (firstRun) {
    console.log(`Initialising PostgreSQL data directory at ${dataDir}`);
    await pg.initialise();
  }

  await pg.start();
  if (firstRun) {
    await pg.createDatabase("pact");
    await pg.createDatabase("pact_test");
  }

  console.log(`PostgreSQL ready on port ${port}`);
  console.log(`DATABASE_URL=postgresql://pact:pact@localhost:${port}/pact`);
  console.log(`TEST_DATABASE_URL=postgresql://pact:pact@localhost:${port}/pact_test`);
  console.log("Press Ctrl+C to stop.");

  const shutdown = async () => {
    console.log("Stopping PostgreSQL");
    await pg.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
