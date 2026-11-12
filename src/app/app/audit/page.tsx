import type { Metadata } from "next";
import Link from "next/link";
import { requireAppContext } from "@/lib/auth/app-context";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/utils";
import { PageHeader, Card, EmptyState, StatusBadge, Badge, Mono } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Audit history" };

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ actor?: string; q?: string; page?: string }> }) {
  const ctx = await requireAppContext();
  const { actor, q, page } = await searchParams;
  const pageNum = Math.max(1, Number(page ?? 1));
  const take = 50;
  const where = {
    organizationId: ctx.organization.id,
    ...(actor && ["USER", "AGENT", "SYSTEM", "WEBHOOK"].includes(actor) ? { actorType: actor as never } : {}),
    ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" as const } }, { action: { contains: q, mode: "insensitive" as const } }, { description: { contains: q, mode: "insensitive" as const } }] } : {}),
  };
  const [events, total] = await Promise.all([db.auditEvent.findMany({ where, orderBy: { createdAt: "desc" }, skip: (pageNum - 1) * take, take }), db.auditEvent.count({ where })]);
  const pages = Math.max(1, Math.ceil(total / take));
  const link = (p: number) => `/app/audit?${new URLSearchParams({ ...(actor ? { actor } : {}), ...(q ? { q } : {}), page: String(p) }).toString()}`;
  return (
    <>
      <PageHeader title="Audit history" description={`${total} recorded events in this workspace. Every row is a real event written by the application, an agent, the policy engine, or a webhook.`} />
      <form className="mb-4 flex flex-wrap gap-2" method="get">
        <input type="search" name="q" defaultValue={q} placeholder="Search titles and actions" aria-label="Search" className="h-10 w-64 rounded-lg border border-border bg-surface px-3 text-sm" />
        <select name="actor" defaultValue={actor ?? ""} aria-label="Actor type" className="h-10 rounded-lg border border-border bg-surface px-3 text-sm">
          <option value="">All actors</option>
          <option value="USER">People</option>
          <option value="AGENT">Agents</option>
          <option value="SYSTEM">System and policy engine</option>
          <option value="WEBHOOK">PayPal webhooks</option>
        </select>
        <button type="submit" className="h-10 rounded-lg border border-border bg-surface px-4 text-sm font-medium text-ink hover:border-border-strong">
          Filter
        </button>
      </form>
      {events.length === 0 ? (
        <EmptyState title="No events match" description="Adjust the filters, or create a contract to generate activity." />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-2 text-[11px] uppercase tracking-wide text-faint">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Time</th>
                  <th className="px-4 py-2.5 font-medium">Actor</th>
                  <th className="px-4 py-2.5 font-medium">Action</th>
                  <th className="px-4 py-2.5 font-medium">Event</th>
                  <th className="px-4 py-2.5 font-medium">Severity</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id} className="border-t border-border align-top">
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs text-muted">{formatDate(e.createdAt, { dateStyle: "medium", timeStyle: "medium" })}</td>
                    <td className="px-4 py-2.5">
                      <Badge tone={e.actorType === "AGENT" ? "teal" : e.actorType === "USER" ? "navy" : "neutral"}>{e.actorLabel ?? e.actorType.toLowerCase()}</Badge>
                    </td>
                    <td className="px-4 py-2.5">
                      <Mono>{e.action}</Mono>
                    </td>
                    <td className="max-w-[460px] px-4 py-2.5">
                      <p className="text-ink">{e.title}</p>
                      {e.description ? <p className="mt-0.5 text-xs text-muted">{e.description}</p> : null}
                      {e.contractId ? (
                        <Link href={`/app/contracts/${e.contractId}`} className="text-[11px] text-navy hover:underline">
                          open contract
                        </Link>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={e.severity === "INFO" ? "NONE" : e.severity === "NOTICE" ? "ESTABLISHED" : e.severity === "WARNING" ? "PENDING" : "FAILED"} label={e.severity.toLowerCase()} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pages > 1 ? (
            <div className="flex items-center justify-between border-t border-border px-4 py-2 text-xs text-muted">
              <span>
                Page {pageNum} of {pages}
              </span>
              <div className="flex gap-2">
                {pageNum > 1 ? <Link href={link(pageNum - 1)} className="text-navy hover:underline">Previous</Link> : null}
                {pageNum < pages ? <Link href={link(pageNum + 1)} className="text-navy hover:underline">Next</Link> : null}
              </div>
            </div>
          ) : null}
        </Card>
      )}
    </>
  );
}
