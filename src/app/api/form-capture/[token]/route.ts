import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { rateLimit, clientIp } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Controlled destination for contact forms inside generated deliverables.
 * Every submission is stored against the deliverable's preview token, which
 * is what the verifier's contact-form check reads back. Rendering a plain
 * confirmation page keeps the browser flow realistic.
 */
export async function POST(request: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const limit = await rateLimit(`form-capture:${clientIp(request)}`, 60, 600);
  if (!limit.allowed) return NextResponse.json({ error: "Too many submissions." }, { status: 429 });
  const deliverable = await db.deliverable.findUnique({ where: { previewToken: token }, select: { id: true, contractId: true } });
  if (!deliverable) return NextResponse.json({ error: "Unknown form endpoint." }, { status: 404 });

  const contentType = request.headers.get("content-type") ?? "";
  let payload: Record<string, unknown> = {};
  if (contentType.includes("application/json")) {
    payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  } else {
    const form = await request.formData().catch(() => null);
    if (form) for (const [k, v] of form.entries()) payload[k] = typeof v === "string" ? v.slice(0, 2000) : "[file]";
  }
  const trimmed: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload).slice(0, 30)) trimmed[k.slice(0, 60)] = v;

  await db.formCapture.create({ data: { contractId: deliverable.contractId, deliverableId: deliverable.id, token, payload: trimmed as Prisma.InputJsonValue, userAgent: request.headers.get("user-agent")?.slice(0, 300) ?? null } });

  if (request.headers.get("accept")?.includes("application/json")) return NextResponse.json({ received: true });
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Message received</title><style>body{font-family:system-ui,sans-serif;background:#f4f7fb;color:#1f2a44;display:grid;place-items:center;min-height:100vh;margin:0}main{background:#fff;padding:32px;border-radius:12px;border:1px solid #e3e9f2;max-width:420px}h1{color:#0b2a5b;font-size:20px;margin:0 0 8px}p{margin:0;color:#5b6b8a}</style></head><body><main><h1>Message received</h1><p>Thank you. Your submission was recorded by the PACT verification endpoint.</p></main></body></html>`;
  return new NextResponse(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'", "X-Frame-Options": "DENY" } });
}
