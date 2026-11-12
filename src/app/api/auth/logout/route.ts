import { handler, ok } from "@/lib/api/respond";
import { assertSameOrigin } from "@/lib/security/request";
import { destroyCurrentSession } from "@/lib/auth/session";

export const POST = handler(async (request) => {
  assertSameOrigin(request);
  await destroyCurrentSession();
  return ok({ signedOut: true });
});
