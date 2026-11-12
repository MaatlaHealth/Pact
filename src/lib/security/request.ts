import { env } from "@/lib/env";

/**
 * Cross-site request forgery protection for state-changing requests.
 * Sessions use SameSite=Lax cookies; this adds an Origin check so a
 * cross-site form post is rejected even in browsers that ignore SameSite.
 */
export function assertSameOrigin(request: Request): void {
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return;
  // API-key authenticated requests carry no cookie and are not CSRF targets.
  if (request.headers.get("authorization")?.startsWith("Bearer ")) return;
  const origin = request.headers.get("origin");
  const appOrigin = new URL(env().APP_URL).origin;
  const requestOrigin = new URL(request.url).origin;
  if (!origin) {
    // Non-browser clients omit Origin. Browsers always send it for cross-site POSTs.
    const fetchSite = request.headers.get("sec-fetch-site");
    if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
      throw new HttpError(403, "Cross-site request rejected.");
    }
    return;
  }
  if (origin !== appOrigin && origin !== requestOrigin) {
    throw new HttpError(403, "Cross-site request rejected.");
  }
}

export class HttpError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(status: number, message: string, code?: string, details?: unknown) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code ?? defaultCode(status);
    this.details = details;
  }
}

function defaultCode(status: number): string {
  switch (status) {
    case 400:
      return "bad_request";
    case 401:
      return "unauthorized";
    case 403:
      return "forbidden";
    case 404:
      return "not_found";
    case 409:
      return "conflict";
    case 422:
      return "validation_failed";
    case 429:
      return "rate_limited";
    case 503:
      return "service_unavailable";
    default:
      return "error";
  }
}
