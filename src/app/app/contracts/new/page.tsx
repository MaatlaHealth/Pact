import type { Metadata } from "next";
import { requireAppContext } from "@/lib/auth/app-context";
import { db } from "@/lib/db";
import { integrationStatuses } from "@/lib/env";
import { PageHeader, Callout } from "@/components/ui/primitives";
import { NewContractForm } from "@/components/app/new-contract-form";

export const metadata: Metadata = { title: "New contract" };

export default async function NewContractPage() {
  const ctx = await requireAppContext();
  const policy = await db.spendingPolicy.findUniqueOrThrow({ where: { organizationId: ctx.organization.id } });
  const gemini = integrationStatuses().find((s) => s.name === "gemini")!;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Stage 2" title="Define a goal" description="Write what you need in plain language. The contract generator turns it into deliverables, acceptance criteria, and payment rules for you to review before anything is authorized." />
      {!gemini.configured ? (
        <Callout tone="warning" title="Contract generation is unavailable on this deployment" className="mb-6">
          {gemini.detail} {gemini.instructions}
        </Callout>
      ) : null}
      <NewContractForm policy={{ currency: policy.currency, maxTransactionAmountCents: policy.maxTransactionAmountCents, allowedCategories: policy.allowedCategories, requireHumanApprovalForCapture: policy.requireHumanApprovalForCapture }} judgeWorkspace={ctx.organization.kind === "JUDGE_DEMO"} generationAvailable={gemini.configured} />
    </div>
  );
}
