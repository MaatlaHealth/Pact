import { z } from "zod";
import { handler, readJson, created, ok } from "@/lib/api/respond";
import { assertSameOrigin } from "@/lib/security/request";
import { requireVerifiedUser } from "@/lib/auth/guards";
import { createOrganization } from "@/lib/orgs/service";
import { setActiveOrganization } from "@/lib/auth/session";

export const POST = handler(async (request) => {
  assertSameOrigin(request);
  const ctx = await requireVerifiedUser();
  const { name } = await readJson(request, z.object({ name: z.string().min(2).max(80) }));
  const organization = await createOrganization({ name, ownerId: ctx.user.id });
  await setActiveOrganization(organization.id);
  return created({ organization: { id: organization.id, name: organization.name, slug: organization.slug } });
});

export const GET = handler(async () => {
  const ctx = await requireVerifiedUser();
  return ok({ organizations: ctx.memberships, active: ctx.organization?.id ?? null });
});
