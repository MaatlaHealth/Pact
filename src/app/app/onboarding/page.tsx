import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireSignedIn } from "@/lib/auth/app-context";
import { CreateWorkspaceForm } from "@/components/app/create-workspace";

export const metadata: Metadata = { title: "Create a workspace" };

export default async function OnboardingPage() {
  const ctx = await requireSignedIn();
  if (ctx.organization) redirect("/app");
  return (
    <div className="mx-auto max-w-lg py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Create your workspace</h1>
      <p className="mt-2 text-sm text-muted">A workspace holds a spending policy, contracts, approvals, payments, and receipts. You become its owner and can invite others later.</p>
      <div className="mt-6">
        <CreateWorkspaceForm />
      </div>
    </div>
  );
}
