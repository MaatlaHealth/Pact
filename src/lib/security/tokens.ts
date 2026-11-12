import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

/** Random URL-safe token. Only its hash is stored. */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

/** Keyed hash so a database leak does not expose usable tokens. */
export function hashToken(token: string): string {
  return createHmac("sha256", env().APP_SECRET).update(token).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function hmacSign(payload: string, keyLabel: string): string {
  return createHmac("sha256", `${env().APP_SECRET}:${keyLabel}`).update(payload).digest("base64url");
}
