import type { Metadata } from "next";
import { requireAppContext } from "@/lib/auth/app-context";
import { db } from "@/lib/db";
import { env, integrationStatuses } from "@/lib/env";
import { PageHeader } from "@/components/ui/primitives";
import { SettingsPanels } from "@/components/app/settings-panels";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const ctx = await requireAppContext();
  const [policy, members, invitations, keys] = await Promise.all([
    db.spendingPolicy.findUniqueOrThrow({ where: { organizationId: ctx.organization.id } }),
    db.membership.findMany({ where: { organizationId: ctx.organization.id }, include: { user: { select: { id: true, name: true, email: true, emailVerifiedAt: true } } }, orderBy: { createdAt: "asc" } }),
    db.invitation.findMany({ where: { organizationId: ctx.organization.id, acceptedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } }),
    db.apiKey.findMany({ where: { organizationId: ctx.organization.id }, orderBy: { createdAt: "desc" } }),
  ]);
  return (
    <>
      <PageHeader title="Settings" description={`Workspace ${ctx.organization.name} (${ctx.organization.slug}).`} />
      <SettingsPanels
        role={ctx.organization.role}
        currentUserId={ctx.user.id}
        policy={{ ...policy, updatedAt: policy.updatedAt.toISOString() }}
        members={members.map((m) => ({ userId: m.user.id, name: m.user.name, email: m.user.email, role: m.role, verified: Boolean(m.user.emailVerifiedAt) }))}
        invitations={invitations.map((i) => ({ id: i.id, email: i.email, role: i.role, expiresAt: i.expiresAt.toISOString() }))}
        apiKeys={keys.map((k) => ({ id: k.id, name: k.name, prefix: k.prefix, scopes: k.scopes, createdAt: k.createdAt.toISOString(), lastUsedAt: k.lastUsedAt?.toISOString() ?? null, revokedAt: k.revokedAt?.toISOString() ?? null }))}
        integrations={integrationStatuses()}
        webhookUrl={`${env().APP_URL}/api/webhooks/paypal`}
        memberships={ctx.memberships}
      />
    </>
  );
}
