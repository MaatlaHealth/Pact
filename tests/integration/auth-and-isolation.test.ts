import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/lib/db";
import { requirePrincipal, requireContract } from "@/lib/auth/guards";
import { verifyEmailToken, resetPassword, issueEmailVerification, requestPasswordReset } from "@/lib/auth/service";
import { hashToken } from "@/lib/security/tokens";
import { verifyPassword } from "@/lib/security/password";
import { createOrgWithOwner, cleanupOrg, createContractWithVersion } from "./fixtures";

let a: Awaited<ReturnType<typeof createOrgWithOwner>>;
let b: Awaited<ReturnType<typeof createOrgWithOwner>>;

beforeAll(async () => {
  a = await createOrgWithOwner("org-a");
  b = await createOrgWithOwner("org-b");
});

afterAll(async () => {
  await cleanupOrg(a.organization.id);
  await cleanupOrg(b.organization.id);
});

describe("API key authentication", () => {
  it("resolves a principal from a bearer key and rejects unknown keys", async () => {
    const request = new Request("http://localhost/api/contracts", { headers: { authorization: `Bearer ${a.apiKey}` } });
    const principal = await requirePrincipal(request, "ADMIN");
    expect(principal.kind).toBe("api_key");
    expect(principal.organization.id).toBe(a.organization.id);
    await expect(requirePrincipal(new Request("http://localhost/x", { headers: { authorization: "Bearer pact_nope" } }))).rejects.toMatchObject({ status: 401 });
  });

  it("rejects a revoked key", async () => {
    const key = await db.apiKey.findFirstOrThrow({ where: { organizationId: b.organization.id } });
    await db.apiKey.update({ where: { id: key.id }, data: { revokedAt: new Date() } });
    await expect(requirePrincipal(new Request("http://localhost/x", { headers: { authorization: `Bearer ${b.apiKey}` } }))).rejects.toMatchObject({ status: 401 });
    await db.apiKey.update({ where: { id: key.id }, data: { revokedAt: null } });
  });
});

describe("organization isolation", () => {
  it("does not expose one workspace's contract to another", async () => {
    const { contract } = await createContractWithVersion(a.principal);
    await expect(requireContract(a.principal, contract.id)).resolves.toMatchObject({ id: contract.id });
    await expect(requireContract(b.principal, contract.id)).rejects.toMatchObject({ status: 404 });
  });
});

describe("email verification and password reset tokens", () => {
  it("verifies with a valid token once", async () => {
    const user = await db.user.update({ where: { id: a.user.id }, data: { emailVerifiedAt: null } });
    await issueEmailVerification(user.id, user.email, user.name);
    const record = await db.emailVerificationToken.findFirstOrThrow({ where: { userId: user.id, usedAt: null } });
    // Tokens are stored hashed; recreate a known token to exercise the lookup path.
    const token = "known-verification-token-for-tests";
    await db.emailVerificationToken.update({ where: { id: record.id }, data: { tokenHash: hashToken(token) } });
    await verifyEmailToken(token);
    const verified = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(verified.emailVerifiedAt).not.toBeNull();
    await expect(verifyEmailToken(token)).rejects.toMatchObject({ status: 400 });
  });

  it("resets the password and invalidates sessions", async () => {
    await requestPasswordReset(a.user.email);
    const record = await db.passwordResetToken.findFirstOrThrow({ where: { userId: a.user.id, usedAt: null } });
    const token = "known-reset-token-for-tests";
    await db.passwordResetToken.update({ where: { id: record.id }, data: { tokenHash: hashToken(token) } });
    await db.session.create({ data: { userId: a.user.id, tokenHash: hashToken("sess"), expiresAt: new Date(Date.now() + 10000) } });
    await resetPassword(token, "NewHorse42Battery");
    const user = await db.user.findUniqueOrThrow({ where: { id: a.user.id } });
    expect(await verifyPassword("NewHorse42Battery", user.passwordHash)).toBe(true);
    const sessions = await db.session.findMany({ where: { userId: a.user.id, revokedAt: null } });
    expect(sessions).toHaveLength(0);
    await expect(resetPassword(token, "AnotherHorse42Battery")).rejects.toMatchObject({ status: 400 });
    await expect(resetPassword("x".repeat(20), "weak")).rejects.toMatchObject({ status: 422 });
  });
});
