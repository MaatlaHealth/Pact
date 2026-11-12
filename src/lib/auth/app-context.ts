import { redirect } from "next/navigation";
import { getAuthContext, type AuthContext, type SessionOrganization } from "@/lib/auth/session";

export interface AppContext extends AuthContext {
  organization: SessionOrganization;
}

/** Server-component guard for /app pages. Redirects instead of throwing. */
export async function requireAppContext(): Promise<AppContext> {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/sign-in");
  if (!ctx.user.emailVerifiedAt) redirect("/verify-email");
  if (!ctx.organization) redirect("/app/onboarding");
  return ctx as AppContext;
}

export async function requireSignedIn(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/sign-in");
  if (!ctx.user.emailVerifiedAt) redirect("/verify-email");
  return ctx;
}
