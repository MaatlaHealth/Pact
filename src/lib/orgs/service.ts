import { db } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { HttpError } from "@/lib/security/request";
import { generateToken, hashToken } from "@/lib/security/tokens";
import { sendEmail } from "@/lib/email/service";
import { env } from "@/lib/env";
import type { MembershipRole, OrganizationKind } from "@/generated/prisma/client";

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "workspace";
}

async function uniqueSlug(base: string): Promise<string> {
  let candidate = base;
  for (let i = 0; i < 20; i += 1) {
    const existing = await db.organization.findUnique({ where: { slug: candidate } });
    if (!existing) return candidate;
    candidate = `${base}-${generateToken(3).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 4)}`;
  }
  throw new HttpError(500, "Could not allocate a workspace slug.");
}

export async function createOrganization(input: { name: string; ownerId: string; kind?: OrganizationKind }) {
  const slug = await uniqueSlug(slugify(input.name));
  const organization = await db.organization.create({
    data: {
      name: input.name,
      slug,
      kind: input.kind ?? "STANDARD",
      memberships: { create: { userId: input.ownerId, role: "OWNER" } },
      spendingPolicy: { create: {} },
    },
  });
  await recordAudit({
    organizationId: organization.id,
    actorType: "USER",
    actorId: input.ownerId,
    action: "organization.created",
    entityType: "organization",
    entityId: organization.id,
    title: `Workspace "${organization.name}" created`,
  });
  return organization;
}

export async function inviteMember(input: { organizationId: string; email: string; role: MembershipRole; invitedById: string; inviterName: string; orgName: string }) {
  const email = input.email.trim().toLowerCase();
  const existingUser = await db.user.findUnique({ where: { email }, include: { memberships: { where: { organizationId: input.organizationId } } } });
  if (existingUser?.memberships.length) throw new HttpError(409, "That person is already a member.");
  const token = generateToken(24);
  const invitation = await db.invitation.create({
    data: {
      organizationId: input.organizationId,
      email,
      role: input.role,
      tokenHash: hashToken(token),
      invitedById: input.invitedById,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });
  await sendEmail({
    to: email,
    subject: `${input.inviterName} invited you to ${input.orgName} on PACT Protocol`,
    heading: "You have been invited",
    paragraphs: [`${input.inviterName} invited you to join the ${input.orgName} workspace as ${input.role.toLowerCase()}.`, "The invitation expires in 7 days."],
    action: { label: "Accept invitation", url: `${env().APP_URL}/invitations/${token}` },
    kind: "invitation",
  });
  await recordAudit({ organizationId: input.organizationId, actorType: "USER", actorId: input.invitedById, actorLabel: input.inviterName, action: "organization.member_invited", entityType: "invitation", entityId: invitation.id, title: `Invited ${email} as ${input.role.toLowerCase()}` });
  return invitation;
}

export async function acceptInvitation(token: string, userId: string, userEmail: string) {
  const invitation = await db.invitation.findUnique({ where: { tokenHash: hashToken(token) }, include: { organization: true } });
  if (!invitation || invitation.acceptedAt || invitation.expiresAt < new Date()) throw new HttpError(400, "This invitation is invalid or has expired.");
  if (invitation.email !== userEmail.toLowerCase()) throw new HttpError(403, "This invitation was sent to a different email address.");
  await db.$transaction([
    db.invitation.update({ where: { id: invitation.id }, data: { acceptedAt: new Date() } }),
    db.membership.upsert({
      where: { userId_organizationId: { userId, organizationId: invitation.organizationId } },
      create: { userId, organizationId: invitation.organizationId, role: invitation.role },
      update: {},
    }),
  ]);
  await recordAudit({ organizationId: invitation.organizationId, actorType: "USER", actorId: userId, action: "organization.member_joined", entityType: "membership", title: `${userEmail} joined the workspace` });
  return invitation.organization;
}

export async function updateMemberRole(input: { organizationId: string; targetUserId: string; role: MembershipRole; actorId: string }) {
  const owners = await db.membership.count({ where: { organizationId: input.organizationId, role: "OWNER" } });
  const target = await db.membership.findUnique({ where: { userId_organizationId: { userId: input.targetUserId, organizationId: input.organizationId } } });
  if (!target) throw new HttpError(404, "Member not found.");
  if (target.role === "OWNER" && input.role !== "OWNER" && owners <= 1) throw new HttpError(409, "A workspace needs at least one owner.");
  await db.membership.update({ where: { id: target.id }, data: { role: input.role } });
  await recordAudit({ organizationId: input.organizationId, actorType: "USER", actorId: input.actorId, action: "organization.member_role_changed", entityType: "membership", entityId: target.id, title: `Member role changed to ${input.role.toLowerCase()}`, severity: "NOTICE" });
}

export async function removeMember(input: { organizationId: string; targetUserId: string; actorId: string }) {
  const target = await db.membership.findUnique({ where: { userId_organizationId: { userId: input.targetUserId, organizationId: input.organizationId } } });
  if (!target) throw new HttpError(404, "Member not found.");
  if (target.role === "OWNER") {
    const owners = await db.membership.count({ where: { organizationId: input.organizationId, role: "OWNER" } });
    if (owners <= 1) throw new HttpError(409, "A workspace needs at least one owner.");
  }
  await db.membership.delete({ where: { id: target.id } });
  await recordAudit({ organizationId: input.organizationId, actorType: "USER", actorId: input.actorId, action: "organization.member_removed", entityType: "membership", entityId: target.id, title: "Member removed", severity: "NOTICE" });
}
