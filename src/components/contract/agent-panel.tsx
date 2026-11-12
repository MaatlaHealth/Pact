"use client";

import { useState } from "react";
import { Bot, Wrench, ArrowRight } from "lucide-react";
import { Card, CardHeader, CardBody, Badge, StatusBadge, EmptyState, Mono } from "@/components/ui/primitives";
import { formatDate, humanize, cn } from "@/lib/utils";
import type { ContractDetail } from "@/lib/contracts/loaders";

const roleTone: Record<string, "navy" | "teal" | "warning"> = { BUYER: "navy", WORKER: "teal", VERIFIER: "warning" };

export function AgentPanel({ contract }: { contract: ContractDetail }) {
  const [runOpen, setRunOpen] = useState<string | null>(null);
  if (contract.runs.length === 0) return <EmptyState title="No agent runs yet" description="Runs start after you approve the contract. Every model call, message, and tool execution is recorded here with a correlation ID." />;
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Messages between agents" description="Persisted as they were sent. Nothing here is scripted." />
        <CardBody>
          {contract.messages.length === 0 ? (
            <p className="text-sm text-muted">No messages yet.</p>
          ) : (
            <ol className="space-y-3">
              {contract.messages.map((m) => (
                <li key={m.id} className={cn("rounded-lg border border-border p-3", m.fromAgent.role === "WORKER" ? "ml-0 sm:ml-10" : "mr-0 sm:mr-10")}>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Badge tone={roleTone[m.fromAgent.role]}>
                      <Bot className="h-3 w-3" aria-hidden /> {m.fromAgent.name}
                    </Badge>
                    {m.toAgent ? (
                      <>
                        <ArrowRight className="h-3 w-3 text-faint" aria-hidden />
                        <span className="text-muted">{m.toAgent.name}</span>
                      </>
                    ) : null}
                    <Badge tone="neutral">{humanize(m.kind)}</Badge>
                    <span className="ml-auto text-faint">{formatDate(m.createdAt)}</span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink-2">{m.content.length > 1200 ? `${m.content.slice(0, 1200)}...` : m.content}</p>
                </li>
              ))}
            </ol>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Agent runs and tool executions" description="Token usage is reported by the model API per run." />
        <ul className="divide-y divide-border">
          {contract.runs.map((run) => {
            const open = runOpen === run.id;
            return (
              <li key={run.id}>
                <button type="button" onClick={() => setRunOpen(open ? null : run.id)} aria-expanded={open} className="flex w-full flex-wrap items-center gap-2 px-5 py-3 text-left hover:bg-surface-2">
                  <Badge tone={roleTone[run.agent.role]}>{run.agent.name}</Badge>
                  <span className="text-sm text-ink">{humanize(run.purpose)}</span>
                  <StatusBadge status={run.status} live={run.status === "RUNNING"} />
                  <span className="ml-auto text-xs text-faint">
                    {run.iterations} iteration{run.iterations === 1 ? "" : "s"} · {run.inputTokens + run.outputTokens} tokens · {run.toolExecutions.length} tool call{run.toolExecutions.length === 1 ? "" : "s"}
                  </span>
                </button>
                {open ? (
                  <div className="space-y-2 bg-surface-2/50 px-5 py-3">
                    <p className="text-xs text-muted">
                      Model <Mono>{run.model}</Mono> · correlation <Mono>{run.correlationId}</Mono> · {run.startedAt ? formatDate(run.startedAt) : "not started"}
                      {run.error ? <span className="text-danger"> · {run.error}</span> : null}
                    </p>
                    {run.summary ? <p className="text-sm text-ink-2">{run.summary}</p> : null}
                    {run.toolExecutions.length ? (
                      <ul className="space-y-1">
                        {run.toolExecutions.map((t) => (
                          <li key={t.id} className="flex flex-wrap items-center gap-2 text-xs">
                            <Wrench className="h-3 w-3 text-faint" aria-hidden />
                            <Mono>{t.toolName}</Mono>
                            <StatusBadge status={t.status} />
                            <span className="text-faint">{t.durationMs !== null ? `${t.durationMs} ms` : ""}</span>
                            <span className="truncate text-muted">{JSON.stringify(t.input).slice(0, 120)}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
