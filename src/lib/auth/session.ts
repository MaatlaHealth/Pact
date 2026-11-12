import { cookies } from "next/headers";
import { cache } from "react";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { generateToken, hashToken } from "@/lib/security/tokens";
import type { MembershipRole, OrganizationKind } from "@/generated/prisma/client";

export const SESSION_COOKIE = "pact_session";
export const ORG_COOKIE = "pact_org";
const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const SLIDING_REFRESH_MS = 24 * 60 * 60 * 1000;

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  emailVerifiedAt: Date | null;
}

export interface SessionOrganization {
  id: string;
  name: string;
  slug: string;
  kind: OrganizationKind;
  role: MembershipRole;
}

export interface AuthContext {
  sessionId: string;
  user: SessionUser;
  organization: SessionOrganization | null;
  memberships: SessionOrganization[];
}

function cookieOptions(expires: Date) {
  return {
    httpOnly: true,
    secure: env().NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires,
  };
}

export async function createSession(userId: string, meta: { ipAddress?: string | null; userAgent?: string | null }) {
  const token = generateToken(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt,
      ipAddress: meta.ipAddress ?? null,
      userAgent: meta.userAgent?.slice(0, 500) ?? null,
    },
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, cookieOptions(expiresAt));
}

export async function destroyCurrentSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.session.updateMany({ where: { tokenHash: hashToken(token), revokedAt: null }, data: { revokedAt: new Date() } });
  }
  jar.delete(SESSION_COOKIE);
  jar.delete(ORG_COOKIE);
}

export async function revokeAllSessions(userId: string, exceptSessionId?: string) {
  await db.session.updateMany({
    where: { userId, revokedAt: null, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
    data: { revokedAt: new Date() },
  });
}

export async function setActiveOrganization(organizationId: string) {
  const jar = await cookies();
  jar.set(ORG_COOKIE, organizationId, cookieOptions(new Date(Date.now() + SESSION_TTL_MS)));
}

/**
 * Resolves the current session from the cookie. Memoised per request.
 * Returns null for missing, expired, or revoked sessions.
 */
export const getAuthContext = cache(async (): Promise<AuthContext | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      user: {
        include: {
          memberships: { include: { organization: true }, orderBy: { createdAt: "asc" } },
        },
      },
    },
  });
  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;

  if (Date.now() - session.lastUsedAt.getTime() > SLIDING_REFRESH_MS) {
    await db.session.update({
      where: { id: session.id },
      data: { lastUsedAt: new Date(), expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
    });
  }

  const memberships: SessionOrganization[] = session.user.memberships.map((m) => ({
    id: m.organization.id,
    name: m.organization.name,
    slug: m.organization.slug,
    kind: m.organization.kind,
    role: m.role,
  }));
  const requestedOrg = jar.get(ORG_COOKIE)?.value;
  const organization = memberships.find((m) => m.id === requestedOrg) ?? memberships[0] ?? null;

  return {
    sessionId: session.id,
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      emailVerifiedAt: session.user.emailVerifiedAt,
    },
    organization,
    memberships,
  };
});
