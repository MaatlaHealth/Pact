import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { storage, contentTypeFor } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * Serves deliverable files for verification and owner preview. The preview
 * token is unguessable, nothing is executed server-side, and the CSP confines
 * the page to its own files plus the form-capture endpoint. HTML is served
 * from the same origin so Playwright and Lighthouse can measure it as a real
 * page, but the sandbox directive stops it from reaching the application.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ token: string; path: string[] }> }) {
  const { token, path } = await ctx.params;
  const relative = path.join("/");
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_\-./]{0,160}$/.test(relative) || relative.includes("..")) return new NextResponse("Not found", { status: 404 });
  const deliverable = await db.deliverable.findUnique({ where: { previewToken: token }, select: { storagePrefix: true, manifest: true } });
  if (!deliverable) return new NextResponse("Not found", { status: 404 });
  const manifest = deliverable.manifest as { files: { path: string; contentType: string }[] };
  const entry = manifest.files.find((f) => f.path === relative);
  if (!entry) return new NextResponse("Not found", { status: 404 });
  const object = await storage().get(`${deliverable.storagePrefix}/${relative}`);
  if (!object) return new NextResponse("Not found", { status: 404 });
  const contentType = entry.contentType || contentTypeFor(relative) || object.contentType;
  const headers: Record<string, string> = {
    "Content-Type": contentType,
    "Cache-Control": "public, max-age=300",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  };
  if (contentType.startsWith("text/html")) {
    headers["Content-Security-Policy"] = `sandbox allow-forms allow-scripts allow-same-origin; default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; form-action 'self'; frame-ancestors 'self'; base-uri 'none'; object-src 'none'`;
  }
  return new NextResponse(new Uint8Array(object.body), { status: 200, headers });
}
