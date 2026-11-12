import { handler, ok } from "@/lib/api/respond";
import { requireUser } from "@/lib/auth/guards";
import { integrationStatuses } from "@/lib/env";

export const GET = handler(async () => {
  await requireUser();
  return ok({ integrations: integrationStatuses() });
});
