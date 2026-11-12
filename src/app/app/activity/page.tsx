import type { Metadata } from "next";
import { requireAppContext } from "@/lib/auth/app-context";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/primitives";
import { LiveActivity } from "@/components/app/live-activity";

export const metadata: Metadata = { title: "Live activity" };

export default async function ActivityPage() {
  const ctx = await requireAppContext();
  const events = await db.auditEvent.findMany({ where: { organizationId: ctx.organization.id }, orderBy: { createdAt: "desc" }, take: 150 });
  return (
    <>
      <PageHeader title="Live activity" description="Events from agents, the policy engine, PayPal, and your team, streamed as they are recorded." />
      <LiveActivity initial={events.reverse().map((e) => ({ id: e.id, createdAt: e.createdAt.toISOString(), actorType: e.actorType, actorLabel: e.actorLabel, action: e.action, title: e.title, description: e.description, severity: e.severity, contractId: e.contractId }))} />
    </>
  );
}
