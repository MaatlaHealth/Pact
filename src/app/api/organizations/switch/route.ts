import { z } from "zod";
import { handler, readJson, ok } from "@/lib/api/respond";
import { assertSameOrigin, HttpError } from "@/lib/security/request";
import { requireUser } from "@/lib/auth/guards";
import { setActiveOrganization } from "@/lib/auth/session";

export const POST = handler(async (request) => {
  assertSameOrigin(request);
  const ctx = await requireUser();
  const { organizationId } = await readJson(request, z.object({ organizationId: z.string().uuid() }));
  if (!ctx.memberships.some((m) => m.id === organizationId)) throw new HttpError(403, "You are not a member of that workspace.");
  await setActiveOrganization(organizationId);
  return ok({ active: organizationId });
});
