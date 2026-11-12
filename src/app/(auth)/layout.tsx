import Link from "next/link";
import { Logo } from "@/components/brand";
import { ThemeToggle } from "@/components/theme";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col">
      <div className="grid-paper absolute inset-0 -z-10 opacity-50" aria-hidden />
      <header className="flex items-center justify-between px-5 py-5">
        <Logo priority />
        <ThemeToggle />
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pb-16 pt-6 sm:pt-12">
        <div className="w-full max-w-md">{children}</div>
      </main>
      <footer className="px-5 py-5 text-center text-xs text-faint">
        <Link href="/" className="hover:text-ink">
          Back to pactprotocol
        </Link>
        <span className="mx-2">·</span>
        <Link href="/trust" className="hover:text-ink">
          Trust and verification
        </Link>
      </footer>
    </div>
  );
}
