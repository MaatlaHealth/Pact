import type { Metadata } from "next";
import Link from "next/link";
import { ScrollText } from "lucide-react";
import { requireAppContext } from "@/lib/auth/app-context";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/utils";
import { PageHeader, Card, EmptyState, Mono } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Receipts" };

export default async function ReceiptsPage() {
  const ctx = await requireAppContext();
  const receipts = await db.receipt.findMany({ where: { organizationId: ctx.organization.id }, orderBy: { createdAt: "desc" }, take: 200, include: { contract: { select: { id: true, title: true } }, workerAgent: { select: { name: true } } } });
  return (
    <>
      <PageHeader title="Proof of Work Receipts" description="Signed records of what was promised, delivered, verified, approved, and paid. Download as JSON for verification or PDF for reading." />
      {receipts.length === 0 ? (
        <EmptyState icon={<ScrollText className="h-5 w-5" />} title="No receipts yet" description="A receipt is issued automatically when PayPal confirms a capture." />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-2 text-[11px] uppercase tracking-wide text-faint">
              <tr>
                <th className="px-4 py-2.5 font-medium">Receipt</th>
                <th className="px-4 py-2.5 font-medium">Contract</th>
                <th className="px-4 py-2.5 font-medium">Worker</th>
                <th className="px-4 py-2.5 font-medium text-right">Amount</th>
                <th className="px-4 py-2.5 font-medium">Capture</th>
                <th className="px-4 py-2.5 font-medium">Settled</th>
              </tr>
            </thead>
            <tbody>
              {receipts.map((r) => {
                const payment = (r.payload as { payment: { amountCents: number; currency: string } }).payment;
                return (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-4 py-3">
                      <Link href={`/app/receipts/${r.receiptNumber}`} className="font-medium text-navy hover:underline">
                        {r.receiptNumber}
                      </Link>
                    </td>
                    <td className="max-w-[240px] px-4 py-3">
                      <Link href={`/app/contracts/${r.contract.id}`} className="block truncate text-ink hover:text-navy">
                        {r.contract.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted">{r.workerAgent.name}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink">{formatMoney(payment.amountCents, payment.currency)}</td>
                    <td className="px-4 py-3">
                      <Mono>{r.captureRef}</Mono>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted">{formatDate(r.settledAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
