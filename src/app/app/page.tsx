import type { Metadata } from "next";
import Link from "next/link";
import { FileText, ArrowRight, CheckCircle2, AlertCircle, PiggyBank, Lock, Wallet, Activity } from "lucide-react";
import { requireAppContext } from "@/lib/auth/app-context";
import { db } from "@/lib/db";
import { integrationStatuses } from "@/lib/env";
import { formatMoney } from "@/lib/money";
import { ACTIVE_CONTRACT_STATUSES, CONTRACT_STATUS_LABELS } from "@/lib/policy/state-machine";
import { PageHeader, Stat, Card, CardHeader, CardBody, EmptyState, StatusBadge, TextLink } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { ActivityList } from "@/components/app/activity-list";
import { VerificationRateChart } from "@/components/app/charts";

export const metadata: Metadata = { title: "Overview" };

export default async function OverviewPage() {
  const ctx = await requireAppContext();
  const orgId = ctx.organization.id;
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  const [policy, captured, authorized, active, pendingApprovals, verificationRuns, recent, contracts, receipts] = await Promise.all([
    db.spendingPolicy.findUniqueOrThrow({ where: { organizationId: orgId } }),
    db.payPalCapture.aggregate({ _sum: { amountCents: true }, _count: true, where: { status: "COMPLETED", createdAt: { gte: monthStart }, authorization: { order: { organizationId: orgId } } } }),
    db.contract.aggregate({ _sum: { agreedAmountCents: true }, _count: true, where: { organizationId: orgId, paymentState: { in: ["AUTHORIZED", "CAPTURE_PENDING", "CAPTURE_UNCERTAIN"] } } }),
    db.contract.count({ where: { organizationId: orgId, status: { in: ACTIVE_CONTRACT_STATUSES } } }),
    db.approvalRequest.count({ where: { organizationId: orgId, status: "PENDING" } }),
    db.verificationRun.groupBy({ by: ["status"], _count: true, where: { contract: { organizationId: orgId } } }),
    db.auditEvent.findMany({ where: { organizationId: orgId }, orderBy: { createdAt: "desc" }, take: 10 }),
    db.contract.findMany({ where: { organizationId: orgId }, orderBy: { updatedAt: "desc" }, take: 6, include: { workerAgent: { select: { name: true } } } }),
    db.receipt.count({ where: { organizationId: orgId } }),
  ]);
  const capturedCents = captured._sum.amountCents ?? 0;
  const authorizedCents = authorized._sum.agreedAmountCents ?? 0;
  const available = Math.max(0, policy.monthlyBudgetCents - capturedCents - authorizedCents);
  const passed = verificationRuns.find((v) => v.status === "PASSED")?._count ?? 0;
  const failed = verificationRuns.find((v) => v.status === "FAILED")?._count ?? 0;
  const integrations = integrationStatuses();
  const isEmpty = contracts.length === 0;

  return (
    <>
      <PageHeader title="Overview" description={`${ctx.organization.name}. Numbers are computed from this workspace's own records for the current month.`} actions={<Link href="/app/contracts/new"><Button>New contract</Button></Link>} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Available budget this month" value={formatMoney(available, policy.currency)} hint={`of ${formatMoney(policy.monthlyBudgetCents, policy.currency)} monthly budget`} icon={<PiggyBank className="h-4 w-4" aria-hidden />} />
        <Stat label="Authorized, not captured" value={formatMoney(authorizedCents, policy.currency)} hint={`${authorized._count} active authorization${authorized._count === 1 ? "" : "s"}`} tone={authorizedCents > 0 ? "warning" : undefined} icon={<Lock className="h-4 w-4" aria-hidden />} />
        <Stat label="Captured this month" value={formatMoney(capturedCents, policy.currency)} hint={`${captured._count} PayPal capture${captured._count === 1 ? "" : "s"}, ${receipts} receipt${receipts === 1 ? "" : "s"} total`} tone={capturedCents > 0 ? "success" : undefined} icon={<Wallet className="h-4 w-4" aria-hidden />} />
        <Stat label="Active contracts" value={active} hint={pendingApprovals ? `${pendingApprovals} awaiting your approval` : "No pending approvals"} tone={pendingApprovals ? "warning" : undefined} icon={<Activity className="h-4 w-4" aria-hidden />} />
      </div>

      {isEmpty ? (
        <div className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <Card>
            <CardHeader title="Get started" description="Three steps to your first verified, policy-governed payment." />
            <CardBody>
              <ol className="space-y-4">
                {[
                  { title: "Review the spending policy", body: "Set the transaction cap, monthly budget, and whether captures need your approval.", href: "/app/settings", cta: "Open settings" },
                  { title: "Delegate a task with a budget", body: "Describe a landing page or dataset. Gemini drafts the contract; you approve it.", href: "/app/contracts/new", cta: "New contract" },
                  { title: "Authorize with PayPal sandbox", body: "Approve the order as the sandbox payer. Work starts; capture waits for verification.", href: "/app/payments", cta: "Payments" },
                ].map((s, i) => (
                  <li key={s.title} className="flex gap-4">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-navy-soft text-xs font-semibold text-navy">{i + 1}</span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-ink">{s.title}</p>
                      <p className="text-sm text-muted">{s.body}</p>
                      <Link href={s.href} className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-navy hover:underline">
                        {s.cta} <ArrowRight className="h-3 w-3" aria-hidden />
                      </Link>
                    </div>
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Integration status" description="What this deployment can do right now." />
            <CardBody className="space-y-2">
              {integrations.map((s) => (
                <div key={s.name} className="flex items-start gap-2 text-sm">
                  {s.configured ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />}
                  <div>
                    <p className="font-medium capitalize text-ink">{s.name.replace(/([A-Z])/g, " $1")}</p>
                    <p className="text-xs text-muted">{s.detail}</p>
                  </div>
                </div>
              ))}
            </CardBody>
          </Card>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <Card>
            <CardHeader title="Recent contracts" action={<TextLink href="/app/contracts">View all</TextLink>} />
            <ul className="divide-y divide-border">
              {contracts.map((c) => (
                <li key={c.id}>
                  <Link href={`/app/contracts/${c.id}`} className="flex items-center gap-4 px-5 py-3 hover:bg-surface-2">
                    <FileText className="h-4 w-4 shrink-0 text-faint" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{c.title}</p>
                      <p className="text-xs text-muted">
                        {c.workerAgent?.name ?? "No worker yet"} · {formatMoney(c.agreedAmountCents ?? c.budgetCents, c.currency)}
                      </p>
                    </div>
                    <StatusBadge status={c.status} label={CONTRACT_STATUS_LABELS[c.status]} live={ACTIVE_CONTRACT_STATUSES.includes(c.status)} />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
          <div className="space-y-4">
            <Card>
              <CardHeader title="Verification outcomes" description="Completed verification runs in this workspace." />
              <CardBody>{passed + failed === 0 ? <EmptyState title="No verification runs yet" description="Runs appear once a worker submits a deliverable." /> : <VerificationRateChart passed={passed} failed={failed} />}</CardBody>
            </Card>
          </div>
        </div>
      )}

      <Card className="mt-6">
        <CardHeader title="Recent activity" description="Latest audit events across the workspace." action={<TextLink href="/app/activity">Live view</TextLink>} />
        <CardBody>{recent.length === 0 ? <EmptyState title="Nothing recorded yet" description="Every action by you, an agent, the policy engine, or PayPal is logged here." /> : <ActivityList events={recent.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() }))} />}</CardBody>
      </Card>
    </>
  );
}
