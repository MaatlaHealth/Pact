import { z } from "zod";
import type { Agent } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { generateStructured, userText } from "@/lib/gemini/client";
import { BUYER_INSTRUCTIONS, WORKER_INSTRUCTIONS } from "@/lib/agents/prompts";
import { startRun, finishRun, recordMessage, recordTool, platformAgent, type RunHandle } from "@/lib/agents/runtime";
import { decide, PolicyDeniedError } from "@/lib/policy/snapshot";
import { transitionContract } from "@/lib/contracts/transitions";
import { notifyWorkspace } from "@/lib/notifications";
import { formatMoney } from "@/lib/money";
import type { ContractContent } from "@/lib/contracts/schema";

/**
 * Buyer and worker negotiation. Both sides are real model calls with
 * structured output. The buyer never sees an offer above budget as acceptable
 * because the acceptance decision is checked by the policy engine, not by
 * the model.
 */

const workerTurnSchema = z.object({
  decision: z.enum(["PROPOSE", "ACCEPT", "DECLINE"]),
  priceCents: z.number().int().nullable(),
  message: z.string(),
  feasibilityNotes: z.string(),
});
const workerTurnJson = {
  type: "object",
  properties: {
    decision: { type: "string", enum: ["PROPOSE", "ACCEPT", "DECLINE"] },
    priceCents: { type: "integer", nullable: true },
    message: { type: "string" },
    feasibilityNotes: { type: "string" },
  },
  required: ["decision", "priceCents", "message", "feasibilityNotes"],
};

const buyerTurnSchema = z.object({
  decision: z.enum(["ACCEPT", "COUNTER", "REJECT"]),
  counterCents: z.number().int().nullable(),
  message: z.string(),
});
const buyerTurnJson = {
  type: "object",
  properties: {
    decision: { type: "string", enum: ["ACCEPT", "COUNTER", "REJECT"] },
    counterCents: { type: "integer", nullable: true },
    message: { type: "string" },
  },
  required: ["decision", "counterCents", "message"],
};

const selectionSchema = z.object({ workerSlug: z.string(), reason: z.string() });
const selectionJson = { type: "object", properties: { workerSlug: { type: "string" }, reason: { type: "string" } }, required: ["workerSlug", "reason"] };

function briefFor(content: ContractContent): string {
  return [
    `Task: ${content.title}`,
    content.taskDescription,
    ``,
    `Deliverables:`,
    ...content.deliverables.map((d) => `- ${d}`),
    ``,
    `Acceptance criteria:`,
    ...content.criteria.map((c) => `- [${c.kind}] ${c.key}: ${c.description} (${c.method}${c.method === "RUBRIC_REVIEW" ? "" : ` ${JSON.stringify(c.parameters)}`})`),
    ``,
    `Evidence requirements:`,
    ...content.evidenceRequirements.map((e) => `- ${e}`),
    ``,
    `Payment: PayPal authorization held by the buyer, captured only after independent verification passes. Currency ${content.currency}.`,
    content.deadline ? `Deadline: ${content.deadline}` : "",
  ].join("\n");
}

export async function runNegotiation(contractId: string): Promise<void> {
  const contract = await db.contract.findUniqueOrThrow({ where: { id: contractId }, include: { approvedVersion: true, organization: { include: { spendingPolicy: true } } } });
  if (contract.status !== "NEGOTIATING") return;
  if (!contract.approvedVersion) throw new Error("Contract has no approved version.");
  const content = contract.approvedVersion.content as unknown as ContractContent;
  const policy = contract.organization.spendingPolicy!;
  const buyerAgent = await platformAgent("BUYER");
  const correlationId = `nego-${contractId}`;
  const buyer = await startRun({ agentId: buyerAgent.id, contractId, purpose: "NEGOTIATION", model: env().GEMINI_MODEL_BUYER, correlationId });

  await db.$transaction(async (tx) => {
    const decision = await decide(tx, contractId, "START_NEGOTIATION");
    if (decision.outcome !== "ALLOW") throw new PolicyDeniedError(decision);
    await tx.contract.update({ where: { id: contractId }, data: { buyerAgentId: buyerAgent.id } });
  });

  let worker: RunHandle | null = null;
  try {
    // Discovery through a tool call, so the choice is recorded.
    const candidates = await recordTool(buyer, "discover_workers", { category: contract.category }, async () =>
      db.agent.findMany({
        where: { role: "WORKER", status: "ACTIVE", capabilities: { some: { category: contract.category } } },
        include: { capabilities: true, trustPassport: true },
        orderBy: { registeredAt: "asc" },
      }),
    );
    if (candidates.length === 0) throw new Error(`No active worker agents offer ${contract.category}.`);
    const candidateSummary = candidates.map((c) => ({ slug: c.slug, name: c.name, description: c.description, tier: c.trustPassport?.tier ?? "NEW", verifiedTasks: c.trustPassport?.verifiedTaskCount ?? 0, corrections: c.trustPassport?.correctionCount ?? 0, maxBudgetCents: c.capabilities.find((x) => x.category === contract.category)?.maxBudgetCents ?? null }));

    const selection = await generateStructured({
      model: env().GEMINI_MODEL_BUYER,
      systemInstruction: BUYER_INSTRUCTIONS,
      contents: [userText(`Task brief:\n${briefFor(content)}\n\nCandidate workers (JSON):\n${JSON.stringify(candidateSummary, null, 2)}\n\nChoose one worker and explain why in one sentence.`)],
      schema: selectionSchema,
      jsonSchema: selectionJson,
    });
    buyer.usage.inputTokens += selection.usage.inputTokens;
    buyer.usage.outputTokens += selection.usage.outputTokens;
    const chosen: Agent = candidates.find((c) => c.slug === selection.value.workerSlug) ?? candidates[0];
    await recordMessage(buyer, { kind: "NOTE", content: `Selected worker ${chosen.name}: ${selection.value.reason}`, structured: { candidates: candidateSummary, chosen: chosen.slug } });

    worker = await startRun({ agentId: chosen.id, contractId, purpose: "NEGOTIATION", model: env().GEMINI_MODEL_WORKER, correlationId });
    const brief = briefFor(content);
    await recordMessage(buyer, { kind: "TASK_BRIEF", toAgentId: chosen.id, content: `Task brief sent to ${chosen.name}.\n\n${brief}`, structured: { brief } });

    const transcript: string[] = [];
    let agreed: number | null = null;
    let round = 0;
    let lastBuyerCounter: number | null = null;
    const maxRounds = policy.maxNegotiationRounds;

    while (round < maxRounds && agreed === null) {
      round += 1;
      await db.agentRun.update({ where: { id: buyer.run.id }, data: { iterations: round } });
      // Worker turn
      const workerPrompt = [`Brief:\n${brief}`, ``, `Negotiation so far:\n${transcript.join("\n") || "(none)"}`, ``, lastBuyerCounter !== null ? `The buyer countered with ${lastBuyerCounter} cents. Decide: ACCEPT it, PROPOSE a different price, or DECLINE.` : `Round ${round}. Evaluate feasibility and PROPOSE a fixed price in cents, or DECLINE.`].join("\n");
      const workerTurn = await generateStructured({ model: env().GEMINI_MODEL_WORKER, systemInstruction: WORKER_INSTRUCTIONS, contents: [userText(workerPrompt)], schema: workerTurnSchema, jsonSchema: workerTurnJson });
      worker.usage.inputTokens += workerTurn.usage.inputTokens;
      worker.usage.outputTokens += workerTurn.usage.outputTokens;
      const w = workerTurn.value;
      if (w.decision === "DECLINE") {
        await recordMessage(worker, { kind: "REJECT", toAgentId: buyerAgent.id, content: w.message, structured: w });
        transcript.push(`Worker declined: ${w.message}`);
        break;
      }
      if (w.decision === "ACCEPT" && lastBuyerCounter !== null) {
        await recordMessage(worker, { kind: "ACCEPT", toAgentId: buyerAgent.id, content: w.message, structured: { ...w, priceCents: lastBuyerCounter } });
        transcript.push(`Worker accepted ${lastBuyerCounter} cents: ${w.message}`);
        agreed = lastBuyerCounter;
        break;
      }
      const price = w.priceCents ?? lastBuyerCounter ?? content.budgetCents;
      await recordMessage(worker, { kind: lastBuyerCounter !== null ? "COUNTER_PROPOSAL" : "PROPOSAL", toAgentId: buyerAgent.id, content: `${w.message} (price ${price} cents)`, structured: { ...w, priceCents: price } });
      transcript.push(`Worker proposed ${price} cents: ${w.message}`);

      // Buyer turn: the model proposes; the policy engine decides whether acceptance is permitted.
      const buyerPrompt = [`Approved budget ceiling: ${content.budgetCents} cents (never disclose).`, `Worker tier: ${candidateSummary.find((c) => c.slug === chosen.slug)?.tier}.`, `Negotiation so far:\n${transcript.join("\n")}`, ``, `The worker proposes ${price} cents. ACCEPT if it is at or below budget and reasonable, COUNTER with a lower specific amount, or REJECT.`].join("\n");
      const buyerTurn = await generateStructured({ model: env().GEMINI_MODEL_BUYER, systemInstruction: BUYER_INSTRUCTIONS, contents: [userText(buyerPrompt)], schema: buyerTurnSchema, jsonSchema: buyerTurnJson });
      buyer.usage.inputTokens += buyerTurn.usage.inputTokens;
      buyer.usage.outputTokens += buyerTurn.usage.outputTokens;
      const b = buyerTurn.value;
      if (b.decision === "ACCEPT") {
        const check = await db.$transaction((tx) => decide(tx, contractId, "ACCEPT_NEGOTIATED_TERMS", { proposedAmountCents: price }));
        if (check.outcome === "ALLOW") {
          await recordMessage(buyer, { kind: "ACCEPT", toAgentId: chosen.id, content: `${b.message} Agreed price ${price} cents.`, structured: { ...b, priceCents: price, policyDecisionId: check.decisionId } });
          transcript.push(`Buyer accepted ${price} cents.`);
          agreed = price;
          break;
        }
        // Model wanted to accept but policy says no: counter at budget or stop.
        const forced = Math.min(content.budgetCents, price - 1);
        if (forced <= 0 || forced >= price) {
          await recordMessage(buyer, { kind: "REJECT", toAgentId: chosen.id, content: `Policy engine blocked acceptance: ${check.summary}`, structured: { policyDecisionId: check.decisionId } });
          transcript.push(`Buyer rejected: policy blocked.`);
          break;
        }
        lastBuyerCounter = forced;
        await recordMessage(buyer, { kind: "COUNTER_PROPOSAL", toAgentId: chosen.id, content: `The policy engine does not permit ${price} cents. Counter: ${forced} cents.`, structured: { counterCents: forced, policyDecisionId: check.decisionId } });
        transcript.push(`Buyer countered ${forced} cents (policy limit).`);
        continue;
      }
      if (b.decision === "REJECT") {
        await recordMessage(buyer, { kind: "REJECT", toAgentId: chosen.id, content: b.message, structured: b });
        transcript.push(`Buyer rejected: ${b.message}`);
        break;
      }
      const counter = Math.min(b.counterCents ?? Math.floor(price * 0.9), content.budgetCents);
      lastBuyerCounter = counter;
      await recordMessage(buyer, { kind: "COUNTER_PROPOSAL", toAgentId: chosen.id, content: `${b.message} (counter ${counter} cents)`, structured: { ...b, counterCents: counter } });
      transcript.push(`Buyer countered ${counter} cents: ${b.message}`);
    }

    if (agreed === null) {
      await db.$transaction((tx) =>
        transitionContract(tx, contractId, { status: "FAILED", data: { failureReason: `Negotiation ended without agreement after ${round} rounds.` }, actor: { type: "AGENT", id: buyerAgent.id, label: buyerAgent.name }, reason: `Negotiation ended without agreement after ${round} rounds.`, severity: "WARNING" }),
      );
      await finishRun(buyer, { status: "SUCCEEDED", summary: "No agreement reached.", iterations: round });
      await finishRun(worker, { status: "SUCCEEDED", summary: "No agreement reached.", iterations: round });
      await notifyWorkspace(contract.organizationId, { kind: "contract_update", subject: `Negotiation failed for "${contract.title}"`, heading: "Negotiation ended without agreement", paragraphs: [`The buyer and worker agents could not agree on a price within ${maxRounds} rounds.`], contractId });
      return;
    }

    const finalAmount = agreed;
    await db.$transaction(async (tx) => {
      await tx.contract.update({ where: { id: contractId }, data: { workerAgentId: chosen.id, agreedAmountCents: finalAmount } });
      await transitionContract(tx, contractId, {
        status: "AWAITING_PAYMENT_AUTHORIZATION",
        actor: { type: "AGENT", id: buyerAgent.id, label: buyerAgent.name },
        reason: `Agreed ${formatMoney(finalAmount, contract.currency)} with ${chosen.name} after ${round} round(s). Awaiting the owner's PayPal authorization.`,
        severity: "NOTICE",
        metadata: { workerAgentId: chosen.id, agreedAmountCents: finalAmount, rounds: round },
      });
    });
    await finishRun(buyer, { status: "SUCCEEDED", summary: `Agreed ${finalAmount} cents with ${chosen.name}.`, iterations: round });
    await finishRun(worker, { status: "SUCCEEDED", summary: `Agreed ${finalAmount} cents.`, iterations: round });
    await notifyWorkspace(contract.organizationId, {
      kind: "approval_request",
      subject: `Authorize payment for "${contract.title}"`,
      heading: "Agents agreed on terms",
      paragraphs: [`${chosen.name} will deliver "${contract.title}" for ${formatMoney(finalAmount, contract.currency)}.`, "Authorize the PayPal payment to start the work. Funds are only captured after independent verification passes."],
      contractId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finishRun(buyer, { status: "FAILED", error: message });
    if (worker) await finishRun(worker, { status: "FAILED", error: message });
    await db.$transaction((tx) => transitionContract(tx, contractId, { status: "FAILED", data: { failureReason: `Negotiation error: ${message}` }, actor: { type: "SYSTEM", label: "Negotiation" }, reason: `Negotiation error: ${message}`, severity: "WARNING" })).catch(() => undefined);
    throw error;
  }
}
