import { handler, ok } from "@/lib/api/respond";
import { requirePrincipal } from "@/lib/auth/guards";
import { db } from "@/lib/db";

export const GET = handler(async (request) => {
  const principal = await requirePrincipal(request, "VIEWER");
  const agents = await db.agent.findMany({
    where: { OR: [{ isPlatformAgent: true }, { organizationId: principal.organization.id }] },
    include: { capabilities: true, trustPassport: true, _count: { select: { runs: true, contractsAsWorker: true } } },
    orderBy: [{ role: "asc" }, { registeredAt: "asc" }],
  });
  return ok({ agents });
});
