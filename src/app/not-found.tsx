import Link from "next/link";
import { Logo } from "@/components/brand";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <Logo />
      <h1 className="mt-8 text-2xl font-semibold text-ink">Page not found</h1>
      <p className="mt-2 max-w-sm text-sm text-muted">The page does not exist or belongs to a workspace you cannot access.</p>
      <div className="mt-6 flex gap-3 text-sm">
        <Link href="/" className="rounded-lg border border-border px-4 py-2 font-medium text-ink hover:border-border-strong">
          Home
        </Link>
        <Link href="/app" className="rounded-lg bg-[#0b2a5b] px-4 py-2 font-medium text-white dark:bg-[#2fd4c2] dark:text-[#0a1628]">
          Open the app
        </Link>
      </div>
    </main>
  );
}
