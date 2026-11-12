import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAppContext } from "@/lib/auth/app-context";
import { loadContractDetail } from "@/lib/contracts/loaders";
import { integrationStatuses } from "@/lib/env";
import { db } from "@/lib/db";
import { ContractWorkspace } from "@/components/contract/workspace";

export const metadata: Metadata = { title: "Contract" };

export default async function ContractPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ payment?: string; message?: string }> }) {
  const ctx = await requireAppContext();
  const { id } = await params;
  const { payment, message } = await searchParams;
  const detail = await loadContractDetail(ctx.organization.id, id);
  if (!detail) notFound();
  const events = await db.auditEvent.findMany({ where: { organizationId: ctx.organization.id, contractId: id }, orderBy: { createdAt: "asc" }, take: 500 });
  const integrations = Object.fromEntries(integrationStatuses().map((s) => [s.name, s.configured])) as Record<string, boolean>;
  return (
    <ContractWorkspace
      initial={detail.contract}
      scenario={detail.scenario}
      role={ctx.organization.role}
      integrations={integrations}
      initialEvents={events.map((e) => ({ id: e.id, createdAt: e.createdAt.toISOString(), actorType: e.actorType, actorLabel: e.actorLabel, action: e.action, title: e.title, description: e.description, severity: e.severity, contractId: e.contractId }))}
      paymentReturn={payment ? { status: payment, message: message ?? null } : null}
    />
  );
}
