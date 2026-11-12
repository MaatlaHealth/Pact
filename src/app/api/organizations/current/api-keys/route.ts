import { z } from "zod";
import { handler, readJson, ok, created } from "@/lib/api/respond";
import { assertSameOrigin, HttpError } from "@/lib/security/request";
import { requirePrincipal } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { generateToken, hashToken } from "@/lib/security/tokens";
import { recordAudit } from "@/lib/audit";

export const GET = handler(async (request) => {
  const principal = await requirePrincipal(request, "ADMIN");
  const keys = await db.apiKey.findMany({ where: { organizationId: principal.organization.id }, select: { id: true, name: true, prefix: true, scopes: true, createdAt: true, lastUsedAt: true, revokedAt: true }, orderBy: { createdAt: "desc" } });
  return ok({ keys });
});

export const POST = handler(async (request) => {
  assertSameOrigin(request);
  const principal = await requirePrincipal(request, "ADMIN");
  if (!principal.userId || principal.kind !== "user") throw new HttpError(403, "Only signed-in admins can create API keys.");
  const { name, scopes } = await readJson(request, z.object({ name: z.string().min(2).max(60), scopes: z.array(z.enum(["read", "write"])).min(1) }));
  const raw = `pact_${generateToken(24)}`;
  const prefix = raw.slice(0, 12);
  const key = await db.apiKey.create({ data: { organizationId: principal.organization.id, name, prefix, keyHash: hashToken(raw), scopes, createdById: principal.userId } });
  await recordAudit({ organizationId: principal.organization.id, actorType: "USER", actorId: principal.userId, actorLabel: principal.userName, action: "api_key.created", entityType: "api_key", entityId: key.id, title: `API key "${name}" created (${scopes.join(", ")})`, severity: "NOTICE" });
  // The raw key is returned exactly once and never stored.
  return created({ key: { id: key.id, name, prefix, scopes, createdAt: key.createdAt }, secret: raw });
});

export const DELETE = handler(async (request) => {
  assertSameOrigin(request);
  const principal = await requirePrincipal(request, "ADMIN");
  const { id } = await readJson(request, z.object({ id: z.string().uuid() }));
  const key = await db.apiKey.findFirst({ where: { id, organizationId: principal.organization.id } });
  if (!key) throw new HttpError(404, "API key not found.");
  await db.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
  await recordAudit({ organizationId: principal.organization.id, actorType: "USER", actorId: principal.userId, actorLabel: principal.userName, action: "api_key.revoked", entityType: "api_key", entityId: id, title: `API key "${key.name}" revoked`, severity: "NOTICE" });
  return ok({ revoked: true });
});
