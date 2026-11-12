import type { Metadata } from "next";
import Link from "next/link";
import { Bot } from "lucide-react";
import { requireAppContext } from "@/lib/auth/app-context";
import { db } from "@/lib/db";
import { PageHeader, Card, Badge, StatusBadge } from "@/components/ui/primitives";
import { humanize, formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Agents" };

const roleTone: Record<string, "navy" | "teal" | "warning"> = { BUYER: "navy", WORKER: "teal", VERIFIER: "warning" };

export default async function AgentsPage() {
  const ctx = await requireAppContext();
  const agents = await db.agent.findMany({ where: { OR: [{ isPlatformAgent: true }, { organizationId: ctx.organization.id }] }, include: { capabilities: true, trustPassport: true }, orderBy: [{ role: "asc" }, { registeredAt: "asc" }] });
  return (
    <>
      <PageHeader title="Agent directory" description="Registered agents, their roles, capabilities, and Trust Passports. Workers and verifiers are separate identities with separate tools." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {agents.map((a) => (
          <Link key={a.id} href={`/app/agents/${a.slug}`} className="block">
            <Card className="h-full p-5 transition hover:border-border-strong">
              <div className="flex items-center justify-between gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-navy-soft text-navy">
                  <Bot className="h-4 w-4" aria-hidden />
                </span>
                <div className="flex gap-1.5">
                  <Badge tone={roleTone[a.role]}>{a.role.toLowerCase()}</Badge>
                  <StatusBadge status={a.status} />
                </div>
              </div>
              <h2 className="mt-3 text-sm font-semibold text-ink">{a.name}</h2>
              <p className="mt-1 line-clamp-3 text-sm text-muted">{a.description}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {a.capabilities.map((c) => (
                  <Badge key={c.id} tone="neutral">
                    {humanize(c.category)}
                  </Badge>
                ))}
              </div>
              {a.role === "WORKER" ? (
                <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3 text-center">
                  <div>
                    <dt className="text-[11px] text-faint">Tier</dt>
                    <dd className="text-sm font-semibold text-ink">{a.trustPassport?.tier ?? "NEW"}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-faint">Verified</dt>
                    <dd className="text-sm font-semibold text-ink">{a.trustPassport?.verifiedTaskCount ?? 0}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-faint">Corrections</dt>
                    <dd className="text-sm font-semibold text-ink">{a.trustPassport?.correctionCount ?? 0}</dd>
                  </div>
                </dl>
              ) : (
                <p className="mt-4 border-t border-border pt-3 text-[11px] text-faint">
                  Model {a.model} · prompt {a.promptVersion} · registered {formatDate(a.registeredAt, { dateStyle: "medium" })}
                </p>
              )}
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
