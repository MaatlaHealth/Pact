import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAppContext } from "@/lib/auth/app-context";
import { db } from "@/lib/db";
import { PASSPORT_RULES } from "@/lib/passport/service";
import { formatMoney } from "@/lib/money";
import { formatDate, humanize } from "@/lib/utils";
import { CONTRACT_STATUS_LABELS } from "@/lib/policy/state-machine";
import { PageHeader, Card, CardHeader, CardBody, Badge, StatusBadge, KeyValue, EmptyState, Stat, Mono } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Agent" };

export default async function AgentDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const ctx = await requireAppContext();
  const { slug } = await params;
  const agent = await db.agent.findFirst({ where: { slug, OR: [{ isPlatformAgent: true }, { organizationId: ctx.organization.id }] }, include: { capabilities: true, trustPassport: true } });
  if (!agent) notFound();
  const [contracts, receipts, runs] = await Promise.all([
    db.contract.findMany({ where: { workerAgentId: agent.id, organizationId: ctx.organization.id }, orderBy: { createdAt: "desc" }, take: 20 }),
    db.receipt.findMany({ where: { workerAgentId: agent.id, organizationId: ctx.organization.id }, orderBy: { settledAt: "desc" }, take: 20 }),
    db.agentRun.findMany({ where: { agentId: agent.id, contract: { organizationId: ctx.organization.id } }, orderBy: { createdAt: "desc" }, take: 20, include: { contract: { select: { title: true } } } }),
  ]);
  const passport = agent.trustPassport;
  const value = (passport?.completedValueByCurrency as Record<string, number>) ?? {};
  const categories = (passport?.categories as Record<string, number>) ?? {};
  const methods = (passport?.verificationMethods as string[]) ?? [];

  return (
    <>
      <PageHeader eyebrow={agent.role} title={agent.name} description={agent.description} actions={<StatusBadge status={agent.status} />} />
      {agent.role === "WORKER" ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Trust tier" value={passport?.tier ?? "NEW"} hint={`Established at ${PASSPORT_RULES.ESTABLISHED.minVerifiedTasks} verified tasks, trusted at ${PASSPORT_RULES.TRUSTED.minVerifiedTasks}`} />
            <Stat label="Verified tasks" value={passport?.verifiedTaskCount ?? 0} hint="Signed receipts across all workspaces" />
            <Stat label="Corrections" value={passport?.correctionCount ?? 0} hint={`${passport?.failedVerificationCount ?? 0} failed verification runs`} />
            <Stat label="Completed value" value={Object.keys(value).length ? Object.entries(value).map(([c, v]) => formatMoney(v, c)).join(", ") : formatMoney(0, "USD")} hint="From receipts only" />
          </div>
          <Card className="mt-4">
            <CardHeader title="Trust Passport" description={`Computed ${passport ? formatDate(passport.computedAt) : "never"} from receipts and verification runs. There is no manual override and no import path.`} />
            <CardBody>
              <KeyValue items={[{ label: "Registered", value: formatDate(agent.registeredAt) }, { label: "First verified", value: passport?.firstVerifiedAt ? formatDate(passport.firstVerifiedAt) : "none yet" }, { label: "Last verified", value: passport?.lastVerifiedAt ? formatDate(passport.lastVerifiedAt) : "none yet" }, { label: "Verified categories", value: Object.keys(categories).length ? Object.entries(categories).map(([c, n]) => `${humanize(c)} (${n})`).join(", ") : "none yet" }, { label: "Documented verification methods", value: methods.length ? methods.map((m) => humanize(m)).join(", ") : "none yet" }, { label: "Receipts", value: passport?.receiptNumbers.length ? passport.receiptNumbers.join(", ") : "none yet", mono: true }]} />
              <div className="mt-4 flex flex-wrap gap-1.5">
                {agent.capabilities.map((c) => (
                  <Badge key={c.id} tone="teal">
                    {humanize(c.category)}: {c.description}
                    {c.maxBudgetCents ? ` (up to ${formatMoney(c.maxBudgetCents, "USD")})` : ""}
                  </Badge>
                ))}
              </div>
            </CardBody>
          </Card>
        </>
      ) : (
        <Card>
          <CardBody>
            <KeyValue items={[{ label: "Model", value: agent.model }, { label: "Prompt version", value: agent.promptVersion }, { label: "Registered", value: formatDate(agent.registeredAt) }, { label: "Capabilities", value: agent.capabilities.map((c) => c.description).join("; ") || "role-specific" }]} />
          </CardBody>
        </Card>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Contracts in this workspace" />
          {contracts.length === 0 ? (
            <CardBody>
              <EmptyState title="No contracts with this agent yet" description="Contracts appear here once this agent is assigned as the worker." />
            </CardBody>
          ) : (
            <ul className="divide-y divide-border">
              {contracts.map((c) => (
                <li key={c.id} className="flex items-center gap-3 px-5 py-3">
                  <Link href={`/app/contracts/${c.id}`} className="min-w-0 flex-1 truncate text-sm font-medium text-ink hover:text-navy">
                    {c.title}
                  </Link>
                  <StatusBadge status={c.status} label={CONTRACT_STATUS_LABELS[c.status]} />
                  <span className="text-sm tabular-nums text-muted">{formatMoney(c.agreedAmountCents ?? c.budgetCents, c.currency)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Recent runs" />
          {runs.length === 0 ? (
            <CardBody>
              <EmptyState title="No runs yet" description="Every model session this agent performs is recorded." />
            </CardBody>
          ) : (
            <ul className="divide-y divide-border">
              {runs.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 px-5 py-2.5 text-sm">
                  <span className="text-ink">{humanize(r.purpose)}</span>
                  <StatusBadge status={r.status} />
                  <span className="truncate text-xs text-muted">{r.contract?.title}</span>
                  <span className="ml-auto text-xs text-faint">{r.inputTokens + r.outputTokens} tokens</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      {receipts.length ? (
        <Card className="mt-4">
          <CardHeader title="Receipts" />
          <ul className="divide-y divide-border">
            {receipts.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                <Link href={`/app/receipts/${r.receiptNumber}`} className="font-medium text-navy hover:underline">
                  {r.receiptNumber}
                </Link>
                <Mono>{r.captureRef}</Mono>
                <span className="ml-auto text-xs text-faint">{formatDate(r.settledAt)}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </>
  );
}
