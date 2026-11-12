import PDFDocument from "pdfkit";
import type { SignedReceipt } from "@/lib/receipts/service";
import { formatMoney } from "@/lib/money";

const NAVY = "#0B2A5B";
const TEAL = "#13B5A6";
const INK = "#1F2A44";
const MUTED = "#5B6B8A";

/**
 * Human-readable export of a signed receipt. The PDF is a convenience; the
 * JSON receipt with its signature is the verifiable artifact.
 */
export async function renderReceiptPdf(receipt: SignedReceipt, options: { verifyUrl: string; logoPng?: Buffer }): Promise<Buffer> {
  const { payload } = receipt;
  const doc = new PDFDocument({ size: "A4", margin: 48, info: { Title: `Proof of Work Receipt ${payload.receiptNumber}`, Author: "PACT Protocol" } });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  if (options.logoPng) {
    doc.image(options.logoPng, 48, 36, { height: 52 });
  }
  doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(20).text("Proof of Work Receipt", 200, 44, { align: "right" });
  doc.fillColor(MUTED).font("Helvetica").fontSize(10).text(payload.receiptNumber, 200, 70, { align: "right" });
  doc.moveTo(48, 100).lineTo(547, 100).strokeColor(TEAL).lineWidth(2).stroke();

  let y = 118;
  const section = (title: string) => {
    doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(12).text(title, 48, y);
    y += 18;
  };
  const row = (label: string, value: string) => {
    doc.fillColor(MUTED).font("Helvetica").fontSize(9).text(label, 48, y, { width: 150 });
    doc.fillColor(INK).font("Helvetica").fontSize(9).text(value, 200, y, { width: 347 });
    y += Math.max(14, doc.heightOfString(value, { width: 347 }) + 4);
  };

  section("Settlement");
  row("Amount", formatMoney(payload.payment.amountCents, payload.payment.currency));
  row("Provider", `PayPal (${payload.payment.environment})`);
  row("Order", payload.payment.orderId);
  row("Authorization", payload.payment.authorizationId);
  row("Capture", `${payload.payment.captureId} (${payload.payment.captureStatus})`);
  row("Settled at", payload.payment.settledAt);
  y += 8;

  section("Contract");
  row("Title", payload.contract.title);
  row("Contract ID", payload.contract.id);
  row("Category", payload.contract.category);
  row("Approved version", `v${payload.contract.approvedVersion}, approved ${payload.contract.approvedAt ?? "n/a"}`);
  row("Approved content hash", payload.contract.approvedContentHash);
  row("Buyer workspace", payload.buyer.organizationSlug);
  row("Worker agent", `${payload.worker.agentName} (${payload.worker.agentSlug})`);
  row("Verifier agent", payload.verifier.agentSlug);
  row("Deliverable", `#${payload.deliverable.submissionNumber}, ${payload.deliverable.fileCount} files, root hash ${payload.deliverable.rootHash}`);
  y += 8;

  section("Acceptance criteria and final verification");
  const finalRun = payload.verification.runs.find((r) => r.id === payload.verification.finalRunId);
  for (const c of payload.acceptanceCriteria) {
    const result = finalRun?.results.find((r) => r.key === c.key);
    const mark = result?.passed === true ? "PASS" : result?.passed === false ? "FAIL" : "N/A";
    row(`${mark}  ${c.key}`, `${c.description} [${c.kind.toLowerCase()}, ${c.method}${result?.score !== null && result?.score !== undefined ? `, score ${result.score}` : ""}]`);
    if (y > 740) {
      doc.addPage();
      y = 48;
    }
  }
  y += 8;

  section("Verification history");
  for (const r of payload.verification.runs) {
    row(`Attempt ${r.attempt}`, `${r.status}, ${r.results.filter((x) => x.passed).length}/${r.results.length} passed, ${r.evidenceHashes.length} evidence records, finished ${r.finishedAt ?? "n/a"}`);
    if (y > 740) {
      doc.addPage();
      y = 48;
    }
  }
  y += 8;

  if (y > 600) {
    doc.addPage();
    y = 48;
  }
  section("Approvals and policy");
  row("Approvals", payload.approvals.map((a) => `${a.kind} ${a.status}${a.decidedAt ? ` at ${a.decidedAt}` : ""}`).join("; ") || "none recorded");
  row("Capture decision", `${payload.policy.outcome ?? "n/a"} by policy engine ${payload.policy.engineVersion ?? "n/a"} (decision ${payload.policy.captureDecisionId ?? "n/a"})`);
  y += 8;

  section("Signature");
  row("Algorithm", receipt.algorithm);
  row("Key ID", receipt.signingKeyId);
  row("Payload hash", receipt.payloadHash);
  row("Signature", receipt.signature);
  row("Verify online", options.verifyUrl);
  y += 10;

  doc.fillColor(MUTED).font("Helvetica").fontSize(8).text(
    "What this receipt proves: the signature shows this document was issued by PACT and has not changed since. The verification section records which tool-based checks ran and their outcomes; it does not claim the verifier's judgement was objectively correct. Approval entries record human decisions. Payment references are PayPal identifiers recorded at settlement and can be confirmed with PayPal. This receipt is not an escrow statement; PACT does not hold funds.",
    48,
    y,
    { width: 499, align: "justify" },
  );

  doc.end();
  return done;
}
