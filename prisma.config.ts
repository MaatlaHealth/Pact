import "dotenv/config";
import { defineConfig } from "prisma/config";

// `prisma generate` runs during hosted builds (Netlify, Render) where no
// database is reachable and DATABASE_URL may not be set. Generation does not
// need a connection, so a placeholder keeps the build going; migrate and
// studio commands still require the real URL and fail clearly without it.
const databaseUrl = process.env.DATABASE_URL ?? "postgresql://unset:unset@localhost:5432/unset?schema=public";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: databaseUrl,
  },
});
