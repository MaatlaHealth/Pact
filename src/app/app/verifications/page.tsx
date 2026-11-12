import type { Metadata } from "next";
import Link from "next/link";
import { FileCheck2 } from "lucide-react";
import { requireAppContext } from "@/lib/auth/app-context";
import { db } from "@/lib/db";
import { formatDate, humanize } from "@/lib/utils";
import { PageHeader, Card, EmptyState, StatusBadge, Badge } from "@/components/ui/primitives";
import { VerificationRateChart } from "@/components/app/charts";

export const metadata: Metadata = { title: "Verifications" };

export default async function VerificationsPage() {
  const ctx = await requireAppContext();
  const runs = await db.verificationRun.findMany({ where: { contract: { organizationId: ctx.organization.id } }, orderBy: { createdAt: "desc" }, take: 200, include: { contract: { select: { id: true, title: true } }, results: { select: { passed: true } }, _count: { select: { evidence: true } } } });
  const passed = runs.filter((r) => r.status === "PASSED").length;
  const failed = runs.filter((r) => r.status === "FAILED").length;
  return (
    <>
      <PageHeader title="Verifications" description="Every verification attempt across the workspace. Attempts are never overwritten." />
      {runs.length === 0 ? (
        <EmptyState icon={<FileCheck2 className="h-5 w-5" />} title="No verification runs yet" description="Runs are created when a worker submits a deliverable." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
          <Card className="overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-2 text-[11px] uppercase tracking-wide text-faint">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Contract</th>
                  <th className="px-4 py-2.5 font-medium">Attempt</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Criteria</th>
                  <th className="px-4 py-2.5 font-medium">Evidence</th>
                  <th className="px-4 py-2.5 font-medium">Finished</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="max-w-[280px] px-4 py-3">
                      <Link href={`/app/contracts/${r.contract.id}`} className="block truncate font-medium text-ink hover:text-navy">
                        {r.contract.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted">{r.attempt}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={r.status} live={r.status === "RUNNING"} />
                      {r.recommendation ? <Badge tone="neutral" className="ml-1">{humanize(r.recommendation)}</Badge> : null}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-muted">
                      {r.results.filter((x) => x.passed === true).length}/{r.results.length} passed
                    </td>
                    <td className="px-4 py-3 text-muted">{r._count.evidence}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted">{r.finishedAt ? formatDate(r.finishedAt) : "in progress"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <Card className="p-5">
            <p className="text-sm font-semibold text-ink">Outcomes</p>
            <div className="mt-3">
              <VerificationRateChart passed={passed} failed={failed} />
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
