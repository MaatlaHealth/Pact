import { z } from "zod";
import { handler, readJson, ok } from "@/lib/api/respond";
import { assertSameOrigin } from "@/lib/security/request";
import { verifyEmailToken, issueEmailVerification } from "@/lib/auth/service";
import { requireUser } from "@/lib/auth/guards";
import { emailDeliveryConfigured } from "@/lib/email/service";
import { rateLimit } from "@/lib/security/rate-limit";
import { HttpError } from "@/lib/security/request";

export const POST = handler(async (request) => {
  assertSameOrigin(request);
  const { token } = await readJson(request, z.object({ token: z.string().min(10).max(200) }));
  const user = await verifyEmailToken(token);
  return ok({ verified: true, email: user.email });
});

/** Re-sends the verification email for the signed-in user. */
export const PUT = handler(async (request) => {
  assertSameOrigin(request);
  const ctx = await requireUser();
  if (ctx.user.emailVerifiedAt) return ok({ alreadyVerified: true });
  const limit = await rateLimit(`resend-verify:${ctx.user.id}`, 5, 3600);
  if (!limit.allowed) throw new HttpError(429, "Too many verification emails requested.");
  const result = await issueEmailVerification(ctx.user.id, ctx.user.email, ctx.user.name);
  return ok({ sent: result.delivered, emailDelivery: emailDeliveryConfigured() ? "sent" : "not_configured" });
});
