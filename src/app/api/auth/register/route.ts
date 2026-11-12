import { z } from "zod";
import { handler, readJson, created } from "@/lib/api/respond";
import { assertSameOrigin, HttpError } from "@/lib/security/request";
import { rateLimit, clientIp } from "@/lib/security/rate-limit";
import { registerUser } from "@/lib/auth/service";
import { emailDeliveryConfigured } from "@/lib/email/service";

const schema = z.object({
  email: z.string().email().max(254),
  name: z.string().min(1).max(80),
  password: z.string().min(1).max(128),
  organizationName: z.string().min(2).max(80).optional(),
});

export const POST = handler(async (request) => {
  assertSameOrigin(request);
  const ip = clientIp(request);
  const limit = await rateLimit(`register:${ip}`, 10, 3600);
  if (!limit.allowed) throw new HttpError(429, "Too many registrations from this address. Try again later.");
  const input = await readJson(request, schema);
  const user = await registerUser({ ...input, ipAddress: ip, userAgent: request.headers.get("user-agent") });
  return created({ user: { id: user.id, email: user.email, name: user.name, emailVerified: false }, emailDelivery: emailDeliveryConfigured() ? "sent" : "not_configured" });
});
