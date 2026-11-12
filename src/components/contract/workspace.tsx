"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, RefreshCw, Download } from "lucide-react";
import type { MembershipRole } from "@/generated/prisma/client";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardBody, StatusBadge, Callout, KeyValue, Mono, Badge, EmptyState } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/client/api";
import { formatMoney } from "@/lib/money";
import { formatDate, humanize, cn } from "@/lib/utils";
import { CONTRACT_STATUS_LABELS, PAYMENT_STATE_LABELS, VERIFICATION_STATE_LABELS, VOIDABLE_CONTRACT_STATUSES, ACTIVE_CONTRACT_STATUSES } from "@/lib/policy/state-machine";
import type { ContractDetail } from "@/lib/contracts/loaders";
import type { ContractContent } from "@/lib/contracts/schema";
import { METHOD_LABELS } from "@/lib/verification/methods";
import { PipelineStrip } from "@/components/contract/pipeline-strip";
import { PolicyExplainer } from "@/components/contract/policy-explainer";
import { ContractEditor } from "@/components/contract/contract-editor";
import { VerificationPanel } from "@/components/contract/verification-panel";
import { PaymentPanel } from "@/components/contract/payment-panel";
import { AgentPanel } from "@/components/contract/agent-panel";
import { ActivityList, type ActivityItem } from "@/components/app/activity-list";

type Tab = "timeline" | "contract" | "agents" | "verification" | "payment" | "receipt";

interface Props {
  initial: ContractDetail;
  scenario: string;
  role: MembershipRole;
  integrations: Record<string, boolean>;
  initialEvents: ActivityItem[];
  paymentReturn: { status: string; message: string | null } | null;
}

export function ContractWorkspace({ initial, scenario, role, integrations, initialEvents, paymentReturn }: Props) {
  const router = useRouter();
  const { push } = useToast();
  const [contract, setContract] = useState<ContractDetail>(initial);
  const [events, setEvents] = useState<ActivityItem[]>(initialEvents);
  const [tab, setTab] = useState<Tab>(initial.status === "AWAITING_APPROVAL" ? "contract" : "timeline");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const lastEventId = useRef<string | null>(initialEvents[initialEvents.length - 1]?.id ?? null);
  const refreshTimer = useRef<NodeJS.Timeout | null>(null);
  const isAdmin = role === "ADMIN" || role === "OWNER";

  const reload = useCallback(async () => {
    try {
      const data = await api<{ contract: ContractDetail }>(`/api/contracts/${initial.id}`);
      setContract(data.contract);
    } catch {
      // keep current state; next event will retry
    }
  }, [initial.id]);

  // Live updates via Server-Sent Events from the audit log.
  useEffect(() => {
    const url = `/api/contracts/${initial.id}/stream${lastEventId.current ? `?since=${lastEventId.current}` : ""}`;
    const source = new EventSource(url);
    source.addEventListener("ready", () => setConnected(true));
    source.addEventListener("activity", (e) => {
      const event = JSON.parse((e as MessageEvent).data) as ActivityItem;
      lastEventId.current = event.id;
      setEvents((prev) => (prev.some((x) => x.id === event.id) ? prev : [...prev, event]));
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => void reload(), 600);
    });
    source.onerror = () => setConnected(false);
    return () => {
      source.close();
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, [initial.id, reload]);

  const latestVersion = contract.versions[0];
  const approvedVersion = contract.versions.find((v) => v.id === contract.approvedVersionId) ?? latestVersion;
  const content = (approvedVersion?.content ?? latestVersion?.content) as unknown as ContractContent;
  const latestCaptureDecision = contract.policyDecisions.find((d) => d.action === "CAPTURE_PAYMENT") ?? contract.policyDecisions[0] ?? null;
  const pendingApprovals = contract.approvalRequests.filter((a) => a.status === "PENDING");
  const latestRun = contract.runs[contract.runs.length - 1];
  const [workerStuck, setWorkerStuck] = useState(false);
  useEffect(() => {
    const check = () => setWorkerStuck(["AUTHORIZED", "CORRECTION_REQUIRED"].includes(contract.status) && (!latestRun || latestRun.status !== "RUNNING") && Date.now() - new Date(contract.updatedAt).getTime() > 90_000);
    const initial = setTimeout(check, 0);
    const timer = setInterval(check, 15_000);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, [contract.status, contract.updatedAt, latestRun]);

  const act = async (action: string, options: { reason?: string; confirm?: string } = {}) => {
    if (options.confirm && !window.confirm(options.confirm)) return;
    setBusy(action);
    try {
      const result = await api<Record<string, unknown>>(`/api/contracts/${contract.id}/actions`, { method: "POST", body: { action, reason: options.reason } });
      if (action === "create_payment_order" && typeof result.approveUrl === "string") {
        window.location.href = result.approveUrl;
        return;
      }
      if (action === "capture") {
        const outcome = result.outcome as string;
        push(outcome === "captured" ? { kind: "success", title: "Payment captured", description: `Capture ${result.captureId}` } : outcome === "human_approval_required" ? { kind: "info", title: "Human approval required", description: String(result.detail) } : { kind: "info", title: humanize(outcome), description: String(result.detail) });
      } else if (action === "reconcile") {
        push({ kind: "info", title: "Reconciled with PayPal", description: String(result.summary) });
      } else {
        push({ kind: "success", title: `${humanize(action)} done` });
      }
      await reload();
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        const rules = (err.details as { rules?: { description: string; detail?: string }[] } | undefined)?.rules;
        push({ kind: "error", title: err.message, description: rules?.map((r) => r.detail ?? r.description).join(" ") });
      } else push({ kind: "error", title: "Action failed" });
    } finally {
      setBusy(null);
    }
  };

  const decideApproval = async (approvalId: string, decision: "APPROVED" | "REJECTED") => {
    const note = decision === "REJECTED" ? window.prompt("Reason for rejecting (sent to the worker as context):") ?? "" : undefined;
    if (decision === "REJECTED" && note === "") return;
    setBusy(approvalId);
    try {
      const result = await api<{ outcome: string; capture?: { outcome: string; detail: string } }>("/api/approvals", { method: "POST", body: { approvalId, decision, note } });
      push({ kind: "success", title: decision === "APPROVED" ? "Approved" : "Rejected", description: result.capture?.detail });
      await reload();
      router.refresh();
    } catch (err) {
      push({ kind: "error", title: err instanceof ApiError ? err.message : "Could not record the decision." });
    } finally {
      setBusy(null);
    }
  };

  const amount = contract.agreedAmountCents ?? contract.budgetCents;
  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "timeline", label: "Live timeline", count: events.length },
    { id: "contract", label: "Contract" },
    { id: "agents", label: "Agents", count: contract.messages.length },
    { id: "verification", label: "Verification", count: contract.verificationRuns.length },
    { id: "payment", label: "Payment" },
    { id: "receipt", label: "Receipt" },
  ];

  const nextStep = useMemo(() => explainNextStep(contract, pendingApprovals.length, integrations), [contract, pendingApprovals.length, integrations]);

  return (
    <div className="space-y-5">
      {paymentReturn ? (
        <Callout tone={paymentReturn.status === "authorized" || paymentReturn.status === "already_authorized" ? "success" : paymentReturn.status === "cancelled" ? "warning" : "danger"} title={paymentReturn.status === "authorized" ? "PayPal authorization completed" : paymentReturn.status === "already_authorized" ? "Authorization already recorded" : paymentReturn.status === "cancelled" ? "PayPal approval cancelled" : paymentReturn.status === "not_approved" ? "PayPal did not report approval" : "PayPal return failed"}>
          {paymentReturn.message ?? (paymentReturn.status === "authorized" ? "Funds are held. The worker agent has been queued." : paymentReturn.status === "cancelled" ? "You can authorize again whenever you are ready." : "")}
        </Callout>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/app/contracts" className="text-xs text-muted hover:text-ink">
              Contracts
            </Link>
            <span className="text-faint">/</span>
            <span className="text-xs text-muted">{humanize(contract.category)}</span>
            {contract.isDemo ? <Badge tone="warning">Demo workspace</Badge> : null}
            {scenario !== "BEST_EFFORT" ? <Badge tone="warning">Scenario: {humanize(scenario)}</Badge> : null}
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink">{contract.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusBadge status={contract.status} label={CONTRACT_STATUS_LABELS[contract.status]} live={ACTIVE_CONTRACT_STATUSES.includes(contract.status)} />
            <StatusBadge status={contract.paymentState} label={`Payment: ${PAYMENT_STATE_LABELS[contract.paymentState]}`} />
            <StatusBadge status={contract.verificationState} label={`Verification: ${VERIFICATION_STATE_LABELS[contract.verificationState]}`} />
            <span className={cn("inline-flex items-center gap-1.5 text-[11px]", connected ? "text-teal" : "text-faint")}>
              <span className={cn("h-1.5 w-1.5 rounded-full", connected ? "bg-teal" : "bg-faint")} aria-hidden /> {connected ? "live" : "reconnecting"}
            </span>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted">{contract.agreedAmountCents ? "Agreed price" : "Budget"}</p>
          <p className="text-2xl font-semibold tabular-nums text-ink">{formatMoney(amount, contract.currency)}</p>
          <p className="text-xs text-faint">{contract.workerAgent ? `Worker: ${contract.workerAgent.name}` : "Worker not assigned yet"}</p>
        </div>
      </div>

      <PipelineStrip status={contract.status} hasReceipt={Boolean(contract.receipt)} />

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader title={nextStep.title} description={nextStep.description} />
          <CardBody className="flex flex-wrap items-center gap-2">
            {contract.status === "AWAITING_APPROVAL" && isAdmin ? (
              <>
                <Button onClick={() => act("approve")} loading={busy === "approve"} disabled={editing}>
                  Approve contract and start negotiation
                </Button>
                <Button variant="secondary" onClick={() => { setEditing(true); setTab("contract"); }} disabled={editing}>
                  Edit before approving
                </Button>
              </>
            ) : null}
            {contract.status === "AWAITING_APPROVAL" && !isAdmin ? <p className="text-sm text-muted">An admin or owner approves contracts.</p> : null}
            {contract.status === "NEGOTIATING" && isAdmin && latestRun && latestRun.status === "FAILED" ? (
              <Button variant="secondary" onClick={() => act("retry_negotiation")} loading={busy === "retry_negotiation"}>
                <RefreshCw className="h-4 w-4" aria-hidden /> Retry negotiation
              </Button>
            ) : null}
            {contract.status === "AWAITING_PAYMENT_AUTHORIZATION" && isAdmin ? (
              integrations.paypal ? (
                <Button onClick={() => act("create_payment_order")} loading={busy === "create_payment_order"}>
                  Authorize {formatMoney(amount, contract.currency)} with PayPal
                </Button>
              ) : (
                <Callout tone="warning" title="PayPal is not configured on this deployment">Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET to create sandbox orders.</Callout>
              )
            ) : null}
            {workerStuck && isAdmin ? (
              <Button variant="secondary" onClick={() => act("retry_work")} loading={busy === "retry_work"}>
                <RefreshCw className="h-4 w-4" aria-hidden /> Re-queue the worker
              </Button>
            ) : null}
            {contract.status === "UNDER_VERIFICATION" && contract.verificationState === "ERROR" && isAdmin ? (
              <Button variant="secondary" onClick={() => act("rerun_verification")} loading={busy === "rerun_verification"}>
                <RefreshCw className="h-4 w-4" aria-hidden /> Re-run verification
              </Button>
            ) : null}
            {contract.status === "ELIGIBLE_FOR_CAPTURE" && isAdmin ? (
              <Button onClick={() => act("capture")} loading={busy === "capture"}>
                Capture {formatMoney(amount, contract.currency)} now
              </Button>
            ) : null}
            {(contract.paymentState === "CAPTURE_PENDING" || contract.paymentState === "CAPTURE_UNCERTAIN" || contract.paymentState === "VOID_PENDING") && isAdmin ? (
              <Button variant="secondary" onClick={() => act("reconcile")} loading={busy === "reconcile"}>
                <RefreshCw className="h-4 w-4" aria-hidden /> Reconcile with PayPal
              </Button>
            ) : null}
            {pendingApprovals.map((a) => (
              <div key={a.id} className="w-full rounded-lg border border-warning/40 bg-warning-soft/40 p-3">
                <p className="text-sm font-medium text-ink">{a.title}</p>
                <p className="mt-0.5 text-xs text-muted">{a.description}</p>
                {isAdmin ? (
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" onClick={() => decideApproval(a.id, "APPROVED")} loading={busy === a.id}>
                      Approve
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => decideApproval(a.id, "REJECTED")} disabled={busy === a.id}>
                      Reject
                    </Button>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-muted">An admin or owner decides this.</p>
                )}
              </div>
            ))}
            {["DRAFT", "AWAITING_APPROVAL", "NEGOTIATING", "AWAITING_PAYMENT_AUTHORIZATION"].includes(contract.status) && isAdmin ? (
              <Button variant="ghost" onClick={() => act("cancel", { reason: "Cancelled by owner.", confirm: "Cancel this contract? This cannot be undone." })} loading={busy === "cancel"}>
                Cancel contract
              </Button>
            ) : null}
            {(VOIDABLE_CONTRACT_STATUSES.includes(contract.status) || (contract.status === "FAILED" && contract.paymentState === "AUTHORIZED")) && isAdmin ? (
              <Button variant="ghost" className="text-danger" onClick={() => act("void", { reason: "Authorization voided by owner.", confirm: "Void the PayPal authorization and release the hold? The contract ends here." })} loading={busy === "void"}>
                Void authorization
              </Button>
            ) : null}
            {contract.receipt ? (
              <Link href={`/app/receipts/${contract.receipt.receiptNumber}`}>
                <Button variant="secondary">
                  <ExternalLink className="h-4 w-4" aria-hidden /> Open receipt {contract.receipt.receiptNumber}
                </Button>
              </Link>
            ) : null}
            {contract.deliverables[0] ? (
              <a href={`/preview/${contract.deliverables[0].previewToken}/${contract.category === "LANDING_PAGE" ? "index.html" : "dataset.json"}`} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium text-ink hover:border-border-strong">
                <ExternalLink className="h-4 w-4" aria-hidden /> Open deliverable #{contract.deliverables[0].submissionNumber}
              </a>
            ) : null}
          </CardBody>
        </Card>
        <PolicyExplainer decision={latestCaptureDecision} compact />
      </div>

      <div className="border-b border-border">
        <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="Contract sections">
          {tabs.map((t) => (
            <button key={t.id} type="button" onClick={() => setTab(t.id)} aria-current={tab === t.id ? "page" : undefined} className={cn("whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition", tab === t.id ? "border-navy text-navy" : "border-transparent text-muted hover:text-ink")}>
              {t.label}
              {t.count !== undefined ? <span className="ml-1.5 rounded-full bg-surface-2 px-1.5 text-[11px] text-muted">{t.count}</span> : null}
            </button>
          ))}
        </nav>
      </div>

      {tab === "timeline" ? (
        <Card>
          <CardHeader title="Live timeline" description="Every event the orchestration backend recorded for this contract, newest last. Streams over Server-Sent Events." />
          <CardBody>{events.length === 0 ? <EmptyState title="No events yet" description="Events appear as agents, the policy engine, and PayPal act." /> : <ActivityList events={[...events].reverse()} linkContracts={false} />}</CardBody>
        </Card>
      ) : null}

      {tab === "contract" ? (
        <div className="space-y-4">
          {editing && latestVersion ? (
            <Card>
              <CardHeader title={`Edit contract (creates v${latestVersion.version + 1})`} description="Approved versions are immutable. Edits before approval create a new version with its own hash." />
              <CardBody>
                <ContractEditor contractId={contract.id} content={latestVersion.content as unknown as ContractContent} onSaved={async () => { setEditing(false); await reload(); push({ kind: "success", title: "New version saved" }); }} onCancel={() => setEditing(false)} />
              </CardBody>
            </Card>
          ) : null}
          {content ? (
            <>
              <Card>
                <CardHeader title={`Contract v${approvedVersion?.version ?? latestVersion?.version}`} description={contract.approvedHash ? `Approved ${formatDate(approvedVersion?.approvedAt)} · hash ${contract.approvedHash}` : `Not yet approved · hash ${latestVersion?.contentHash}`} action={contract.approvedHash ? <Badge tone="success">Immutable</Badge> : <Badge tone="warning">Editable</Badge>} />
                <CardBody className="space-y-5">
                  <p className="text-sm leading-relaxed text-ink-2">{content.taskDescription}</p>
                  <KeyValue items={[{ label: "Deliverables", value: <ul className="list-disc pl-4">{content.deliverables.map((d) => <li key={d}>{d}</li>)}</ul> }, { label: "Evidence requirements", value: <ul className="list-disc pl-4">{content.evidenceRequirements.map((d) => <li key={d}>{d}</li>)}</ul> }, { label: "Capture condition", value: content.paymentRules.captureCondition }, { label: "Dispute procedure", value: content.disputeProcedure }, { label: "Approval requirements", value: content.approvalRequirements.join("; ") || "None beyond policy" }, { label: "Deadline", value: content.deadline ? formatDate(content.deadline) : "None" }]} />
                </CardBody>
              </Card>
              <Card>
                <CardHeader title="Acceptance criteria" description={`${content.criteria.filter((c) => c.kind === "OBJECTIVE").length} objective (checked by tools), ${content.criteria.filter((c) => c.kind === "SUBJECTIVE").length} subjective (rubric review).`} />
                <ul className="divide-y divide-border">
                  {content.criteria.map((c) => (
                    <li key={c.key} className="flex flex-wrap items-start gap-3 px-5 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium text-ink">{METHOD_LABELS[c.method as keyof typeof METHOD_LABELS]}</p>
                          <Mono>{c.key}</Mono>
                          <Badge tone={c.kind === "OBJECTIVE" ? "teal" : "warning"}>{c.kind.toLowerCase()}</Badge>
                          {c.required ? <Badge tone="neutral">required</Badge> : <Badge tone="neutral">optional</Badge>}
                        </div>
                        <p className="mt-0.5 text-sm text-muted">{c.description}</p>
                        <p className="mt-1 font-mono text-[11px] text-faint">{JSON.stringify(c.parameters)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
              {contract.versions.length > 1 ? (
                <Card>
                  <CardHeader title="Version history" />
                  <ul className="divide-y divide-border text-sm">
                    {contract.versions.map((v) => (
                      <li key={v.id} className="flex flex-wrap items-center gap-3 px-5 py-2.5">
                        <span className="font-medium text-ink">v{v.version}</span>
                        <Badge tone="neutral">{v.authorType.toLowerCase()}</Badge>
                        <Mono>{v.contentHash}</Mono>
                        <span className="ml-auto text-xs text-faint">{formatDate(v.createdAt)}</span>
                        {v.approvedAt ? <Badge tone="success">approved</Badge> : null}
                      </li>
                    ))}
                  </ul>
                </Card>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}

      {tab === "agents" ? <AgentPanel contract={contract} /> : null}
      {tab === "verification" ? <VerificationPanel runs={contract.verificationRuns} criteria={approvedVersion?.criteria ?? []} /> : null}
      {tab === "payment" ? <PaymentPanel contract={contract} /> : null}
      {tab === "receipt" ? (
        contract.receipt ? (
          <Card>
            <CardHeader title={`Proof of Work Receipt ${contract.receipt.receiptNumber}`} description={`Signed with ${contract.receipt.signingKeyId}. Settled ${formatDate(contract.receipt.settledAt)}.`} />
            <CardBody className="flex flex-wrap gap-2">
              <Link href={`/app/receipts/${contract.receipt.receiptNumber}`}>
                <Button>Open receipt</Button>
              </Link>
              <a href={`/api/receipts/${contract.receipt.receiptNumber}?format=download`} className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium text-ink hover:border-border-strong">
                <Download className="h-4 w-4" aria-hidden /> JSON
              </a>
              <a href={`/api/receipts/${contract.receipt.receiptNumber}?format=pdf`} className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium text-ink hover:border-border-strong">
                <Download className="h-4 w-4" aria-hidden /> PDF
              </a>
            </CardBody>
          </Card>
        ) : (
          <EmptyState title="No receipt yet" description="A signed Proof of Work Receipt is issued automatically once PayPal confirms the capture." />
        )
      ) : null}
    </div>
  );
}

function explainNextStep(contract: ContractDetail, pending: number, integrations: Record<string, boolean>): { title: string; description: string } {
  switch (contract.status) {
    case "DRAFT":
      return { title: "Generating the contract", description: "Gemini is converting your objective into structured criteria." };
    case "AWAITING_APPROVAL":
      return { title: "Review and approve the contract", description: "Check the deliverables and acceptance criteria. Approval freezes the content hash and starts agent negotiation. No money moves at this stage." };
    case "NEGOTIATING":
      return { title: "Agents are negotiating", description: "The Buyer Agent is discovering a worker and agreeing a fixed price within your budget. Watch the Agents tab." };
    case "AWAITING_PAYMENT_AUTHORIZATION":
      return { title: "Authorize the payment", description: integrations.paypal ? "Approve the PayPal sandbox order as the payer. This places a hold; nothing is captured until verification passes." : "PayPal credentials are missing on this deployment." };
    case "AUTHORIZED":
      return { title: "Funds held, worker starting", description: "The authorization is recorded. The Worker Agent has been queued to build the deliverable." };
    case "IN_PROGRESS":
      return { title: "Worker is building the deliverable", description: "The Worker Agent is writing files with its tools. It will run a self-check and submit." };
    case "UNDER_VERIFICATION":
      return { title: "Independent verification running", description: "The Verifier Agent is executing every approved criterion against the submitted files. Evidence is stored as it is produced." };
    case "CORRECTION_REQUIRED":
      return { title: "Verification failed, capture blocked", description: `The policy engine denied capture. The worker received a correction request (attempt ${contract.correctionCount} of the allowed corrections).` };
    case "AWAITING_HUMAN_REVIEW":
      return { title: "Your decision is needed", description: pending ? "The policy engine requires a human to decide before capture can proceed." : "Waiting for a human decision." };
    case "ELIGIBLE_FOR_CAPTURE":
      return { title: "Eligible for capture", description: "Verification passed and the policy engine allows capture. Capture now, or wait for the automatic settlement." };
    case "CAPTURE_PENDING":
      return { title: "Capturing with PayPal", description: "The capture request is in flight or pending at PayPal. Reconciliation will confirm it." };
    case "CAPTURED":
      return { title: "Payment captured", description: "PayPal confirmed the capture. The signed receipt and the worker's Trust Passport reflect this contract." };
    case "VOID_PENDING":
      return { title: "Voiding the authorization", description: "The hold is being released at PayPal." };
    case "VOIDED":
      return { title: "Authorization voided", description: "The hold was released. No funds were captured." };
    case "EXPIRED":
      return { title: "Authorization expired", description: "PayPal authorizations last 29 days. No capture is possible without a new authorization." };
    case "FAILED":
      return { title: "Contract failed", description: contract.failureReason ?? "See the timeline for the cause." };
    case "CANCELLED":
      return { title: "Contract cancelled", description: contract.failureReason ?? "Cancelled before any authorization." };
    case "DISPUTED":
      return { title: "Disputed", description: "This contract is under dispute." };
    default:
      return { title: humanize(contract.status), description: "" };
  }
}
