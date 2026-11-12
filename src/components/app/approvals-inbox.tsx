"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, EmptyState, StatusBadge, Badge } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/client/api";
import { formatMoney } from "@/lib/money";
import { formatDate, humanize } from "@/lib/utils";

interface Approval {
  id: string;
  kind: string;
  status: string;
  title: string;
  description: string;
  requestedAt: string;
  decidedAt: string | null;
  decidedByName: string | null;
  decisionNote: string | null;
  contract: { id: string; title: string; status: string; agreedAmountCents: number | null; budgetCents: number; currency: string };
}

export function ApprovalsInbox({ approvals, canDecide }: { approvals: Approval[]; canDecide: boolean }) {
  const router = useRouter();
  const { push } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const pending = approvals.filter((a) => a.status === "PENDING");
  const decided = approvals.filter((a) => a.status !== "PENDING");

  const decide = async (id: string, decision: "APPROVED" | "REJECTED") => {
    const note = decision === "REJECTED" ? window.prompt("Reason for rejecting:") ?? "" : undefined;
    if (decision === "REJECTED" && !note) return;
    setBusy(id);
    try {
      const r = await api<{ outcome: string; capture?: { outcome: string; detail: string } }>("/api/approvals", { method: "POST", body: { approvalId: id, decision, note } });
      push({ kind: "success", title: decision === "APPROVED" ? "Approved" : "Rejected", description: r.capture?.detail });
      router.refresh();
    } catch (err) {
      push({ kind: "error", title: err instanceof ApiError ? err.message : "Decision failed" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title={`Pending (${pending.length})`} description={canDecide ? "Approving a capture request asks the policy engine again; it does not move money by itself." : "Only admins and owners can decide approvals."} />
        {pending.length === 0 ? (
          <div className="p-5">
            <EmptyState icon={<CheckSquare className="h-5 w-5" />} title="Nothing waiting on you" description="Requests appear when the policy engine needs a human decision." />
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {pending.map((a) => (
              <li key={a.id} className="flex flex-wrap items-start gap-4 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="warning">{humanize(a.kind)}</Badge>
                    <Link href={`/app/contracts/${a.contract.id}`} className="text-sm font-medium text-ink hover:text-navy">
                      {a.contract.title}
                    </Link>
                    <span className="text-xs text-muted">{formatMoney(a.contract.agreedAmountCents ?? a.contract.budgetCents, a.contract.currency)}</span>
                  </div>
                  <p className="mt-1 text-sm text-ink-2">{a.title}</p>
                  <p className="text-xs text-muted">{a.description}</p>
                  <p className="mt-1 text-[11px] text-faint">Requested {formatDate(a.requestedAt)}</p>
                </div>
                {canDecide ? (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => decide(a.id, "APPROVED")} loading={busy === a.id}>
                      Approve
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => decide(a.id, "REJECTED")} disabled={busy === a.id}>
                      Reject
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
      {decided.length ? (
        <Card>
          <CardHeader title="Decided" />
          <ul className="divide-y divide-border">
            {decided.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2 px-5 py-3 text-sm">
                <StatusBadge status={a.status} />
                <Badge tone="neutral">{humanize(a.kind)}</Badge>
                <Link href={`/app/contracts/${a.contract.id}`} className="font-medium text-ink hover:text-navy">
                  {a.contract.title}
                </Link>
                <span className="ml-auto text-xs text-faint">
                  {a.decidedByName ?? "system"} · {a.decidedAt ? formatDate(a.decidedAt) : ""}
                  {a.decisionNote ? ` · ${a.decisionNote}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
