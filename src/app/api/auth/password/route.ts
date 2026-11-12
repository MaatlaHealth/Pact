import { z } from "zod";
import { handler, readJson, ok } from "@/lib/api/respond";
import { assertSameOrigin, HttpError } from "@/lib/security/request";
import { rateLimit, clientIp } from "@/lib/security/rate-limit";
import { requestPasswordReset, resetPassword } from "@/lib/auth/service";
import { emailDeliveryConfigured } from "@/lib/email/service";

/** Request a reset link. Always returns 200 so account existence is not revealed. */
export const POST = handler(async (request) => {
  assertSameOrigin(request);
  const limit = await rateLimit(`forgot:${clientIp(request)}`, 10, 3600);
  if (!limit.allowed) throw new HttpError(429, "Too many requests. Try again later.");
  const { email } = await readJson(request, z.object({ email: z.string().email().max(254) }));
  await requestPasswordReset(email);
  return ok({ requested: true, emailDelivery: emailDeliveryConfigured() ? "sent" : "not_configured" });
});

/** Complete a reset with the token from the email. */
export const PUT = handler(async (request) => {
  assertSameOrigin(request);
  const { token, password } = await readJson(request, z.object({ token: z.string().min(10).max(200), password: z.string().min(1).max(128) }));
  await resetPassword(token, password);
  return ok({ reset: true });
});
