import { z } from "zod";
import { handler, readJson, ok, created } from "@/lib/api/respond";
import { assertSameOrigin, HttpError } from "@/lib/security/request";
import { requirePrincipal } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { inviteMember, updateMemberRole, removeMember } from "@/lib/orgs/service";
import { emailDeliveryConfigured } from "@/lib/email/service";

export const GET = handler(async (request) => {
  const principal = await requirePrincipal(request, "VIEWER");
  const [members, invitations] = await Promise.all([
    db.membership.findMany({ where: { organizationId: principal.organization.id }, include: { user: { select: { id: true, name: true, email: true, emailVerifiedAt: true } } }, orderBy: { createdAt: "asc" } }),
    db.invitation.findMany({ where: { organizationId: principal.organization.id, acceptedAt: null, expiresAt: { gt: new Date() } }, select: { id: true, email: true, role: true, expiresAt: true, createdAt: true } }),
  ]);
  return ok({ members: members.map((m) => ({ userId: m.user.id, name: m.user.name, email: m.user.email, role: m.role, verified: Boolean(m.user.emailVerifiedAt), joinedAt: m.createdAt })), invitations });
});

export const POST = handler(async (request) => {
  assertSameOrigin(request);
  const principal = await requirePrincipal(request, "ADMIN");
  if (!principal.userId) throw new HttpError(403, "API keys cannot invite members.");
  const { email, role } = await readJson(request, z.object({ email: z.string().email(), role: z.enum(["ADMIN", "MEMBER", "VIEWER"]) }));
  const invitation = await inviteMember({ organizationId: principal.organization.id, email, role, invitedById: principal.userId, inviterName: principal.userName, orgName: principal.organization.name });
  return created({ invitation: { id: invitation.id, email: invitation.email, role: invitation.role, expiresAt: invitation.expiresAt }, emailDelivery: emailDeliveryConfigured() ? "sent" : "not_configured" });
});

export const PATCH = handler(async (request) => {
  assertSameOrigin(request);
  const principal = await requirePrincipal(request, "OWNER");
  const { userId, role } = await readJson(request, z.object({ userId: z.string().uuid(), role: z.enum(["OWNER", "ADMIN", "MEMBER", "VIEWER"]) }));
  await updateMemberRole({ organizationId: principal.organization.id, targetUserId: userId, role, actorId: principal.userId! });
  return ok({ updated: true });
});

export const DELETE = handler(async (request) => {
  assertSameOrigin(request);
  const principal = await requirePrincipal(request, "OWNER");
  const { userId } = await readJson(request, z.object({ userId: z.string().uuid() }));
  await removeMember({ organizationId: principal.organization.id, targetUserId: userId, actorId: principal.userId! });
  return ok({ removed: true });
});
