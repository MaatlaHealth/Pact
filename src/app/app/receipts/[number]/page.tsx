import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { requireAppContext } from "@/lib/auth/app-context";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/utils";
import type { ReceiptPayload } from "@/lib/receipts/service";
import { PageHeader, Card, CardHeader, CardBody, KeyValue, Badge, Mono } from "@/components/ui/primitives";
import { ReceiptVerifier } from "@/components/receipts/verifier";

export const metadata: Metadata = { title: "Receipt" };

export default async function ReceiptPage({ params }: { params: Promise<{ number: string }> }) {
  const ctx = await requireAppContext();
  const { number } = await params;
  const receipt = await db.receipt.findFirst({ where: { receiptNumber: number, organizationId: ctx.organization.id }, include: { signingKey: true } });
  if (!receipt) notFound();
  const payload = receipt.payload as unknown as ReceiptPayload;
  const signed = { payload, payloadHash: receipt.payloadHash, signature: receipt.signature, signingKeyId: receipt.signingKeyId, algorithm: "Ed25519", publicKeyPem: receipt.signingKey.publicKeyPem };
  const finalRun = payload.verification.runs.find((r) => r.id === payload.verification.finalRunId);
  return (
    <>
      <PageHeader
        eyebrow="Proof of Work Receipt"
        title={payload.receiptNumber}
        description={`${payload.contract.title}. Settled ${formatDate(payload.payment.settledAt)} for ${formatMoney(payload.payment.amountCents, payload.payment.currency)} via PayPal ${payload.payment.environment}.`}
        actions={
          <>
            <a href={`/api/receipts/${number}?format=download`} className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium text-ink hover:border-border-strong">
              <Download className="h-4 w-4" aria-hidden /> JSON
            </a>
            <a href={`/api/receipts/${number}?format=pdf`} className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium text-ink hover:border-border-strong">
              <Download className="h-4 w-4" aria-hidden /> PDF
            </a>
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Settlement" />
          <CardBody>
            <KeyValue className="sm:grid-cols-1" items={[{ label: "Amount", value: formatMoney(payload.payment.amountCents, payload.payment.currency) }, { label: "PayPal order", value: payload.payment.orderId, mono: true }, { label: "Authorization", value: payload.payment.authorizationId, mono: true }, { label: "Capture", value: `${payload.payment.captureId} (${payload.payment.captureStatus})`, mono: true }, { label: "Settled at", value: formatDate(payload.payment.settledAt) }]} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Contract and parties" />
          <CardBody>
            <KeyValue className="sm:grid-cols-1" items={[{ label: "Contract", value: <Link href={`/app/contracts/${payload.contract.id}`} className="text-navy hover:underline">{payload.contract.title}</Link> }, { label: "Approved version", value: `v${payload.contract.approvedVersion}, ${payload.contract.approvedAt ? formatDate(payload.contract.approvedAt) : "n/a"}` }, { label: "Approved content hash", value: payload.contract.approvedContentHash, mono: true }, { label: "Worker", value: `${payload.worker.agentName} (${payload.worker.agentSlug})` }, { label: "Verifier", value: payload.verifier.agentSlug }, { label: "Deliverable", value: `#${payload.deliverable.submissionNumber}, ${payload.deliverable.fileCount} files` }, { label: "Deliverable root hash", value: payload.deliverable.rootHash, mono: true }]} />
          </CardBody>
        </Card>
      </div>
      <Card className="mt-4">
        <CardHeader title="Verification" description={`Final run ${payload.verification.finalRunId} (${payload.verification.finalStatus}). ${payload.verification.runs.length} attempt${payload.verification.runs.length === 1 ? "" : "s"} recorded.`} />
        <ul className="divide-y divide-border">
          {payload.acceptanceCriteria.map((c) => {
            const r = finalRun?.results.find((x) => x.key === c.key);
            return (
              <li key={c.key} className="flex flex-wrap items-center gap-2 px-5 py-2.5 text-sm">
                <Badge tone={r?.passed === true ? "success" : r?.passed === false ? "danger" : "warning"}>{r?.passed === true ? "pass" : r?.passed === false ? "fail" : "n/a"}</Badge>
                <Mono>{c.key}</Mono>
                <span className="text-ink-2">{c.description}</span>
                <span className="ml-auto text-xs text-faint">{c.method}{r?.score !== null && r?.score !== undefined ? ` · score ${r.score}` : ""}</span>
              </li>
            );
          })}
        </ul>
        <CardBody>
          <p className="text-xs font-semibold uppercase tracking-wide text-faint">Evidence hashes</p>
          <ul className="mt-2 space-y-1">
            {payload.verification.runs.flatMap((run) => run.evidenceHashes.map((e) => (
              <li key={e.id} className="text-xs text-muted">
                attempt {run.attempt} · {e.label} · <Mono>{e.hash}</Mono>
              </li>
            )))}
          </ul>
        </CardBody>
      </Card>
      <Card className="mt-4">
        <CardHeader title="Signature" description="Ed25519 over the canonical JSON payload. Anyone can verify this receipt without an account." />
        <CardBody>
          <KeyValue className="sm:grid-cols-1" items={[{ label: "Key ID", value: receipt.signingKeyId, mono: true }, { label: "Payload hash", value: receipt.payloadHash, mono: true }, { label: "Signature", value: receipt.signature, mono: true }, { label: "Policy decision", value: `${payload.policy.outcome ?? "n/a"} by engine ${payload.policy.engineVersion ?? "n/a"}` }, { label: "Approvals", value: payload.approvals.map((a) => `${a.kind} ${a.status}`).join("; ") || "none" }]} />
          <div className="mt-6">
            <ReceiptVerifier initial={JSON.stringify(signed, null, 2)} />
          </div>
        </CardBody>
      </Card>
    </>
  );
}
