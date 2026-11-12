import { handler, ok } from "@/lib/api/respond";
import { getAuthContext } from "@/lib/auth/session";

export const GET = handler(async () => {
  const ctx = await getAuthContext();
  if (!ctx) return ok({ authenticated: false });
  return ok({ authenticated: true, user: { ...ctx.user, emailVerified: Boolean(ctx.user.emailVerifiedAt) }, organization: ctx.organization, memberships: ctx.memberships });
});
