"use client";

import { useState } from "react";
import { CheckCircle2, XCircle, HelpCircle, Image as ImageIcon, FileJson } from "lucide-react";
import { Card, CardHeader, CardBody, Badge, StatusBadge, Mono, EmptyState } from "@/components/ui/primitives";
import { METHOD_LABELS } from "@/lib/verification/methods";
import { formatDate, humanize } from "@/lib/utils";
import type { ContractDetail } from "@/lib/contracts/loaders";

type Run = ContractDetail["verificationRuns"][number];

export function VerificationPanel({ runs, criteria }: { runs: Run[]; criteria: ContractDetail["versions"][number]["criteria"] }) {
  const [openRun, setOpenRun] = useState<string | null>(runs[0]?.id ?? null);
  if (runs.length === 0) return <EmptyState title="No verification runs yet" description="A run is created the moment the worker submits a deliverable. Each attempt is kept separately." />;
  return (
    <div className="space-y-4">
      {runs.map((run) => {
        const report = run.report as { summary?: string; failures?: { key: string; reason: string; fix: string }[]; correctionRequest?: string } | null;
        const passed = run.results.filter((r) => r.passed === true).length;
        const expanded = openRun === run.id;
        return (
          <Card key={run.id}>
            <button type="button" className="w-full text-left" onClick={() => setOpenRun(expanded ? null : run.id)} aria-expanded={expanded}>
              <CardHeader
                title={
                  <span className="flex flex-wrap items-center gap-2">
                    Attempt {run.attempt}
                    <StatusBadge status={run.status} />
                    {run.recommendation ? <Badge tone="neutral">Recommends {humanize(run.recommendation)}</Badge> : null}
                  </span>
                }
                description={`${passed} of ${run.results.length} criteria passed · ${run.evidence.length} evidence records · ${run.finishedAt ? formatDate(run.finishedAt) : run.startedAt ? "running" : "queued"}`}
              />
            </button>
            {expanded ? (
              <CardBody className="space-y-4">
                {run.summary ? <p className="text-sm text-ink-2">{run.summary}</p> : null}
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {run.results.map((r) => {
                    const criterion = criteria.find((c) => c.key === r.criterionKey);
                    const details = r.details as Record<string, unknown>;
                    const evidence = run.evidence.filter((e) => e.resultId === r.id);
                    return (
                      <li key={r.id} className="p-3">
                        <div className="flex items-start gap-2">
                          {r.passed === true ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden /> : r.passed === false ? <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden /> : <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />}
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-medium text-ink">{METHOD_LABELS[r.method]}</p>
                              <Mono>{r.criterionKey}</Mono>
                              {criterion ? <Badge tone={criterion.kind === "OBJECTIVE" ? "teal" : "warning"}>{criterion.kind.toLowerCase()}</Badge> : null}
                              {r.score !== null && r.score !== undefined ? <Badge tone="neutral">score {Math.round(r.score * 10) / 10}</Badge> : null}
                            </div>
                            {criterion ? <p className="mt-0.5 text-xs text-muted">{criterion.description}</p> : null}
                            <DetailSummary details={details} />
                            {evidence.length ? (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {evidence.map((e) => (
                                  <a key={e.id} href={`/api/evidence/${e.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-ink-2 hover:border-border-strong" title={e.contentHash}>
                                    {e.mimeType.startsWith("image/") ? <ImageIcon className="h-3 w-3" aria-hidden /> : <FileJson className="h-3 w-3" aria-hidden />}
                                    {e.label}
                                  </a>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                {report?.failures?.length ? (
                  <div className="rounded-lg border border-warning/30 bg-warning-soft/40 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-warning">Correction request sent to the worker</p>
                    <ul className="mt-2 space-y-1.5 text-sm text-ink-2">
                      {report.failures.map((f) => (
                        <li key={f.key}>
                          <Mono>{f.key}</Mono> {f.reason} <span className="text-muted">Fix: {f.fix}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <ScreenshotGallery evidence={run.evidence} />
              </CardBody>
            ) : null}
          </Card>
        );
      })}
    </div>
  );
}

function DetailSummary({ details }: { details: Record<string, unknown> }) {
  const entries = Object.entries(details).filter(([k, v]) => !["entries", "sections", "viewports", "links", "working", "failingAudits", "metrics", "items", "stats", "brokenLinks", "examples", "structuralProblems"].includes(k) && v !== undefined && v !== null && typeof v !== "object");
  if (entries.length === 0 && !details.reason) return null;
  return (
    <p className="mt-1 text-xs text-muted">
      {entries.map(([k, v]) => `${k}: ${String(v)}`).join(" · ")}
      {Array.isArray(details.missing) && details.missing.length ? ` · missing: ${(details.missing as string[]).join(", ")}` : ""}
      {Array.isArray(details.structuralProblems) && details.structuralProblems.length ? ` · ${(details.structuralProblems as string[]).join(" ")}` : ""}
      {Array.isArray(details.problems) && details.problems.length ? ` · ${(details.problems as string[]).join(" ")}` : ""}
    </p>
  );
}

function ScreenshotGallery({ evidence }: { evidence: Run["evidence"] }) {
  const shots = evidence.filter((e) => e.mimeType === "image/png");
  if (shots.length === 0) return null;
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">Screenshots taken by the verifier</p>
      <div className="grid gap-3 sm:grid-cols-3">
        {shots.slice(0, 6).map((e) => (
          <a key={e.id} href={`/api/evidence/${e.id}`} target="_blank" rel="noreferrer" className="group overflow-hidden rounded-lg border border-border bg-surface-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/evidence/${e.id}`} alt={e.label} className="h-40 w-full object-cover object-top transition group-hover:opacity-90" loading="lazy" />
            <p className="truncate px-2 py-1 text-[11px] text-muted">{e.label}</p>
          </a>
        ))}
      </div>
    </div>
  );
}
