"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardBody, Field, Input, Textarea, Select, Callout } from "@/components/ui/primitives";
import { api, ApiError } from "@/lib/client/api";
import { formatMoney, parseMoneyInput } from "@/lib/money";

const templates = {
  LANDING_PAGE: "Create a responsive landing page for my product, Harbor Analytics. It must include a hero section, a features section, pricing, and a working contact form. It must pass accessibility checks and achieve a mobile Lighthouse performance score of at least 90.",
  JSON_DATASET: "Generate a dataset of 120 fictional small-business customer records for testing our CRM import. Each record needs a unique id, company name, contact name, email, country code, industry, and annual revenue in USD. Output must be valid JSON matching a schema and ids must be unique.",
};

interface Policy {
  currency: string;
  maxTransactionAmountCents: number;
  allowedCategories: string[];
  requireHumanApprovalForCapture: boolean;
}

export function NewContractForm({ policy, judgeWorkspace, generationAvailable }: { policy: Policy; judgeWorkspace: boolean; generationAvailable: boolean }) {
  const router = useRouter();
  const [category, setCategory] = useState<"LANDING_PAGE" | "JSON_DATASET">(policy.allowedCategories.includes("LANDING_PAGE") ? "LANDING_PAGE" : "JSON_DATASET");
  const [objective, setObjective] = useState(templates.LANDING_PAGE);
  const [budget, setBudget] = useState("60");
  const [deadline, setDeadline] = useState("");
  const [scenario, setScenario] = useState<"BEST_EFFORT" | "DEFECTIVE_FIRST_DRAFT">(judgeWorkspace ? "DEFECTIVE_FIRST_DRAFT" : "BEST_EFFORT");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const budgetCents = (() => {
    try {
      return parseMoneyInput(budget);
    } catch {
      return 0;
    }
  })();
  const overCap = budgetCents > policy.maxTransactionAmountCents;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await api<{ contract: { id: string } }>("/api/contracts", {
        method: "POST",
        body: { objective, budgetCents, currency: policy.currency, category, deadline: deadline ? new Date(deadline).toISOString() : null, scenario: judgeWorkspace ? scenario : undefined },
      });
      router.push(`/app/contracts/${result.contract.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create the contract.");
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardBody className="p-6">
        <form onSubmit={submit} className="space-y-5" noValidate>
          <Field label="Task category" htmlFor="category">
            <Select
              id="category"
              value={category}
              onChange={(e) => {
                const next = e.target.value as typeof category;
                setCategory(next);
                if (objective === templates.LANDING_PAGE || objective === templates.JSON_DATASET) setObjective(templates[next]);
              }}
            >
              {policy.allowedCategories.includes("LANDING_PAGE") ? <option value="LANDING_PAGE">Landing page (static site)</option> : null}
              {policy.allowedCategories.includes("JSON_DATASET") ? <option value="JSON_DATASET">JSON dataset (schema-validated)</option> : null}
            </Select>
          </Field>
          <Field label="Objective" htmlFor="objective" hint="plain language, 20 to 4000 characters">
            <Textarea id="objective" rows={6} required minLength={20} value={objective} onChange={(e) => setObjective(e.target.value)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={`Budget (${policy.currency})`} htmlFor="budget" hint={`cap ${formatMoney(policy.maxTransactionAmountCents, policy.currency)}`} error={overCap ? "Above the workspace transaction cap. Raise it in Settings or lower the budget." : null}>
              <Input id="budget" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} />
            </Field>
            <Field label="Deadline" htmlFor="deadline" hint="optional">
              <Input id="deadline" type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </Field>
          </div>
          {judgeWorkspace ? (
            <fieldset className="rounded-lg border border-warning/40 bg-warning-soft/40 p-4">
              <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-warning">Judge demonstration scenario</legend>
              <p className="text-xs text-muted">Both options run real agents, real verification, and real PayPal sandbox transactions. The defective-draft scenario only changes the worker&apos;s first brief so you can watch verification block the payment before the worker corrects the real file.</p>
              <div className="mt-3 space-y-2">
                <label className="flex items-start gap-2 text-sm text-ink">
                  <input type="radio" name="scenario" value="DEFECTIVE_FIRST_DRAFT" checked={scenario === "DEFECTIVE_FIRST_DRAFT"} onChange={() => setScenario("DEFECTIVE_FIRST_DRAFT")} className="mt-1" />
                  <span>
                    <strong>Defective first draft.</strong> The worker&apos;s first submission leaves the contact form unwired. The contact-form check fails, capture is blocked, the worker is sent a correction request and resubmits.
                  </span>
                </label>
                <label className="flex items-start gap-2 text-sm text-ink">
                  <input type="radio" name="scenario" value="BEST_EFFORT" checked={scenario === "BEST_EFFORT"} onChange={() => setScenario("BEST_EFFORT")} className="mt-1" />
                  <span>
                    <strong>Best effort.</strong> No constraint. Whether the first submission passes depends entirely on the worker&apos;s output.
                  </span>
                </label>
              </div>
            </fieldset>
          ) : null}
          {policy.requireHumanApprovalForCapture ? <Callout tone="info">This workspace requires a human to approve every capture, so payment will wait for you even after verification passes.</Callout> : null}
          {error ? <Callout tone="danger">{error}</Callout> : null}
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-faint">Generation takes 10 to 30 seconds. Nothing is authorized until you approve the contract.</p>
            <Button type="submit" loading={loading} disabled={!generationAvailable || overCap || budgetCents <= 0 || objective.trim().length < 20}>
              Generate contract
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
