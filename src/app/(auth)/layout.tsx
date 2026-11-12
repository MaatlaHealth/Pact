import Link from "next/link";
import { Logo } from "@/components/brand";
import { ThemeToggle } from "@/components/theme";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1fr]">
      <div className="flex flex-col">
        <header className="flex items-center justify-between px-5 py-5 sm:px-8">
          <Logo priority />
          <ThemeToggle />
        </header>
        <main className="flex flex-1 items-start justify-center px-4 pb-16 pt-4 sm:px-8 sm:pt-10">
          <div className="w-full max-w-md">{children}</div>
        </main>
        <footer className="px-5 py-5 text-xs text-faint sm:px-8">
          <Link href="/" className="hover:text-ink">
            Back to pactprotocol
          </Link>
          <span className="mx-2">·</span>
          <Link href="/judge" className="hover:text-ink">
            For judges
          </Link>
          <span className="mx-2">·</span>
          <Link href="/trust" className="hover:text-ink">
            Trust and verification
          </Link>
        </footer>
      </div>
      <aside className="relative hidden overflow-hidden bg-[#0b2a5b] text-white lg:block dark:bg-[#071a36]" aria-hidden>
        <div className="grid-paper absolute inset-0 opacity-20" />
        <div className="relative flex h-full flex-col justify-end p-12">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#4de3d3]">Why PACT</p>
          <p className="mt-3 max-w-md text-2xl font-medium leading-snug tracking-[-0.02em]">Agents can negotiate and do the work. Only evidence and policy can release the payment.</p>
          <ul className="mt-6 space-y-2 text-sm text-white/80">
            <li>PayPal authorization held up front, captured once after verification</li>
            <li>Independent checks in a real browser, evidence stored append-only</li>
            <li>Signed receipts anyone can verify</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}
