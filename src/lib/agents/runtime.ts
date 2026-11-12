import { randomUUID } from "node:crypto";
import type { Content, FunctionDeclaration } from "@google/genai";
import type { Prisma, AgentRunPurpose, AgentMessageKind, AgentRun } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/lib/audit";
import { generate, functionResponseContent, type TokenUsage } from "@/lib/gemini/client";

/**
 * Shared agent runtime. Every model call, tool call, and message is persisted
 * against an AgentRun with a correlation ID so the live activity view and the
 * audit trail show what actually happened.
 */

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

export interface RunHandle {
  run: AgentRun;
  agentId: string;
  agentName: string;
  contractId: string | null;
  organizationId: string | null;
  correlationId: string;
  usage: TokenUsage;
  sequence: number;
}

export async function startRun(input: { agentId: string; contractId: string | null; purpose: AgentRunPurpose; model: string; correlationId?: string }): Promise<RunHandle> {
  const agent = await db.agent.findUniqueOrThrow({ where: { id: input.agentId } });
  const correlationId = input.correlationId ?? randomUUID();
  const run = await db.agentRun.create({ data: { agentId: input.agentId, contractId: input.contractId, purpose: input.purpose, model: input.model, correlationId, status: "RUNNING", startedAt: new Date() } });
  const contract = input.contractId ? await db.contract.findUnique({ where: { id: input.contractId }, select: { organizationId: true } }) : null;
  await recordAudit({
    organizationId: contract?.organizationId ?? agent.organizationId,
    contractId: input.contractId,
    actorType: "AGENT",
    actorId: agent.id,
    actorLabel: agent.name,
    action: `agent.run_started`,
    entityType: "agent_run",
    entityId: run.id,
    title: `${agent.name} started ${input.purpose.toLowerCase().replace(/_/g, " ")}`,
    metadata: { correlationId, model: input.model, role: agent.role },
  });
  return { run, agentId: agent.id, agentName: agent.name, contractId: input.contractId, organizationId: contract?.organizationId ?? agent.organizationId, correlationId, usage: { inputTokens: 0, outputTokens: 0 }, sequence: 0 };
}

export async function finishRun(handle: RunHandle, result: { status: "SUCCEEDED" | "FAILED" | "TIMED_OUT" | "CANCELLED"; summary?: string; error?: string; iterations?: number }) {
  await db.agentRun.update({
    where: { id: handle.run.id },
    data: { status: result.status, summary: result.summary?.slice(0, 2000), error: result.error?.slice(0, 2000), finishedAt: new Date(), inputTokens: handle.usage.inputTokens, outputTokens: handle.usage.outputTokens, iterations: result.iterations ?? handle.sequence },
  });
  await recordAudit({
    organizationId: handle.organizationId,
    contractId: handle.contractId,
    actorType: "AGENT",
    actorId: handle.agentId,
    actorLabel: handle.agentName,
    action: `agent.run_${result.status.toLowerCase()}`,
    entityType: "agent_run",
    entityId: handle.run.id,
    title: `${handle.agentName} ${result.status === "SUCCEEDED" ? "finished" : result.status.toLowerCase().replace(/_/g, " ")}: ${result.summary ?? result.error ?? ""}`.slice(0, 250),
    severity: result.status === "SUCCEEDED" ? "INFO" : "WARNING",
    metadata: { correlationId: handle.correlationId, inputTokens: handle.usage.inputTokens, outputTokens: handle.usage.outputTokens },
  });
}

export async function recordMessage(handle: RunHandle, input: { kind: AgentMessageKind; content: string; toAgentId?: string | null; structured?: unknown }) {
  handle.sequence += 1;
  const message = await db.agentMessage.create({
    data: {
      runId: handle.run.id,
      contractId: handle.contractId,
      fromAgentId: handle.agentId,
      toAgentId: input.toAgentId ?? null,
      kind: input.kind,
      sequence: handle.sequence,
      content: input.content.slice(0, 8000),
      structured: input.structured === undefined ? undefined : toJson(input.structured),
      correlationId: handle.correlationId,
    },
  });
  await recordAudit({
    organizationId: handle.organizationId,
    contractId: handle.contractId,
    actorType: "AGENT",
    actorId: handle.agentId,
    actorLabel: handle.agentName,
    action: `agent.message.${input.kind.toLowerCase()}`,
    entityType: "agent_message",
    entityId: message.id,
    title: `${handle.agentName}: ${input.kind.toLowerCase().replace(/_/g, " ")}`,
    description: input.content.slice(0, 600),
    metadata: { correlationId: handle.correlationId, toAgentId: input.toAgentId ?? null },
  });
  return message;
}

export async function recordTool<T>(handle: RunHandle, toolName: string, input: unknown, fn: () => Promise<T>, options: { timeoutMs?: number } = {}): Promise<T> {
  const execution = await db.agentToolExecution.create({ data: { runId: handle.run.id, toolName, input: toJson(input) } });
  const started = Date.now();
  const timeoutMs = options.timeoutMs ?? 120_000;
  let timer: NodeJS.Timeout | undefined;
  try {
    const result = await Promise.race<T>([
      fn(),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new ToolTimeoutError(toolName, timeoutMs)), timeoutMs);
      }),
    ]);
    await db.agentToolExecution.update({ where: { id: execution.id }, data: { status: "SUCCEEDED", output: toJson(summariseOutput(result)), finishedAt: new Date(), durationMs: Date.now() - started } });
    return result;
  } catch (error) {
    const timedOut = error instanceof ToolTimeoutError;
    await db.agentToolExecution.update({ where: { id: execution.id }, data: { status: timedOut ? "TIMED_OUT" : "FAILED", error: String(error).slice(0, 2000), finishedAt: new Date(), durationMs: Date.now() - started } });
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function summariseOutput(value: unknown): unknown {
  const text = JSON.stringify(value ?? null);
  if (text.length <= 60_000) return value;
  return { truncated: true, preview: text.slice(0, 60_000) };
}

export class ToolTimeoutError extends Error {
  constructor(tool: string, ms: number) {
    super(`Tool ${tool} timed out after ${ms} ms.`);
    this.name = "ToolTimeoutError";
  }
}

export class AgentBudgetExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentBudgetExceededError";
  }
}

export interface ToolDefinition {
  declaration: FunctionDeclaration;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
  timeoutMs?: number;
}

export interface LoopOptions {
  model: string;
  systemInstruction: string;
  initialContents: Content[];
  tools: ToolDefinition[];
  maxIterations: number;
  /** Tool whose successful call ends the loop. */
  terminalTool: string;
  temperature?: number;
}

export interface LoopResult {
  terminated: boolean;
  terminalArgs: Record<string, unknown> | null;
  iterations: number;
  lastText: string | null;
}

/**
 * Bounded tool-calling loop. Stops at maxIterations, at the token ceiling, or
 * when the terminal tool is called successfully. Every tool call is persisted.
 */
export async function runToolLoop(handle: RunHandle, options: LoopOptions): Promise<LoopResult> {
  const maxTokens = env().GEMINI_MAX_TOKENS_PER_RUN;
  const contents: Content[] = [...options.initialContents];
  let lastText: string | null = null;
  for (let iteration = 1; iteration <= options.maxIterations; iteration += 1) {
    const result = await generate({
      model: options.model,
      systemInstruction: options.systemInstruction,
      contents,
      tools: options.tools.map((t) => t.declaration),
      temperature: options.temperature ?? 0.3,
      timeoutMs: 120_000,
    });
    handle.usage.inputTokens += result.usage.inputTokens;
    handle.usage.outputTokens += result.usage.outputTokens;
    await db.agentRun.update({ where: { id: handle.run.id }, data: { iterations: iteration, inputTokens: handle.usage.inputTokens, outputTokens: handle.usage.outputTokens } });
    if (handle.usage.inputTokens + handle.usage.outputTokens > maxTokens) {
      throw new AgentBudgetExceededError(`Run exceeded the token ceiling of ${maxTokens}.`);
    }
    if (result.modelContent) contents.push(result.modelContent);
    if (result.text) lastText = result.text;
    if (result.functionCalls.length === 0) {
      // Model replied with prose only. Nudge it toward the tools once, then stop.
      if (iteration >= options.maxIterations) break;
      contents.push({ role: "user", parts: [{ text: `Continue using the available tools. Call ${options.terminalTool} when you are done.` }] });
      continue;
    }
    const responses: { id?: string; name: string; response: Record<string, unknown> }[] = [];
    for (const call of result.functionCalls) {
      const tool = options.tools.find((t) => t.declaration.name === call.name);
      if (!tool) {
        responses.push({ id: call.id, name: call.name, response: { error: `Unknown tool ${call.name}.` } });
        continue;
      }
      try {
        const output = await recordTool(handle, call.name, call.args, () => tool.handler(call.args), { timeoutMs: tool.timeoutMs });
        responses.push({ id: call.id, name: call.name, response: { result: output ?? null } });
        if (call.name === options.terminalTool) {
          return { terminated: true, terminalArgs: call.args, iterations: iteration, lastText };
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn("Agent tool failed", { tool: call.name, runId: handle.run.id, error: message });
        responses.push({ id: call.id, name: call.name, response: { error: message } });
      }
    }
    contents.push(functionResponseContent(responses));
  }
  return { terminated: false, terminalArgs: null, iterations: options.maxIterations, lastText };
}

export async function platformAgent(role: "BUYER" | "WORKER" | "VERIFIER") {
  const agent = await db.agent.findFirst({ where: { role, isPlatformAgent: true, status: "ACTIVE" }, orderBy: { registeredAt: "asc" } });
  if (!agent) throw new Error(`No platform ${role.toLowerCase()} agent is registered. Run the seed.`);
  return agent;
}
