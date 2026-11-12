import { CheckCircle2, XCircle, UserCheck } from "lucide-react";
import { Card, CardHeader, CardBody, Badge } from "@/components/ui/primitives";
import { formatDate, humanize } from "@/lib/utils";

export interface DecisionView {
  id: string;
  action: string;
  outcome: string;
  rules: unknown;
  engineVersion: string;
  decidedAt: Date | string;
}

interface Rule {
  id: string;
  description: string;
  passed: boolean;
  severity: "deny" | "human";
  detail?: string;
}

export function PolicyExplainer({ decision, compact }: { decision: DecisionView | null; compact?: boolean }) {
  if (!decision) {
    return (
      <Card>
        <CardHeader title="Policy engine" description="No decision recorded yet. The engine evaluates every lifecycle action and records its rules here." />
      </Card>
    );
  }
  const rules = (decision.rules as Rule[]) ?? [];
  const failing = rules.filter((r) => !r.passed);
  const tone = decision.outcome === "ALLOW" ? "success" : decision.outcome === "DENY" ? "danger" : "warning";
  const headline = decision.outcome === "ALLOW" ? `Allowed: ${humanize(decision.action)}` : decision.outcome === "DENY" ? `Blocked: ${humanize(decision.action)}` : `Human approval required: ${humanize(decision.action)}`;
  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            {decision.outcome === "ALLOW" ? <CheckCircle2 className="h-4 w-4 text-success" aria-hidden /> : decision.outcome === "DENY" ? <XCircle className="h-4 w-4 text-danger" aria-hidden /> : <UserCheck className="h-4 w-4 text-warning" aria-hidden />}
            {headline}
          </span>
        }
        description={`Policy engine ${decision.engineVersion}, ${formatDate(decision.decidedAt)}. ${rules.length} rules evaluated, ${failing.length} not satisfied.`}
        action={<Badge tone={tone}>{humanize(decision.outcome)}</Badge>}
      />
      <CardBody>
        {failing.length === 0 ? (
          <p className="text-sm text-muted">Every rule passed. The engine permitted the action without needing a person.</p>
        ) : (
          <ul className="space-y-2">
            {failing.map((r) => (
              <li key={r.id} className="flex gap-2 text-sm">
                {r.severity === "deny" ? <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden /> : <UserCheck className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />}
                <div>
                  <p className="text-ink">{r.description}</p>
                  {r.detail ? <p className="text-xs text-muted">{r.detail}</p> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
        {!compact ? (
          <details className="mt-4">
            <summary className="cursor-pointer text-xs font-medium text-navy">All {rules.length} rules</summary>
            <ul className="mt-2 grid gap-1 sm:grid-cols-2">
              {rules.map((r) => (
                <li key={r.id} className="flex items-start gap-2 text-xs">
                  {r.passed ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" aria-hidden /> : <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger" aria-hidden />}
                  <span className="text-muted">
                    <span className="font-mono text-[11px] text-ink">{r.id}</span> {r.detail ?? r.description}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </CardBody>
    </Card>
  );
}
