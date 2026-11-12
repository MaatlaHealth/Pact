import { Resend } from "resend";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

export type EmailKind =
  | "verification"
  | "password_reset"
  | "invitation"
  | "contract_update"
  | "payment_status"
  | "verification_outcome"
  | "approval_request";

export interface EmailMessage {
  to: string;
  subject: string;
  heading: string;
  paragraphs: string[];
  action?: { label: string; url: string };
  kind: EmailKind;
}

export interface EmailResult {
  delivered: boolean;
  provider: "resend" | "log";
  providerMessageId?: string;
  error?: string;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

export function renderEmailHtml(message: EmailMessage): string {
  const paragraphs = message.paragraphs.map((p) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#1f2a44">${escapeHtml(p)}</p>`).join("");
  const action = message.action
    ? `<p style="margin:24px 0"><a href="${escapeHtml(message.action.url)}" style="display:inline-block;background:#0b2a5b;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">${escapeHtml(message.action.label)}</a></p><p style="font-size:12px;color:#5b6b8a">If the button does not work, copy this link: ${escapeHtml(message.action.url)}</p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#f4f7fb;font-family:Segoe UI,Helvetica,Arial,sans-serif"><div style="max-width:560px;margin:32px auto;background:#ffffff;border-radius:12px;padding:32px;border:1px solid #e3e9f2"><div style="font-weight:700;color:#0b2a5b;font-size:18px;margin-bottom:24px">PACT Protocol</div><h1 style="font-size:22px;color:#0b2a5b;margin:0 0 16px">${escapeHtml(message.heading)}</h1>${paragraphs}${action}<hr style="border:none;border-top:1px solid #e3e9f2;margin:24px 0"><p style="font-size:12px;color:#5b6b8a;margin:0">Autonomous work. Verified outcomes. Accountable payments.</p></div></body></html>`;
}

export function renderEmailText(message: EmailMessage): string {
  const lines = [message.heading, "", ...message.paragraphs];
  if (message.action) lines.push("", `${message.action.label}: ${message.action.url}`);
  return lines.join("\n");
}

let resendClient: Resend | undefined;

/**
 * Sends an email through Resend when configured. Otherwise the message is
 * written to the server log so a developer can complete flows locally. The
 * result says which happened, and the UI relays that to the user.
 */
export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  const e = env();
  if (!e.RESEND_API_KEY) {
    logger.warn("Email not configured. Message written to log.", { kind: message.kind, to: message.to, subject: message.subject });
    if (message.action) logger.plain(`EMAIL NOT CONFIGURED. ${message.kind} link for ${message.to}: ${message.action.url}`);
    return { delivered: false, provider: "log" };
  }
  resendClient ??= new Resend(e.RESEND_API_KEY);
  try {
    const result = await resendClient.emails.send({
      from: e.EMAIL_FROM,
      to: message.to,
      subject: message.subject,
      html: renderEmailHtml(message),
      text: renderEmailText(message),
    });
    if (result.error) {
      logger.error("Resend rejected message", { error: result.error.message, kind: message.kind });
      return { delivered: false, provider: "resend", error: result.error.message };
    }
    return { delivered: true, provider: "resend", providerMessageId: result.data?.id };
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    logger.error("Email delivery failed", { error: messageText, kind: message.kind });
    return { delivered: false, provider: "resend", error: messageText };
  }
}

export function emailDeliveryConfigured(): boolean {
  return Boolean(env().RESEND_API_KEY);
}
