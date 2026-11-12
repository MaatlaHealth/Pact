import { handler, ok } from "@/lib/api/respond";
import { assertSameOrigin } from "@/lib/security/request";
import { requireVerifiedUser } from "@/lib/auth/guards";
import { acceptInvitation } from "@/lib/orgs/service";
import { setActiveOrganization } from "@/lib/auth/session";

export const POST = handler(async (request, ctx: { params: Promise<{ token: string }> }) => {
  assertSameOrigin(request);
  const { token } = await ctx.params;
  const auth = await requireVerifiedUser();
  const organization = await acceptInvitation(token, auth.user.id, auth.user.email);
  await setActiveOrganization(organization.id);
  return ok({ organization: { id: organization.id, name: organization.name, slug: organization.slug } });
});
