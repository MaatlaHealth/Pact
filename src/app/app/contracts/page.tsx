import type { Metadata } from "next";
import Link from "next/link";
import { FileText } from "lucide-react";
import { requireAppContext } from "@/lib/auth/app-context";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { CONTRACT_STATUS_LABELS, PAYMENT_STATE_LABELS, ACTIVE_CONTRACT_STATUSES } from "@/lib/policy/state-machine";
import { formatDate, humanize } from "@/lib/utils";
import { PageHeader, Card, EmptyState, StatusBadge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Contracts" };

export default async function ContractsPage() {
  const ctx = await requireAppContext();
  const contracts = await db.contract.findMany({ where: { organizationId: ctx.organization.id }, orderBy: { createdAt: "desc" }, take: 200, include: { workerAgent: { select: { name: true } }, receipt: { select: { receiptNumber: true } } } });
  return (
    <>
      <PageHeader title="Contracts" description="Every task you delegated, with its contract, payment, and verification state." actions={<Link href="/app/contracts/new"><Button>New contract</Button></Link>} />
      {contracts.length === 0 ? (
        <EmptyState icon={<FileText className="h-5 w-5" />} title="No contracts yet" description="Describe a task and a budget. The contract generator drafts acceptance criteria for you to approve." action={<Link href="/app/contracts/new"><Button>Create your first contract</Button></Link>} />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-2 text-[11px] uppercase tracking-wide text-faint">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Contract</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Payment</th>
                  <th className="px-4 py-2.5 font-medium">Verification</th>
                  <th className="px-4 py-2.5 font-medium text-right">Amount</th>
                  <th className="px-4 py-2.5 font-medium">Worker</th>
                  <th className="px-4 py-2.5 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {contracts.map((c) => (
                  <tr key={c.id} className="border-t border-border hover:bg-surface-2/60">
                    <td className="max-w-[320px] px-4 py-3">
                      <Link href={`/app/contracts/${c.id}`} className="block truncate font-medium text-ink hover:text-navy">
                        {c.title}
                      </Link>
                      <p className="text-[11px] text-faint">
                        {humanize(c.category)}
                        {c.isDemo ? " · demo workspace" : ""}
                        {c.receipt ? ` · ${c.receipt.receiptNumber}` : ""}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={c.status} label={CONTRACT_STATUS_LABELS[c.status]} live={ACTIVE_CONTRACT_STATUSES.includes(c.status)} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={c.paymentState} label={PAYMENT_STATE_LABELS[c.paymentState]} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={c.verificationState} />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink">{formatMoney(c.agreedAmountCents ?? c.budgetCents, c.currency)}</td>
                    <td className="px-4 py-3 text-muted">{c.workerAgent?.name ?? "Not assigned"}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted">{formatDate(c.createdAt, { dateStyle: "medium" })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
