import { z } from "zod";
import { handler, readJson, ok } from "@/lib/api/respond";
import { assertSameOrigin, HttpError } from "@/lib/security/request";
import { rateLimit, clientIp } from "@/lib/security/rate-limit";
import { safeEqual } from "@/lib/security/tokens";
import { env } from "@/lib/env";
import { db } from "@/lib/db";
import { createSession, setActiveOrganization } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit";

/**
 * Judge entry point. A reviewer enters the access code supplied privately in
 * the Devpost testing instructions and is signed in as the restricted judge
 * account of the demonstration workspace. The code is a deployment secret;
 * nothing is created or pre-approved by this endpoint.
 */
export const POST = handler(async (request) => {
  assertSameOrigin(request);
  const e = env();
  if (!e.JUDGE_ACCESS_CODE || !e.JUDGE_EMAIL) {
    throw new HttpError(503, "The judge workspace is not provisioned on this deployment.", "judge_not_provisioned");
  }
  const ip = clientIp(request);
  const limit = await rateLimit(`judge-access:${ip}`, 10, 3600);
  if (!limit.allowed) throw new HttpError(429, "Too many attempts. Try again later.");
  const { code } = await readJson(request, z.object({ code: z.string().min(4).max(200) }));
  if (!safeEqual(code.trim(), e.JUDGE_ACCESS_CODE)) {
    await recordAudit({ actorType: "SYSTEM", action: "judge.access_denied", title: "Judge access code rejected", severity: "WARNING", ipAddress: ip });
    throw new HttpError(401, "That access code is not valid.");
  }
  const judge = await db.user.findUnique({ where: { email: e.JUDGE_EMAIL.toLowerCase() }, include: { memberships: { include: { organization: true } } } });
  const demo = judge?.memberships.find((m) => m.organization.kind === "JUDGE_DEMO");
  if (!judge || !demo) throw new HttpError(503, "The judge account has not been seeded. Run `npm run judge:seed` on the deployment.", "judge_not_provisioned");
  await createSession(judge.id, { ipAddress: ip, userAgent: request.headers.get("user-agent") });
  await setActiveOrganization(demo.organization.id);
  await recordAudit({ organizationId: demo.organization.id, actorType: "USER", actorId: judge.id, actorLabel: judge.name, action: "judge.access_granted", title: "Judge signed in with the access code", ipAddress: ip });
  return ok({ signedIn: true, workspace: { id: demo.organization.id, name: demo.organization.name } });
});
