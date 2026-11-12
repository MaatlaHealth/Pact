import type { Metadata } from "next";
import { AcceptInvitationPanel } from "@/components/auth/forms";
import { getAuthContext } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Invitation" };
export const dynamic = "force-dynamic";

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await getAuthContext();
  return <AcceptInvitationPanel token={token} signedIn={Boolean(ctx?.user.emailVerifiedAt)} />;
}
