import { requireSignedIn } from "@/lib/auth/app-context";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { AppShell } from "@/components/app/shell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireSignedIn();
  const pendingApprovals = ctx.organization ? await db.approvalRequest.count({ where: { organizationId: ctx.organization.id, status: "PENDING" } }) : 0;
  return (
    <AppShell user={ctx.user} organization={ctx.organization} memberships={ctx.memberships} pendingApprovals={pendingApprovals} paypalEnvironment={env().PAYPAL_ENVIRONMENT} deploymentLabel={env().PACT_DEPLOYMENT_LABEL ?? null}>
      {children}
    </AppShell>
  );
}
