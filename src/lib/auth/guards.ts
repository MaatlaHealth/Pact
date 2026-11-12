import { db } from "@/lib/db";
import { HttpError } from "@/lib/security/request";
import { hashToken } from "@/lib/security/tokens";
import { getAuthContext, type AuthContext, type SessionOrganization } from "@/lib/auth/session";
import type { MembershipRole } from "@/generated/prisma/client";

const ROLE_RANK: Record<MembershipRole, number> = { VIEWER: 0, MEMBER: 1, ADMIN: 2, OWNER: 3 };

export function roleAtLeast(role: MembershipRole, minimum: MembershipRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

export interface Principal {
  kind: "user" | "api_key";
  userId?: string;
  userName: string;
  organization: SessionOrganization;
  scopes: string[];
}

/** Session-authenticated principal for route handlers and server components. */
export async function requireUser(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) throw new HttpError(401, "Sign in to continue.");
  return ctx;
}

export async function requireVerifiedUser(): Promise<AuthContext> {
  const ctx = await requireUser();
  if (!ctx.user.emailVerifiedAt) throw new HttpError(403, "Verify your email address to continue.", "email_unverified");
  return ctx;
}

/**
 * Resolves the acting principal from either a session cookie or an API key
 * (Authorization: Bearer pact_live_...). Enforces organization membership and
 * the minimum role for the action.
 */
export async function requirePrincipal(request: Request, minimum: MembershipRole = "MEMBER"): Promise<Principal> {
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const raw = auth.slice(7).trim();
    const key = await db.apiKey.findUnique({ where: { keyHash: hashToken(raw) }, include: { organization: true, createdBy: true } });
    if (!key || key.revokedAt) throw new HttpError(401, "Invalid API key.");
    await db.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } });
    const role: MembershipRole = key.scopes.includes("write") ? "ADMIN" : "VIEWER";
    if (!roleAtLeast(role, minimum)) throw new HttpError(403, "This API key does not permit that action.");
    return {
      kind: "api_key",
      userId: key.createdById,
      userName: `API key ${key.name}`,
      organization: { id: key.organization.id, name: key.organization.name, slug: key.organization.slug, kind: key.organization.kind, role },
      scopes: key.scopes,
    };
  }
  const ctx = await requireVerifiedUser();
  if (!ctx.organization) throw new HttpError(403, "Create or join an organization first.", "no_organization");
  if (!roleAtLeast(ctx.organization.role, minimum)) throw new HttpError(403, "Your role does not permit that action.");
  return {
    kind: "user",
    userId: ctx.user.id,
    userName: ctx.user.name,
    organization: ctx.organization,
    scopes: ["read", "write"],
  };
}

/**
 * Loads a contract scoped to the principal's organization. Returns 404 rather
 * than 403 for foreign contracts so that IDs from other tenants are not
 * confirmed to exist.
 */
export async function requireContract(principal: Principal, contractId: string) {
  const contract = await db.contract.findFirst({ where: { id: contractId, organizationId: principal.organization.id } });
  if (!contract) throw new HttpError(404, "Contract not found.");
  return contract;
}
