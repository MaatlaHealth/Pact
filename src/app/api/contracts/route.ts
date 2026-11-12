import { z } from "zod";
import { handler, readJson, ok, created } from "@/lib/api/respond";
import { assertSameOrigin, HttpError } from "@/lib/security/request";
import { requirePrincipal } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { createContractDraft } from "@/lib/contracts/service";
import { rateLimit } from "@/lib/security/rate-limit";
import { geminiConfigured } from "@/lib/gemini/client";

const createSchema = z.object({
  objective: z.string().min(20).max(4000),
  budgetCents: z.number().int().min(100).max(10_000_000),
  currency: z.string().length(3).default("USD"),
  category: z.enum(["LANDING_PAGE", "JSON_DATASET"]),
  deadline: z.string().datetime().nullable().optional(),
  scenario: z.enum(["BEST_EFFORT", "DEFECTIVE_FIRST_DRAFT"]).optional(),
});

export const GET = handler(async (request) => {
  const principal = await requirePrincipal(request, "VIEWER");
  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const contracts = await db.contract.findMany({
    where: { organizationId: principal.organization.id, ...(status ? { status: status as never } : {}) },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { workerAgent: { select: { id: true, name: true, slug: true } }, receipt: { select: { receiptNumber: true } } },
  });
  return ok({ contracts });
});

export const POST = handler(async (request) => {
  assertSameOrigin(request);
  const principal = await requirePrincipal(request, "MEMBER");
  if (!geminiConfigured()) throw new HttpError(503, "Contract generation needs Gemini. Set GEMINI_API_KEY on the server.", "gemini_not_configured");
  const limit = await rateLimit(`contracts:create:${principal.organization.id}`, 30, 3600);
  if (!limit.allowed) throw new HttpError(429, "Contract creation limit reached for this hour.");
  const input = await readJson(request, createSchema);
  const contract = await createContractDraft(principal, { ...input, deadline: input.deadline ? new Date(input.deadline) : null });
  return created({ contract });
});
