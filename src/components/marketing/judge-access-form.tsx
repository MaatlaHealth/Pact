"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, Field, Input, Callout } from "@/components/ui/primitives";
import { api, ApiError } from "@/lib/client/api";

export function JudgeAccessForm({ provisioned, reason, paypal, gemini }: { provisioned: boolean; reason?: string; paypal: boolean; gemini: boolean }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api("/api/judge/access", { method: "POST", body: { code } });
      router.push("/app");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not sign in.");
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardBody className="p-6">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-navy-soft text-navy">
            <KeyRound className="h-4 w-4" aria-hidden />
          </span>
          <div>
            <p className="text-sm font-semibold text-ink">Enter the judge workspace</p>
            <p className="text-xs text-muted">Use the access code from the Devpost testing instructions.</p>
          </div>
        </div>
        {provisioned ? (
          <form onSubmit={submit} className="mt-5 space-y-4" noValidate>
            <Field label="Access code" htmlFor="judge-code" error={error}>
              <Input id="judge-code" autoComplete="off" required value={code} onChange={(e) => setCode(e.target.value)} placeholder="Paste the code" />
            </Field>
            <Button type="submit" className="w-full" loading={loading} disabled={code.trim().length < 4}>
              Open the demonstration workspace
            </Button>
            <p className="text-[11px] leading-relaxed text-faint">You are signed in as a restricted admin of the demo workspace. You can create contracts, authorize sandbox payments, approve captures, and void authorizations. You cannot change members or reach any other workspace.</p>
          </form>
        ) : (
          <Callout tone="warning" title="Not available on this deployment yet" className="mt-5">
            {reason} The owner provisions it by setting JUDGE_ACCESS_CODE, JUDGE_EMAIL, and JUDGE_PASSWORD and running the judge seed. Until then, create your own workspace from the sign-up page.
          </Callout>
        )}
        <ul className="mt-5 space-y-1.5 border-t border-border pt-4 text-xs">
          <li className="flex items-center gap-2">{gemini ? <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-hidden /> : <AlertCircle className="h-3.5 w-3.5 text-warning" aria-hidden />}<span className="text-muted">Gemini {gemini ? "configured: contracts and agents run" : "not configured: contract generation unavailable"}</span></li>
          <li className="flex items-center gap-2">{paypal ? <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-hidden /> : <AlertCircle className="h-3.5 w-3.5 text-warning" aria-hidden />}<span className="text-muted">PayPal sandbox {paypal ? "configured: real authorizations and captures" : "not configured: payments unavailable"}</span></li>
        </ul>
      </CardBody>
    </Card>
  );
}
