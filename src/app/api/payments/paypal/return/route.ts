import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/auth/session";
import { completePayerApproval } from "@/lib/payments/service";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * PayPal sends the payer back here after approval with ?token=<order id>.
 * The order is authorized server-side; the payer's return alone proves
 * nothing, so the status is read from PayPal before any state changes.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const contractId = url.searchParams.get("contract");
  const paypalOrderId = url.searchParams.get("token");
  const base = env().APP_URL;
  if (!contractId || !paypalOrderId) return NextResponse.redirect(`${base}/app?payment=invalid`);
  const auth = await getAuthContext();
  const contract = await db.contract.findUnique({ where: { id: contractId }, select: { organizationId: true } });
  if (!contract || !auth || !auth.memberships.some((m) => m.id === contract.organizationId)) {
    return NextResponse.redirect(`${base}/sign-in?next=${encodeURIComponent(`/api/payments/paypal/return?contract=${contractId}&token=${paypalOrderId}`)}`);
  }
  try {
    const result = await completePayerApproval(contractId, paypalOrderId, { type: "USER", id: auth.user.id, label: auth.user.name });
    return NextResponse.redirect(`${base}/app/contracts/${contractId}?payment=${result.status}`);
  } catch (error) {
    logger.error("PayPal return handling failed", { contractId, error: String(error) });
    const message = error instanceof Error ? error.message : "unknown";
    return NextResponse.redirect(`${base}/app/contracts/${contractId}?payment=error&message=${encodeURIComponent(message.slice(0, 200))}`);
  }
}
