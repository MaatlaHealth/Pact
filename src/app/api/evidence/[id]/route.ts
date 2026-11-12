import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/respond";
import { HttpError } from "@/lib/security/request";
import { requirePrincipal } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { storage } from "@/lib/storage";
import { hashBytes } from "@/lib/contracts/canonical";

export const dynamic = "force-dynamic";

/** Streams an evidence object to members of the owning organization after re-checking its hash. */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const principal = await requirePrincipal(request, "VIEWER");
    const { id } = await ctx.params;
    const evidence = await db.evidenceRecord.findFirst({ where: { id, verificationRun: { contract: { organizationId: principal.organization.id } } } });
    if (!evidence || !evidence.storageKey) throw new HttpError(404, "Evidence not found.");
    const object = await storage().get(evidence.storageKey);
    if (!object) throw new HttpError(404, "Evidence file missing from storage.");
    const hash = hashBytes(object.body);
    if (hash !== evidence.contentHash) throw new HttpError(409, "Stored evidence does not match its recorded hash.", "evidence_tampered");
    const inline = new URL(request.url).searchParams.get("download") !== "1";
    return new NextResponse(new Uint8Array(object.body), { headers: { "Content-Type": evidence.mimeType, "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${evidence.id}.${evidence.mimeType === "image/png" ? "png" : "json"}"`, "X-Evidence-Hash": evidence.contentHash, "Content-Security-Policy": "default-src 'none'" } });
  } catch (error) {
    return errorResponse(error);
  }
}
