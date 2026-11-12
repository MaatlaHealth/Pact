import { handler, ok, readJson } from "@/lib/api/respond";
import { assertSameOrigin, HttpError } from "@/lib/security/request";
import { requirePrincipal, requireContract } from "@/lib/auth/guards";
import { contractContentSchema } from "@/lib/contracts/schema";
import { editContract } from "@/lib/contracts/service";
import { loadContractDetail } from "@/lib/contracts/loaders";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler(async (request, ctx: Ctx) => {
  const principal = await requirePrincipal(request, "VIEWER");
  const { id } = await ctx.params;
  const detail = await loadContractDetail(principal.organization.id, id);
  if (!detail) throw new HttpError(404, "Contract not found.");
  return ok(detail);
});

export const PUT = handler(async (request, ctx: Ctx) => {
  assertSameOrigin(request);
  const principal = await requirePrincipal(request, "MEMBER");
  const { id } = await ctx.params;
  await requireContract(principal, id);
  const content = await readJson(request, contractContentSchema);
  const version = await editContract(principal, id, content);
  return ok({ version });
});
