import { db } from "@/lib/db";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

/**
 * Fixed-window rate limiter backed by PostgreSQL so it works across several
 * web instances. The upsert is atomic, so concurrent requests cannot exceed
 * the limit by racing.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
  const now = new Date();
  const resetAt = new Date(now.getTime() + windowSeconds * 1000);
  const rows = await db.$queryRaw<{ count: number; reset_at: Date }[]>`
    INSERT INTO rate_limit_buckets ("key", "count", "reset_at")
    VALUES (${key}, 1, ${resetAt})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN rate_limit_buckets.reset_at < ${now} THEN 1 ELSE rate_limit_buckets.count + 1 END,
      "reset_at" = CASE WHEN rate_limit_buckets.reset_at < ${now} THEN ${resetAt} ELSE rate_limit_buckets.reset_at END
    RETURNING "count", "reset_at"
  `;
  const row = rows[0];
  const count = Number(row.count);
  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    resetAt: row.reset_at,
  };
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}
