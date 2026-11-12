import type { Metadata } from "next";
import { VerifyEmailPanel } from "@/components/auth/forms";
import { getAuthContext } from "@/lib/auth/session";
import { emailDeliveryConfigured } from "@/lib/email/service";

export const metadata: Metadata = { title: "Verify email" };
export const dynamic = "force-dynamic";

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const ctx = await getAuthContext();
  return <VerifyEmailPanel initialToken={token ?? null} emailConfigured={emailDeliveryConfigured()} verified={Boolean(ctx?.user.emailVerifiedAt)} email={ctx?.user.email ?? null} />;
}
