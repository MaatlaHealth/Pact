import { z } from "zod";
import { handler, ok, readJson } from "@/lib/api/respond";
import { HttpError } from "@/lib/security/request";
import { rateLimit, clientIp } from "@/lib/security/rate-limit";
import { verifyReceipt } from "@/lib/receipts/service";
import { db } from "@/lib/db";

const schema = z.object({ payload: z.unknown(), signature: z.string().min(10).max(2000), signingKeyId: z.string().min(1).max(120) });

/** Public: anyone holding a receipt can verify it. */
export const POST = handler(async (request) => {
  const limit = await rateLimit(`receipt-verify:${clientIp(request)}`, 60, 600);
  if (!limit.allowed) throw new HttpError(429, "Too many verification requests.");
  const input = await readJson(request, schema);
  const result = await verifyReceipt(input);
  return ok({ verification: result });
});

/** Public: current signing keys so receipts can be checked offline. */
export const GET = handler(async () => {
  const keys = await db.signingKey.findMany({ select: { id: true, algorithm: true, publicKeyPem: true, createdAt: true, retiredAt: true }, orderBy: { createdAt: "desc" } });
  return ok({ keys });
});
