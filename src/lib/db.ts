import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. See .env.example.");
  }
  // Serverless hosts run many short-lived instances; keep each pool small and
  // point DATABASE_URL at a pooler (Neon, Supabase, PgBouncer) in that case.
  const max = Number(process.env.DATABASE_POOL_MAX ?? (process.env.NETLIFY ? 3 : 10));
  const adapter = new PrismaPg({ connectionString, max });
  return new PrismaClient({
    adapter,
    log: process.env.PRISMA_LOG === "query" ? ["query", "warn", "error"] : ["warn", "error"],
  });
}

function getClient(): PrismaClient {
  if (!globalForPrisma.prisma) {
    const client = createClient();
    if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = client;
    else globalForPrisma.prisma = client;
  }
  return globalForPrisma.prisma;
}

/**
 * Lazily constructed Prisma client. Modules can import `db` without a
 * database being configured (for example in unit tests); the connection is
 * only established on first use.
 */
export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property, receiver) {
    const client = getClient();
    const value = Reflect.get(client, property, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

export type { PrismaClient };
