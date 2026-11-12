"use client";

import { useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea, Card, CardBody, Callout } from "@/components/ui/primitives";
import { api, ApiError } from "@/lib/client/api";

interface Verification {
  receiptNumber: string | null;
  valid: boolean;
  checks: Record<string, { ok: boolean; detail: string }>;
  meaning: { cryptographicIntegrity: boolean; independentTechnicalVerification: string; buyerApproval: string; paymentConfirmation: string };
}

export function ReceiptVerifier({ initial }: { initial?: string }) {
  const [text, setText] = useState(initial ?? "");
  const [result, setResult] = useState<Verification | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError(null);
    setResult(null);
    let parsed: { payload?: unknown; signature?: string; signingKeyId?: string };
    try {
      parsed = JSON.parse(text);
    } catch {
      setError("That is not valid JSON.");
      return;
    }
    if (!parsed.payload || !parsed.signature || !parsed.signingKeyId) {
      setError("A receipt has payload, signature, and signingKeyId fields.");
      return;
    }
    setLoading(true);
    try {
      const data = await api<{ verification: Verification }>("/api/receipts/verify", { method: "POST", body: { payload: parsed.payload, signature: parsed.signature, signingKeyId: parsed.signingKeyId } });
      setResult(data.verification);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Verification request failed.");
    } finally {
      setLoading(false);
    }
  };

  const labels: Record<string, string> = { structure: "Structure", hash: "Canonical hash", signature: "Ed25519 signature", evidence: "Evidence records", paymentRecord: "Payment record" };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div>
        <label htmlFor="receipt-json" className="mb-1.5 block text-xs font-medium text-ink-2">
          Receipt JSON
        </label>
        <Textarea id="receipt-json" value={text} onChange={(e) => setText(e.target.value)} rows={18} spellCheck={false} className="font-mono text-xs" placeholder='{ "payload": { ... }, "payloadHash": "sha256:...", "signature": "...", "signingKeyId": "pact-ed25519-..." }' />
        {error ? <p className="mt-2 text-sm text-danger" role="alert">{error}</p> : null}
        <div className="mt-3">
          <Button onClick={submit} loading={loading} disabled={!text.trim()}>
            Verify receipt
          </Button>
        </div>
      </div>
      <div>
        {result ? (
          <Card>
            <CardBody>
              <div className="flex items-center gap-2">
                {result.valid ? <CheckCircle2 className="h-5 w-5 text-success" aria-hidden /> : <XCircle className="h-5 w-5 text-danger" aria-hidden />}
                <p className="text-sm font-semibold text-ink">{result.valid ? "Receipt verified" : "Receipt did not verify"}</p>
              </div>
              {result.receiptNumber ? <p className="mt-1 font-mono text-xs text-muted">{result.receiptNumber}</p> : null}
              <ul className="mt-4 space-y-2">
                {Object.entries(result.checks).map(([key, check]) => (
                  <li key={key} className="flex gap-2 text-sm">
                    {check.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />}
                    <div>
                      <p className="font-medium text-ink">{labels[key] ?? key}</p>
                      <p className="break-all text-xs text-muted">{check.detail}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="mt-5 space-y-2 text-xs text-muted">
                <p>
                  <strong className="text-ink">Cryptographic integrity:</strong> {result.meaning.cryptographicIntegrity ? "issued by PACT and unchanged." : "not established."}
                </p>
                <p>
                  <strong className="text-ink">Technical verification:</strong> {result.meaning.independentTechnicalVerification}
                </p>
                <p>
                  <strong className="text-ink">Buyer approval:</strong> {result.meaning.buyerApproval}
                </p>
                <p>
                  <strong className="text-ink">Payment:</strong> {result.meaning.paymentConfirmation}
                </p>
              </div>
            </CardBody>
          </Card>
        ) : (
          <Callout tone="neutral" title="What gets checked">
            Structure against the receipt schema, the SHA-256 hash of the canonical payload, the Ed25519 signature for the named key, every referenced evidence hash against the append-only evidence table, and the PayPal capture reference against the payment record.
          </Callout>
        )}
      </div>
    </div>
  );
}
