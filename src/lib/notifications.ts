import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { sendEmail, type EmailKind } from "@/lib/email/service";

/**
 * Sends a notification email to the owners and admins of a workspace.
 * Delivery results are returned so callers can record them if needed.
 */
export async function notifyWorkspace(organizationId: string, message: { kind: EmailKind; subject: string; heading: string; paragraphs: string[]; contractId?: string }) {
  const members = await db.membership.findMany({ where: { organizationId, role: { in: ["OWNER", "ADMIN"] } }, include: { user: true } });
  const url = message.contractId ? `${env().APP_URL}/app/contracts/${message.contractId}` : `${env().APP_URL}/app`;
  const results = [];
  for (const member of members) {
    if (!member.user.emailVerifiedAt) continue;
    results.push(
      await sendEmail({
        to: member.user.email,
        subject: message.subject,
        heading: message.heading,
        paragraphs: message.paragraphs,
        action: { label: message.contractId ? "Open contract" : "Open PACT", url },
        kind: message.kind,
      }),
    );
  }
  return results;
}
