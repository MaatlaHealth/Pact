"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea, Select, Callout, Badge } from "@/components/ui/primitives";
import { api, ApiError } from "@/lib/client/api";
import type { ContractContent, CriterionContent } from "@/lib/contracts/schema";
import { METHOD_LABELS } from "@/lib/verification/methods";

const LANDING_METHODS = ["HTTP_AVAILABILITY", "REQUIRED_SECTIONS", "NAVIGATION_LINKS", "RESPONSIVE_VIEWPORTS", "CONTACT_FORM_SUBMISSION", "ACCESSIBILITY_AUDIT", "LIGHTHOUSE_MOBILE_PERFORMANCE", "CONSOLE_ERRORS", "BROKEN_LINKS", "HTML_VALIDITY"];
const DATASET_METHODS = ["JSON_SCHEMA", "DATASET_ROW_COUNT", "DATASET_UNIQUENESS"];

/** Owner-side editor for an unapproved contract. Saving creates a new version. */
export function ContractEditor({ contractId, content, onSaved, onCancel }: { contractId: string; content: ContractContent; onSaved: () => void; onCancel: () => void }) {
  const [draft, setDraft] = useState<ContractContent>(structuredClone(content));
  const [paramText, setParamText] = useState<Record<number, string>>(Object.fromEntries(content.criteria.map((c, i) => [i, JSON.stringify(c.parameters, null, 0)])));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const update = <K extends keyof ContractContent>(key: K, value: ContractContent[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const updateCriterion = (index: number, patch: Partial<CriterionContent>) => setDraft((d) => ({ ...d, criteria: d.criteria.map((c, i) => (i === index ? { ...c, ...patch } : c)) }));
  const removeCriterion = (index: number) => {
    setDraft((d) => ({ ...d, criteria: d.criteria.filter((_, i) => i !== index) }));
    setParamText((p) => {
      const next: Record<number, string> = {};
      Object.entries(p).forEach(([k, v]) => {
        const i = Number(k);
        if (i < index) next[i] = v;
        else if (i > index) next[i - 1] = v;
      });
      return next;
    });
  };
  const addCriterion = () => {
    const method = draft.category === "LANDING_PAGE" ? "CONSOLE_ERRORS" : "DATASET_ROW_COUNT";
    setDraft((d) => ({ ...d, criteria: [...d.criteria, { key: `criterion_${d.criteria.length + 1}`, description: "", kind: "OBJECTIVE", method, parameters: {}, required: true }] }));
    setParamText((p) => ({ ...p, [draft.criteria.length]: "{}" }));
  };

  const save = async () => {
    setError(null);
    setSaving(true);
    try {
      const criteria = draft.criteria.map((c, i) => {
        let parameters: Record<string, unknown> = {};
        try {
          parameters = JSON.parse(paramText[i] ?? "{}");
        } catch {
          throw new Error(`Criterion ${c.key}: parameters must be valid JSON.`);
        }
        return { ...c, parameters };
      });
      await api(`/api/contracts/${contractId}`, { method: "PUT", body: { ...draft, criteria } });
      onSaved();
    } catch (err) {
      if (err instanceof ApiError) {
        const details = err.details as { path: string; message: string }[] | undefined;
        setError(Array.isArray(details) ? details.map((d) => `${d.path}: ${d.message}`).join("; ") : err.message);
      } else setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const methods = draft.category === "LANDING_PAGE" ? LANDING_METHODS : DATASET_METHODS;

  return (
    <div className="space-y-5">
      <Field label="Title" htmlFor="c-title">
        <Input id="c-title" value={draft.title} onChange={(e) => update("title", e.target.value)} />
      </Field>
      <Field label="Task description" htmlFor="c-desc">
        <Textarea id="c-desc" rows={4} value={draft.taskDescription} onChange={(e) => update("taskDescription", e.target.value)} />
      </Field>
      <Field label="Deliverables" htmlFor="c-deliv" hint="one per line">
        <Textarea id="c-deliv" rows={3} value={draft.deliverables.join("\n")} onChange={(e) => update("deliverables", e.target.value.split("\n").filter((l) => l.trim()))} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Budget (cents)" htmlFor="c-budget">
          <Input id="c-budget" type="number" min={100} value={draft.budgetCents} onChange={(e) => update("budgetCents", Number(e.target.value))} />
        </Field>
        <Field label="Deadline (ISO)" htmlFor="c-deadline" hint="optional">
          <Input id="c-deadline" value={draft.deadline ?? ""} onChange={(e) => update("deadline", e.target.value || null)} placeholder="2026-12-01T00:00:00.000Z" />
        </Field>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-faint">Acceptance criteria</p>
          <Button size="sm" variant="secondary" onClick={addCriterion}>
            <Plus className="h-3.5 w-3.5" aria-hidden /> Add criterion
          </Button>
        </div>
        <div className="space-y-3">
          {draft.criteria.map((c, i) => (
            <div key={i} className="rounded-lg border border-border p-3">
              <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                <Field label="Key" htmlFor={`k-${i}`}>
                  <Input id={`k-${i}`} value={c.key} onChange={(e) => updateCriterion(i, { key: e.target.value })} />
                </Field>
                <Field label="Kind and method" htmlFor={`m-${i}`}>
                  <div className="flex gap-2">
                    <Select value={c.kind} onChange={(e) => updateCriterion(i, { kind: e.target.value as "OBJECTIVE" | "SUBJECTIVE", method: e.target.value === "SUBJECTIVE" ? "RUBRIC_REVIEW" : (methods[0] as CriterionContent["method"]) })} aria-label="Kind">
                      <option value="OBJECTIVE">Objective</option>
                      <option value="SUBJECTIVE">Subjective</option>
                    </Select>
                    <Select id={`m-${i}`} value={c.method} disabled={c.kind === "SUBJECTIVE"} onChange={(e) => updateCriterion(i, { method: e.target.value as CriterionContent["method"] })}>
                      {(c.kind === "SUBJECTIVE" ? ["RUBRIC_REVIEW"] : methods).map((m) => (
                        <option key={m} value={m}>
                          {METHOD_LABELS[m as keyof typeof METHOD_LABELS]}
                        </option>
                      ))}
                    </Select>
                  </div>
                </Field>
                <div className="flex items-end gap-2 pb-0.5">
                  <label className="flex items-center gap-1.5 text-xs text-ink-2">
                    <input type="checkbox" checked={c.required} onChange={(e) => updateCriterion(i, { required: e.target.checked })} /> Required
                  </label>
                  <Button size="icon" variant="ghost" aria-label="Remove criterion" onClick={() => removeCriterion(i)}>
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="Description" htmlFor={`d-${i}`}>
                  <Textarea id={`d-${i}`} rows={2} value={c.description} onChange={(e) => updateCriterion(i, { description: e.target.value })} />
                </Field>
                <Field label="Parameters (JSON)" htmlFor={`p-${i}`} hint={c.method === "RUBRIC_REVIEW" ? '{"rubric":[...],"minScore":7}' : undefined}>
                  <Textarea id={`p-${i}`} rows={2} className="font-mono text-xs" value={paramText[i] ?? "{}"} onChange={(e) => setParamText((p) => ({ ...p, [i]: e.target.value }))} />
                </Field>
              </div>
              <div className="mt-2">
                <Badge tone={c.kind === "OBJECTIVE" ? "teal" : "warning"}>{c.kind === "OBJECTIVE" ? "Checked by tools" : "Rubric review; human approval per policy"}</Badge>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Field label="Capture condition" htmlFor="c-capture">
        <Textarea id="c-capture" rows={2} value={draft.paymentRules.captureCondition} onChange={(e) => update("paymentRules", { ...draft.paymentRules, captureCondition: e.target.value })} />
      </Field>
      <Field label="Dispute procedure" htmlFor="c-dispute">
        <Textarea id="c-dispute" rows={2} value={draft.disputeProcedure} onChange={(e) => update("disputeProcedure", e.target.value)} />
      </Field>
      {error ? <Callout tone="danger">{error}</Callout> : null}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={save} loading={saving}>
          Save new version
        </Button>
      </div>
    </div>
  );
}
