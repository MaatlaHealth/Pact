import { z } from "zod";
import { handler, readJson, ok } from "@/lib/api/respond";
import { assertSameOrigin, HttpError } from "@/lib/security/request";
import { rateLimit, clientIp } from "@/lib/security/rate-limit";
import { loginUser } from "@/lib/auth/service";

const schema = z.object({ email: z.string().email().max(254), password: z.string().min(1).max(128) });

export const POST = handler(async (request) => {
  assertSameOrigin(request);
  const ip = clientIp(request);
  const input = await readJson(request, schema);
  const [byIp, byEmail] = await Promise.all([rateLimit(`login:ip:${ip}`, 30, 900), rateLimit(`login:email:${input.email.toLowerCase()}`, 10, 900)]);
  if (!byIp.allowed || !byEmail.allowed) throw new HttpError(429, "Too many sign-in attempts. Wait a few minutes and try again.");
  const user = await loginUser({ ...input, ipAddress: ip, userAgent: request.headers.get("user-agent") });
  return ok({ user: { id: user.id, email: user.email, name: user.name, emailVerified: Boolean(user.emailVerifiedAt) } });
});
