import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { handler, ok } from "@/lib/api/respond";
import { HttpError } from "@/lib/security/request";
import { requirePrincipal } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { renderReceiptPdf } from "@/lib/receipts/pdf";
import type { SignedReceipt, ReceiptPayload } from "@/lib/receipts/service";

export const GET = handler(async (request, ctx: { params: Promise<{ number: string }> }) => {
  const principal = await requirePrincipal(request, "VIEWER");
  const { number } = await ctx.params;
  const format = new URL(request.url).searchParams.get("format") ?? "json";
  const receipt = await db.receipt.findFirst({ where: { receiptNumber: number, organizationId: principal.organization.id }, include: { signingKey: true } });
  if (!receipt) throw new HttpError(404, "Receipt not found.");
  const signed: SignedReceipt = { payload: receipt.payload as unknown as ReceiptPayload, payloadHash: receipt.payloadHash, signature: receipt.signature, signingKeyId: receipt.signingKeyId, algorithm: "Ed25519", publicKeyPem: receipt.signingKey.publicKeyPem };
  if (format === "pdf") {
    const logo = await fs.readFile(path.join(process.cwd(), "public", "brand", "pact-logo.png")).catch(() => undefined);
    const pdf = await renderReceiptPdf(signed, { verifyUrl: `${env().APP_URL}/receipts/verify`, logoPng: logo });
    return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${number}.pdf"` } });
  }
  if (format === "download") {
    return new NextResponse(JSON.stringify(signed, null, 2), { headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="${number}.json"` } });
  }
  return ok({ receipt: signed });
});
