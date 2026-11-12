import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

/**
 * Server-side request forgery protection for any URL the platform fetches on
 * behalf of an agent or user. Private, loopback, link-local, and metadata
 * ranges are rejected, and redirects are re-checked hop by hop.
 */

const BLOCKED_HOSTNAMES = new Set(["localhost", "metadata.google.internal", "metadata", "instance-data"]);

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

function inCidr(ip: string, cidr: string): boolean {
  const [range, bitsStr] = cidr.split("/");
  const bits = Number(bitsStr);
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(range) & mask);
}

const PRIVATE_V4 = [
  "0.0.0.0/8",
  "10.0.0.0/8",
  "100.64.0.0/10",
  "127.0.0.0/8",
  "169.254.0.0/16",
  "172.16.0.0/12",
  "192.0.0.0/24",
  "192.168.0.0/16",
  "198.18.0.0/15",
  "224.0.0.0/4",
  "240.0.0.0/4",
];

export function isPrivateAddress(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return PRIVATE_V4.some((cidr) => inCidr(ip, cidr));
  if (version === 6) {
    const lower = ip.toLowerCase();
    if (lower === "::1" || lower === "::") return true;
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique local
    if (lower.startsWith("fe80")) return true; // link local
    if (lower.startsWith("::ffff:")) return isPrivateAddress(lower.slice(7)); // mapped v4
    return false;
  }
  return true;
}

export interface UrlPolicy {
  /** Hostnames that are allowed even if they resolve privately (for example the app's own preview host in development). */
  allowHosts?: string[];
  allowHttp?: boolean;
}

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

/**
 * Validates a URL for outbound fetching. Resolves DNS and rejects private
 * targets. Returns the parsed URL on success.
 */
export async function assertSafeUrl(input: string, policy: UrlPolicy = {}): Promise<URL> {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new UnsafeUrlError("Malformed URL.");
  }
  if (url.protocol !== "https:" && !(policy.allowHttp && url.protocol === "http:")) {
    throw new UnsafeUrlError(`Protocol ${url.protocol} is not allowed.`);
  }
  if (url.username || url.password) throw new UnsafeUrlError("Credentials in URLs are not allowed.");
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (policy.allowHosts?.includes(host)) return url;
  if (BLOCKED_HOSTNAMES.has(host)) throw new UnsafeUrlError("Host is not allowed.");
  if (isIP(host)) {
    if (isPrivateAddress(host)) throw new UnsafeUrlError("Private network addresses are not allowed.");
    return url;
  }
  let addresses: { address: string }[];
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    throw new UnsafeUrlError("Host could not be resolved.");
  }
  if (addresses.length === 0) throw new UnsafeUrlError("Host could not be resolved.");
  for (const { address } of addresses) {
    if (isPrivateAddress(address)) throw new UnsafeUrlError("Host resolves to a private network address.");
  }
  return url;
}

/**
 * fetch with SSRF checks on every redirect hop and a hard timeout.
 */
export async function safeFetch(
  input: string,
  init: RequestInit & { timeoutMs?: number; maxRedirects?: number; policy?: UrlPolicy } = {},
): Promise<Response> {
  const { timeoutMs = 15000, maxRedirects = 5, policy, ...rest } = init;
  let current = input;
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    await assertSafeUrl(current, policy);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(current, { ...rest, redirect: "manual", signal: controller.signal });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) return response;
        current = new URL(location, current).toString();
        continue;
      }
      return response;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new UnsafeUrlError("Too many redirects.");
}
