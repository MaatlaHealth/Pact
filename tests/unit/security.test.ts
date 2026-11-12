import { describe, it, expect, beforeAll } from "vitest";
import { hashPassword, verifyPassword, passwordPolicyProblems } from "@/lib/security/password";
import { isPrivateAddress, assertSafeUrl, UnsafeUrlError } from "@/lib/security/url-safety";
import { assertSameOrigin, HttpError } from "@/lib/security/request";
import { redact } from "@/lib/logger";
import { validateArtifactFiles, DeliverableValidationError } from "@/lib/deliverables/service";
import { assertSafeKey } from "@/lib/storage";

beforeAll(() => {
  process.env.APP_SECRET = "test-secret-test-secret-test-secret-123456";
  process.env.APP_URL = "https://pact.example.com";
  process.env.DATABASE_URL = "postgresql://unused";
});

describe("passwords", () => {
  it("hashes with scrypt and verifies", async () => {
    const hash = await hashPassword("CorrectHorse42Battery");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("CorrectHorse42Battery", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
    expect(await verifyPassword("x", "garbage")).toBe(false);
  });

  it("enforces the password policy", () => {
    expect(passwordPolicyProblems("short")).not.toHaveLength(0);
    expect(passwordPolicyProblems("alllowercase12345")).not.toHaveLength(0);
    expect(passwordPolicyProblems("CorrectHorse42Battery")).toHaveLength(0);
  });
});

describe("SSRF protection", () => {
  it("classifies private addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1"]) expect(isPrivateAddress(ip), ip).toBe(true);
    for (const ip of ["8.8.8.8", "151.101.1.69", "2606:4700::1111"]) expect(isPrivateAddress(ip), ip).toBe(false);
  });

  it("rejects unsafe URLs before any network call", async () => {
    await expect(assertSafeUrl("http://10.0.0.1/admin")).rejects.toBeInstanceOf(UnsafeUrlError);
    await expect(assertSafeUrl("https://127.0.0.1/")).rejects.toBeInstanceOf(UnsafeUrlError);
    await expect(assertSafeUrl("https://169.254.169.254/latest/meta-data")).rejects.toBeInstanceOf(UnsafeUrlError);
    await expect(assertSafeUrl("ftp://example.com/")).rejects.toBeInstanceOf(UnsafeUrlError);
    await expect(assertSafeUrl("https://user:pass@example.com/")).rejects.toBeInstanceOf(UnsafeUrlError);
    await expect(assertSafeUrl("https://localhost/")).rejects.toBeInstanceOf(UnsafeUrlError);
    await expect(assertSafeUrl("not a url")).rejects.toBeInstanceOf(UnsafeUrlError);
  });

  it("allows explicitly allowlisted hosts", async () => {
    const url = await assertSafeUrl("http://localhost:3000/preview/x/index.html", { allowHosts: ["localhost"], allowHttp: true });
    expect(url.hostname).toBe("localhost");
  });
});

describe("CSRF origin check", () => {
  it("rejects cross-site state changes and allows same-origin and API keys", () => {
    const cross = new Request("https://pact.example.com/api/contracts", { method: "POST", headers: { origin: "https://evil.example" } });
    expect(() => assertSameOrigin(cross)).toThrow(HttpError);
    const same = new Request("https://pact.example.com/api/contracts", { method: "POST", headers: { origin: "https://pact.example.com" } });
    expect(() => assertSameOrigin(same)).not.toThrow();
    const apiKey = new Request("https://pact.example.com/api/contracts", { method: "POST", headers: { origin: "https://evil.example", authorization: "Bearer pact_x" } });
    expect(() => assertSameOrigin(apiKey)).not.toThrow();
    const get = new Request("https://pact.example.com/api/contracts", { method: "GET", headers: { origin: "https://evil.example" } });
    expect(() => assertSameOrigin(get)).not.toThrow();
    const fetchSite = new Request("https://pact.example.com/api/contracts", { method: "POST", headers: { "sec-fetch-site": "cross-site" } });
    expect(() => assertSameOrigin(fetchSite)).toThrow(HttpError);
  });
});

describe("log redaction", () => {
  it("masks secrets in objects and strings", () => {
    const out = redact({ client_secret: "abc", nested: { apiKey: "k", fine: "ok" }, text: "Authorization: Bearer A21AAverysecrettoken" }) as Record<string, unknown>;
    expect(out.client_secret).toBe("[redacted]");
    expect((out.nested as Record<string, unknown>).apiKey).toBe("[redacted]");
    expect((out.nested as Record<string, unknown>).fine).toBe("ok");
    expect(String(out.text)).not.toContain("verysecrettoken");
  });
});

describe("deliverable validation", () => {
  it("rejects path traversal, disallowed types, and oversized files", () => {
    expect(() => validateArtifactFiles([{ path: "../index.html", content: "x" }], "STATIC_SITE")).toThrow(DeliverableValidationError);
    expect(() => validateArtifactFiles([{ path: "index.html", content: "x" }, { path: "run.sh", content: "x" }], "STATIC_SITE")).toThrow(DeliverableValidationError);
    expect(() => validateArtifactFiles([{ path: "index.html", content: "x".repeat(2_000_000) }], "STATIC_SITE")).toThrow(DeliverableValidationError);
    expect(() => validateArtifactFiles([{ path: "styles.css", content: "x" }], "STATIC_SITE")).toThrow(/index.html/);
    expect(() => validateArtifactFiles([{ path: "index.html", content: "<!doctype html>" }, { path: "styles.css", content: "body{}" }], "STATIC_SITE")).not.toThrow();
  });

  it("rejects unsafe storage keys", () => {
    expect(() => assertSafeKey("../etc/passwd")).toThrow();
    expect(() => assertSafeKey("/abs/path")).toThrow();
    expect(() => assertSafeKey("deliverables/c1/1/index.html")).not.toThrow();
  });
});
