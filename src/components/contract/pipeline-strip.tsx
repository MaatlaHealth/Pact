import { Check, Circle, Loader2, X } from "lucide-react";
import type { ContractStatus } from "@/generated/prisma/client";
import { cn } from "@/lib/utils";

type StageState = "done" | "active" | "pending" | "failed";

const STAGES = ["Contract", "Negotiation", "Authorization", "Work", "Verification", "Settlement", "Receipt"] as const;

export function stageStates(status: ContractStatus, hasReceipt: boolean): StageState[] {
  const order: Record<ContractStatus, number> = {
    DRAFT: 0,
    AWAITING_APPROVAL: 0,
    NEGOTIATING: 1,
    AWAITING_PAYMENT_AUTHORIZATION: 2,
    AUTHORIZED: 3,
    IN_PROGRESS: 3,
    UNDER_VERIFICATION: 4,
    CORRECTION_REQUIRED: 4,
    AWAITING_HUMAN_REVIEW: 4,
    ELIGIBLE_FOR_CAPTURE: 5,
    CAPTURE_PENDING: 5,
    CAPTURED: 6,
    VOID_PENDING: 5,
    VOIDED: 5,
    EXPIRED: 5,
    DISPUTED: 6,
    FAILED: 4,
    CANCELLED: 1,
  };
  const terminalFailure = ["VOIDED", "EXPIRED", "FAILED", "CANCELLED"].includes(status);
  const idx = order[status];
  return STAGES.map((_, i) => {
    if (status === "CAPTURED") return i === 6 ? (hasReceipt ? "done" : "active") : "done";
    if (i < idx) return "done";
    if (i === idx) return terminalFailure ? "failed" : "active";
    return "pending";
  });
}

export function PipelineStrip({ status, hasReceipt }: { status: ContractStatus; hasReceipt: boolean }) {
  const states = stageStates(status, hasReceipt);
  return (
    <ol className="flex flex-wrap items-center gap-y-2" aria-label="Contract progress">
      {STAGES.map((name, i) => {
        const state = states[i];
        return (
          <li key={name} className="flex items-center">
            <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium", state === "done" && "border-success/30 bg-success-soft text-success", state === "active" && "border-navy/30 bg-navy-soft text-navy", state === "failed" && "border-danger/30 bg-danger-soft text-danger", state === "pending" && "border-border text-faint")}>
              {state === "done" ? <Check className="h-3 w-3" aria-hidden /> : state === "active" ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : state === "failed" ? <X className="h-3 w-3" aria-hidden /> : <Circle className="h-3 w-3" aria-hidden />}
              {name}
            </span>
            {i < STAGES.length - 1 ? <span className="mx-1.5 h-px w-3 bg-border-strong sm:w-5" aria-hidden /> : null}
          </li>
        );
      })}
    </ol>
  );
}
