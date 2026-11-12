import type { Metadata } from "next";
import { Section, Eyebrow, H2, Lead } from "@/components/marketing/sections";
import { ReceiptVerifier } from "@/components/receipts/verifier";

export const metadata: Metadata = { title: "Verify a receipt", description: "Check a Proof of Work Receipt's signature, hash, evidence references, and payment record." };

export default function VerifyReceiptPage() {
  return (
    <Section>
      <Eyebrow>Proof of Work Receipts</Eyebrow>
      <H2>Verify a receipt</H2>
      <Lead>Paste the JSON receipt you downloaded from PACT. Verification runs on the server against the published signing key and the platform&apos;s append-only evidence records. No account is needed.</Lead>
      <div className="mt-8">
        <ReceiptVerifier />
      </div>
    </Section>
  );
}
